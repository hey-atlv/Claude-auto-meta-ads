import { collection, doc, getDoc, getDocs, setDoc, writeBatch, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { parseCampaignName } from './campaignParser';
import { syncContentMatrixData } from './syncContentMatrixData';

export interface SheetConfig {
  id: string;
  name: string;
  spreadsheetId: string;
  sheetName: string;
  apiKey: string;
  isActive: boolean;
}

// Cooldown in ms to prevent accidental double-syncs
const SYNC_COOLDOWN = 5000; // 5 seconds
const lastSyncTimes = new Map<string, number>();

const deterministicStringify = (obj: any): string => {
  if (!obj || typeof obj !== 'object') return String(obj);
  return JSON.stringify(Object.keys(obj).sort().reduce((res: any, key) => {
    res[key] = obj[key];
    return res;
  }, {}));
};

const withTimeout = <T>(promise: Promise<T>, ms: number, errorMessage = 'Operation timed out'): Promise<T> => {
  // Enforce a minimum 60s timeout. Firestore sometimes enters internal backoff/retry
  // when it hits Quota limits (resource-exhausted). If we time out too early, we mask 
  // the real quota error with our own timeout string. We give it 60s to either succeed or throw.
  const actualMs = Math.max(ms, 60000); 
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(errorMessage + ' (Firestore có thể đang kẹt Quota)')), actualMs))
  ]);
};

export const syncSheetData = async (config: SheetConfig, onProgress?: (msg: string) => void) => {
  const now = Date.now();
  const lastSyncTime = lastSyncTimes.get(config.id) || 0;
  
  if (now - lastSyncTime < SYNC_COOLDOWN) {
    const remaining = Math.ceil((SYNC_COOLDOWN - (now - lastSyncTime)) / 1000);
    throw new Error(`Vui lòng đợi ${remaining} giây trước khi đồng bộ lại để bảo vệ hạn mức dữ liệu.`);
  }

  const log = (msg: string) => {
    console.log(msg);
    if (onProgress) onProgress(msg);
  };
  
  if (config.name.includes("META_ADS_MASTER_DATABASE_CONTENT") || config.sheetName === "ID FB") {
    lastSyncTimes.set(config.id, now);
    return await syncContentMatrixData(config, log);
  }

  log('Đang kết nối Google Sheets...');

  
  try {
    // Record start time to handle cooldown
    lastSyncTimes.set(config.id, now);
    // 1. Fetch Ads Data
    const proxyUrl = `/api/proxy-sheets?spreadsheetId=${config.spreadsheetId}&sheetName=${encodeURIComponent(config.sheetName)}&apiKey=${config.apiKey}`;
    const response = await fetch(proxyUrl);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData?.error?.message || response.statusText;
      throw new Error(`Lỗi API: ${errorMsg}`);
    }
    
    const data = await response.json();
    const rows = data.values;
    
    if (!rows || rows.length < 2) {
      throw new Error("Không có dữ liệu hoặc thiếu dòng tiêu đề.");
    }

    log(`Đã tải ${rows.length - 1} dòng. Đang xử lý dữ liệu...`);

    const normalizeHeader = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const headers = rows[0].map(normalizeHeader);
    
    const getIdx = (name: string) => {
      const normalizedName = normalizeHeader(name);
      return headers.findIndex((h: string) => h.includes(normalizedName));
    };
    
    const chunks = [];
    let currentBatch = writeBatch(db);
    let operationCount = 0;
    const BATCH_SIZE = 400; // Optimal batch size for speed and quota
    const DELAY_BETWEEN_BATCHES = 200; // 0.2s delay to avoid bursting

    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    const robustParseNum = (val: any) => {
      if (val === undefined || val === null || val === '') return 0;
      if (typeof val === 'number') return val;
      let strVal = String(val).trim();
      
      const isPercent = strVal.includes('%');
      strVal = strVal.replace('%', '');
      
      // Remove symbols
      strVal = strVal.replace(/[^\d.,-]/g, '');
      
      const hasComma = strVal.includes(',');
      const hasDot = strVal.includes('.');
      
      if (hasComma && hasDot) {
        if (strVal.lastIndexOf(',') > strVal.lastIndexOf('.')) {
          strVal = strVal.replace(/\./g, '').replace(',', '.');
        } else {
          strVal = strVal.replace(/,/g, '');
        }
      } else if (hasComma) {
        const parts = strVal.split(',');
        if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
          strVal = strVal.replace(/,/g, '');
        } else {
          strVal = strVal.replace(',', '.');
        }
      } else if (hasDot) {
        const parts = strVal.split('.');
        if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
          strVal = strVal.replace(/\./g, '');
        }
      }
      
      if ((strVal.match(/\./g) || []).length > 1) {
        strVal = strVal.replace(/\./g, '');
      }
      
      let num = parseFloat(strVal);
      if (isNaN(num)) return 0;
      return isPercent ? num / 100 : num;
    };

    const formatSheetDate = (val: any) => {
      if (!val) return '';
      const strVal = String(val).trim().replace(/-/g, '/').replace(/\./g, '/');
      
      if (/^\d{4}\/\d{2}\/\d{2}$/.test(strVal)) return strVal.replace(/\//g, '-');
      
      const dmyMatch = strVal.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (dmyMatch) {
        const d = dmyMatch[1].padStart(2, '0');
        const m = dmyMatch[2].padStart(2, '0');
        const y = dmyMatch[3];
        return `${y}-${m}-${d}`;
      }
      
      const ymdMatch = strVal.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
      if (ymdMatch) {
        const y = ymdMatch[1];
        const m = ymdMatch[2].padStart(2, '0');
        const d = ymdMatch[3].padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
      
      try {
        const d = new Date(strVal);
        if (!isNaN(d.getTime())) {
          return d.toISOString().split('T')[0];
        }
      } catch (e) {}
      
      return strVal;
    };

    // OPTIMIZATION: Only fetch recent records from Firestore to compare and avoid unnecessary writes
    // config.hasSyncedHistorical determines if we should process old records
    const configDocRef = doc(db, 'sheetsConfigs', config.id);
    const configDocSnap = await getDoc(configDocRef);
    const hasSyncedHistorical = configDocSnap.exists() && configDocSnap.data().hasSyncedHistorical === true;
    
    let minDateToSync = '2000-01-01'; // Default: sync all
    if (hasSyncedHistorical) {
      const d = new Date();
      d.setDate(d.getDate() - 40); // Only process last 40 days to be safe
      minDateToSync = d.toISOString().split('T')[0];
    }
    
    log(`Đang so sánh dữ liệu (Từ: ${hasSyncedHistorical ? minDateToSync : 'Tất cả'})...`);
    
    // Fetch existing records for the time range to compare
    // We fetch in 1 chunk if we can, but adsData could be big. Limit to what's necessary:
    const existingAdsMap = new Map();
    try {
      let q = query(collection(db, 'adsData'));
      // For performance, we fetch ALL recent ids for comparison
      // To save quota, we only fetch records AFTER minDateToSync if hasSyncedHistorical is true
      if (hasSyncedHistorical) {
        q = query(collection(db, 'adsData'), where('date', '>=', minDateToSync));
      }
      const querySnapshot = await withTimeout(getDocs(q), 10000, 'Lấy dữ liệu adsData hiện tại quá lâu. Kiểm tra kết nối.'); 
      // Note: if there are 20k rows, reading all costs 20k reads. It's better than 20k WRITES which scale up much worse and hit limit at 20k/day. Reads limit is 50k/day.
      querySnapshot.forEach(docSnap => {
         const data = docSnap.data();
         // Storing stringified version WITHOUT updatedAt to compare
         const { updatedAt: _, ...rest } = data;
         existingAdsMap.set(docSnap.id, deterministicStringify(rest));
      });
    } catch(e) {
      console.warn("Could not pre-fetch existing ads data, will overwrite.", e);
    }

    let skipCount = 0;
    let writeCount = 0;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      
      const dateRaw = row[getIdx('date')] || '';
      const date = formatSheetDate(dateRaw);
      const account_id = row[getIdx('account_id')] || '';
      const campaign_id = row[getIdx('campaign_id')] || '';
      const campaign_name = row[getIdx('campaign_name')] || '';
      const ad_id = row[getIdx('ad_id')] || '';
      
      if (!date || !account_id || !campaign_id) continue;
      
      if (hasSyncedHistorical && date < minDateToSync) {
        continue; // Skip processing old records! Very fast!
      }

      const parsedCampaign = parseCampaignName(campaign_name);

      const docData = {
        date,
        account_id,
        account_name: row[getIdx('account_name')] || '',
        campaign_id,
        campaign_name,
        adset_id: row[getIdx('adset_id')] || '',
        adset_name: row[getIdx('adset_name')] || '',
        ad_id,
        ad_name: row[getIdx('ad_name')] || '',
        spend: robustParseNum(row[getIdx('amount_spent')]),
        impressions: robustParseNum(row[getIdx('impressions')]),
        reach: robustParseNum(row[getIdx('reach')]),
        frequency: robustParseNum(row[getIdx('frequency')]),
        clicks: robustParseNum(row[getIdx('clicks')] || row[getIdx('clicks_all')]),
        ctr_all: robustParseNum(row[getIdx('ctr_all')]),
        cpm: robustParseNum(row[getIdx('cpm')]),
        purchases: robustParseNum(row[getIdx('purchases')]),
        cost_per_purchase: robustParseNum(row[getIdx('cost_per_purchase')]),
        messages: robustParseNum(row[getIdx('messaging_conversations_started')]),
        cost_per_messaging_conversation: robustParseNum(row[getIdx('cost_per_messaging_conversation')]),
        revenue: robustParseNum(row[getIdx('revenue')]),
        leads: robustParseNum(row[getIdx('leads')]),
        ...parsedCampaign
      };

      // Create a stable unique ID based on content, not row index
      const adPart = ad_id || (row[getIdx('ad_name')] || 'no-ad').substring(0, 50).replace(/[^a-z0-9]/gi, '_');
      const uniqueId = `${date}_${account_id}_${campaign_id}_${adPart}`;
      
      // OPTIMIZATION: Compare with existing
      const newDataStr = deterministicStringify(docData);
      if (existingAdsMap.get(uniqueId) === newDataStr) {
        skipCount++;
        continue; // Exact match, skip writing!
      }

      const docRef = doc(db, 'adsData', uniqueId);
      currentBatch.set(docRef, { ...docData, updatedAt: Date.now() });
      operationCount++;
      writeCount++;

      if (operationCount === BATCH_SIZE) {
        chunks.push(currentBatch);
        currentBatch = writeBatch(db);
        operationCount = 0;
        // Yield to browser thread slightly more often if doing massive work
        await sleep(10); 
      }
    }

    if (operationCount > 0) {
      chunks.push(currentBatch);
    }

    log(`Hoàn thành so sánh. Sẽ ghi đè/thêm mới ${writeCount} dòng, bỏ qua ${skipCount} dòng đã có sẵn. Đang lưu...`);

    for (let i = 0; i < chunks.length; i++) {
      log(`Đang lưu phần ${i + 1}/${chunks.length}... (${writeCount} dòng mới)`);
      if (i > 0) await sleep(DELAY_BETWEEN_BATCHES); // ensure delay before
      await withTimeout(chunks[i].commit(), 15000, 'Lưu hàng chục batch quá lâu, Firebase không phản hồi');
    }
    
    // Mark as having synced history
    if (!hasSyncedHistorical) {
      await withTimeout(setDoc(configDocRef, { hasSyncedHistorical: true }, { merge: true }), 10000, 'Lưu trạng thái sync thất bại');
    }

    // 2. Sync Config Tab
    log('Đang đồng bộ danh sách Tài khoản (tab Config)...');
    try {
      const configProxyUrl = `/api/proxy-sheets?spreadsheetId=${config.spreadsheetId}&sheetName=${encodeURIComponent('Config')}&apiKey=${config.apiKey}`;
      const configRes = await fetch(configProxyUrl);
      if (configRes.ok) {
        const configData = await configRes.json();
        const configRows = configData.values;
        if (configRows && configRows.length > 1) {
          const normalize = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          const headers = configRows[0].map(normalize);
          const getIdx = (name: string) => headers.indexOf(normalize(name));
          
          const existingAccsRaw = await withTimeout(getDocs(collection(db, 'adAccounts')), 10000, 'Lỗi get adAccounts');
          const existingAccs = new Map(existingAccsRaw.docs.map(d => [d.id, d.data()]));
          
          let accountBatch = writeBatch(db);
          let accOpCount = 0;
          const safeStr = (val: any, maxLen: number) => String(val || '').substring(0, maxLen);
          
          for (let i = 1; i < configRows.length; i++) {
            const row = configRows[i];
            const accIdRaw = row[getIdx('account_id')];
            const accId = String(accIdRaw || '').trim();
            if (!accId) continue;
            
            const docId = encodeURIComponent(accId.replace(/[\/\s]/g, '_'));
            const docRef = doc(db, 'adAccounts', docId);
            
            const newData = {
              account_id: safeStr(accId, 90),
              account_name: safeStr(row[getIdx('account_name')], 190),
              status: safeStr(row[getIdx('status')], 90),
              bm_name: safeStr(row[getIdx('bm_name')], 190),
              Company_name: safeStr(row[getIdx('company_name')], 190),
              Partner_name: safeStr(row[getIdx('partner_name')], 190),
              Ads_name: safeStr(row[getIdx('ads_name')], 190),
              Bank_name: safeStr(row[getIdx('bank_name')], 190),
              number_card: safeStr(row[getIdx('number_card')], 90),
              updatedAt: Date.now()
            };

            // Skip if data is identical (ignoring updatedAt)
            const existing = existingAccs.get(docId);
            if (existing) {
              const { updatedAt: _, ...restExisting } = existing;
              const { updatedAt: __, ...restNew } = newData;
              if (JSON.stringify(restExisting) === JSON.stringify(restNew)) {
                continue;
              }
            }
            
            accountBatch.set(docRef, newData);
            accOpCount++;
            if (accOpCount === BATCH_SIZE) {
              await withTimeout(accountBatch.commit(), 10000, 'Lỗi lưu batch accounts');
              await sleep(DELAY_BETWEEN_BATCHES);
              accountBatch = writeBatch(db);
              accOpCount = 0;
            }
          }
          if (accOpCount > 0) {
            await withTimeout(accountBatch.commit(), 10000, 'Lỗi lưu accounts cuối');
          }
        }
      }
    } catch (err) {
      console.error("Lỗi khi đồng bộ tab Config:", err);
    }

    // 3. Sync Fanpage Tab
    log('Đang dọn dẹp dữ liệu cũ và đồng bộ danh sách Fanpage (tab Seryn Page)...');
    try {
      const fanpagesSnapshot = await withTimeout(getDocs(collection(db, 'fanpages')), 10000, 'Lỗi get fanpages');
      let deleteBatch = writeBatch(db);
      let deleteCount = 0;
      
      for (const docSnap of fanpagesSnapshot.docs) {
        const data = docSnap.data();
        if (!data.page_name || String(data.page_name).trim() === '') {
          deleteBatch.delete(docSnap.ref);
          deleteCount++;
          if (deleteCount === BATCH_SIZE) {
            await withTimeout(deleteBatch.commit(), 10000, 'Lỗi xoá batch fanpage');
            await sleep(DELAY_BETWEEN_BATCHES);
            deleteBatch = writeBatch(db);
            deleteCount = 0;
          }
        }
      }
      if (deleteCount > 0) {
        await withTimeout(deleteBatch.commit(), 10000, 'Lỗi xoá batch fanpage cuối');
      }

      const pageProxyUrl = `/api/proxy-sheets?spreadsheetId=${config.spreadsheetId}&sheetName=${encodeURIComponent('Seryn Page')}&apiKey=${config.apiKey}`;
      const pageRes = await fetch(pageProxyUrl);
      if (pageRes.ok) {
        const pageData = await pageRes.json();
        const pageRows = pageData.values;
        if (pageRows && pageRows.length > 1) {
          const normalize = (str: string) => str ? String(str).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "") : '';
          
          let headerRowIdx = 0;
          for (let r = 0; r < Math.min(5, pageRows.length); r++) {
            const rowStr = pageRows[r].map(normalize).join('');
            if (rowStr.includes('mapage') && rowStr.includes('tenpage')) {
              headerRowIdx = r;
              break;
            }
          }
          
          const headers = pageRows[headerRowIdx].map(normalize);
          const getIdx = (name: string) => headers.findIndex((h: string) => h.includes(name));
          
          const idxCode = getIdx('mapage');
          const idxName = getIdx('tenpage');
          const idxId = getIdx('idpage');
          const idxRunner = getIdx('tenadchay');
          const idxSource = getIdx('manguonget');
          const idxType = getIdx('loaipage');
          const idxGeo = getIdx('dialy');
          const idxLink = getIdx('linkpage');
          const idxStatus = getIdx('tinhtrang');
          const idxPancake = getIdx('pancake');
          const idxAddBm = getIdx('addbm');
          const idxRemovedPan = getIdx('dagopan');

          const existingPages = new Map(fanpagesSnapshot.docs.map(d => [d.id, d.data()]));
          const safeStr = (val: any, maxLen: number) => String(val || '').substring(0, maxLen);

          let pageBatch = writeBatch(db);
          let pageOpCount = 0;
          
          for (let i = headerRowIdx + 1; i < pageRows.length; i++) {
            const row = pageRows[i];
            const pageCode = idxCode >= 0 ? row[idxCode] : '';
            const pageName = idxName >= 0 ? row[idxName] : '';
            
            if (!pageName || String(pageName).trim() === '') continue; 
            
            let rawId = pageCode || pageName || `row_${i}`;
            const docId = encodeURIComponent(String(rawId).replace(/[\/\s]/g, '_'));
            const docRef = doc(db, 'fanpages', docId);
            
            const newData = {
              page_code: safeStr(pageCode, 490),
              page_name: safeStr(pageName, 990),
              page_id: idxId >= 0 ? safeStr(row[idxId], 490) : '',
              runner: idxRunner >= 0 ? safeStr(row[idxRunner], 990) : '',
              source_code: idxSource >= 0 ? safeStr(row[idxSource], 490) : '',
              page_type: idxType >= 0 ? safeStr(row[idxType], 490) : '',
              geography: idxGeo >= 0 ? safeStr(row[idxGeo], 490) : '',
              page_link: idxLink >= 0 ? safeStr(row[idxLink], 2990) : '',
              status: idxStatus >= 0 ? safeStr(row[idxStatus], 490) : '',
              pancake: idxPancake >= 0 ? safeStr(row[idxPancake], 490) : '',
              add_bm: idxAddBm >= 0 ? safeStr(row[idxAddBm], 490) : '',
              removed_pan: idxRemovedPan >= 0 ? safeStr(row[idxRemovedPan], 490) : '',
              updatedAt: Date.now()
            };

            const existing = existingPages.get(docId);
            if (existing) {
              const { updatedAt: _, ...restExisting } = existing;
              const { updatedAt: __, ...restNew } = newData;
              if (JSON.stringify(restExisting) === JSON.stringify(restNew)) {
                continue;
              }
            }
            
            pageBatch.set(docRef, newData);
            pageOpCount++;
            if (pageOpCount === BATCH_SIZE) {
              await withTimeout(pageBatch.commit(), 10000, 'Lỗi lưu batch fanpage');
              await sleep(DELAY_BETWEEN_BATCHES);
              pageBatch = writeBatch(db);
              pageOpCount = 0;
            }
          }
          if (pageOpCount > 0) {
            await withTimeout(pageBatch.commit(), 10000, 'Lỗi lưu fanpage cuối');
          }
        }
      }
    } catch (err: any) {
      console.error("Lỗi khi đồng bộ tab Seryn Page:", err);
    }

    // 4. Sync Roas tổng Tab
    log('Đang đồng bộ dữ liệu ROAS tổng hợp (tab Roas tổng)...');
    try {
      const roasProxyUrl = `/api/proxy-sheets?spreadsheetId=${config.spreadsheetId}&sheetName=${encodeURIComponent('Roas tổng')}&apiKey=${config.apiKey}`;

      const roasRes = await fetch(roasProxyUrl, { cache: 'no-store' });
      if (roasRes.ok) {
        const roasData = await roasRes.json();
        const roasRows = roasData.values;
        if (roasRows && roasRows.length > 2) {
          // Data processing
          const parseNum = (val: any) => {
            if (val === undefined || val === null || val === '') return 0;
            if (typeof val === 'number') return val;
            let strVal = String(val).trim();
            const isPercent = strVal.includes('%');
            strVal = strVal.replace('%', '');
            const hasComma = strVal.includes(',');
            const hasDot = strVal.includes('.');
            if (hasComma && hasDot) {
              strVal = strVal.replace(/\./g, '').replace(',', '.');
            } else if (hasComma) {
              const parts = strVal.split(',');
              if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
                strVal = strVal.replace(/,/g, '');
              } else {
                strVal = strVal.replace(',', '.');
              }
            } else if (hasDot) {
              const parts = strVal.split('.');
              if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
                strVal = strVal.replace(/\./g, '');
              }
            }
            const cleanVal = strVal.replace(/[^0-9.-]/g, '');
            let num = parseFloat(cleanVal);
            if (isNaN(num)) return 0;
            return isPercent ? num / 100 : num;
          };

          let headerRowIndex = 0;
          for (let i = 0; i < Math.min(10, roasRows.length); i++) {
            const row = roasRows[i];
            if (row && row.some((cell: any) => String(cell).toLowerCase().includes('tháng báo cáo'))) {
              headerRowIndex = i;
              break;
            }
          }

          const headerRow = roasRows[headerRowIndex].map((h: any) => String(h || '').toLowerCase().trim());
          
          const idxMonth = headerRow.findIndex((h: string) => h.includes('tháng báo cáo') || h.includes('tháng'));
          const idxStartDate = headerRow.findIndex((h: string) => h.includes('ngày bắt đầu'));
          const idxEndDate = headerRow.findIndex((h: string) => h.includes('ngày kết thúc'));
          const idxChannel = headerRow.findIndex((h: string) => h.includes('kênh'));
          const idxClassification = headerRow.findIndex((h: string) => h.includes('phân loại'));
          const idxPersonnel = headerRow.findIndex((h: string) => h.includes('tên nhân sự') || h.includes('nhân sự'));

          let superHeaderRowIndex = -1;
          for (let i = headerRowIndex - 1; i >= 0; i--) {
            const rowStr = roasRows[i].map((h: any) => String(h || '').toLowerCase().trim());
            if (rowStr.some((h: string) => h === 'tổng cộng' || h.includes('tổng cộng'))) {
              superHeaderRowIndex = i;
              break;
            }
          }

          const superHeaderRow = superHeaderRowIndex >= 0 ? roasRows[superHeaderRowIndex].map((h: any) => String(h || '').toLowerCase().trim()) : [];
          
          let totalGroupIdx = superHeaderRow.findIndex((h: string) => h === 'tổng cộng' || h.includes('tổng cộng'));
          let domesticGroupIdx = superHeaderRow.findIndex((h: string) => h === 'trong nước' || h.includes('trong nước') || h.includes('nội địa'));
          let overseasGroupIdx = superHeaderRow.findIndex((h: string) => h === 'nước ngoài' || h.includes('nước ngoài') || h.includes('ngoại'));

          // Fallback if not found in super header
          if (totalGroupIdx < 0) totalGroupIdx = headerRow.findIndex((h: string, i: number) => i > idxPersonnel && (h.includes('chi phí')));
          if (domesticGroupIdx < 0 && totalGroupIdx >= 0) domesticGroupIdx = totalGroupIdx + 5;
          if (overseasGroupIdx < 0 && domesticGroupIdx >= 0) overseasGroupIdx = domesticGroupIdx + 5;

          const findIdxInGroup = (groupStart: number, keywords: string[], fallbackOccurence: number) => {
             if (groupStart >= 0) {
                 for (let i = groupStart; i < Math.min(groupStart + 8, headerRow.length); i++) {
                    const h = headerRow[i];
                    if (keywords.some(k => h === k || h.includes(k))) return i;
                 }
             }
             // Fallback to searching the whole array for the Nth occurrence
             let count = 0;
             for (let i = 0; i < headerRow.length; i++) {
                 const h = headerRow[i];
                 if (keywords.some(k => h === k || h.includes(k))) {
                     count++;
                     if (count === fallbackOccurence) return i;
                 }
             }
             return -1; // Not found
          };

          const tChiPhi = findIdxInGroup(totalGroupIdx, ['chi phí', 'cp', 'spend', 'ngân sách'], 1);
          const tData = findIdxInGroup(totalGroupIdx, ['sl data', 'data', 'số data'], 1);
          const tDataPrice = findIdxInGroup(totalGroupIdx, ['giá data', 'giá tb'], 1);
          const tRoas1 = findIdxInGroup(totalGroupIdx, ['roas trong tháng', 'roas 1 tháng', 'roas %', 'roas', 'roas tháng'], 1);
          const tRoas3 = findIdxInGroup(totalGroupIdx, ['roas 3 tháng', 'roas 3t', 'roas 3', 'roas3'], 1);

          const dChiPhi = findIdxInGroup(domesticGroupIdx, ['chi phí', 'cp', 'spend', 'ngân sách'], 2);
          const dData = findIdxInGroup(domesticGroupIdx, ['sl data', 'data', 'số data'], 2);
          const dDataPrice = findIdxInGroup(domesticGroupIdx, ['giá data', 'giá tb'], 2);
          const dRoas1 = findIdxInGroup(domesticGroupIdx, ['roas trong tháng', 'roas 1 tháng', 'roas %', 'roas', 'roas tháng'], 2);
          const dRoas3 = findIdxInGroup(domesticGroupIdx, ['roas 3 tháng', 'roas 3t', 'roas 3', 'roas3'], 2);

          const oChiPhi = findIdxInGroup(overseasGroupIdx, ['chi phí', 'cp', 'spend', 'ngân sách'], 3);
          const oData = findIdxInGroup(overseasGroupIdx, ['sl data', 'data', 'số data'], 3);
          const oDataPrice = findIdxInGroup(overseasGroupIdx, ['giá data', 'giá tb'], 3);
          const oRoas1 = findIdxInGroup(overseasGroupIdx, ['roas trong tháng', 'roas 1 tháng', 'roas %', 'roas', 'roas tháng'], 3);
          const oRoas3 = findIdxInGroup(overseasGroupIdx, ['roas 3 tháng', 'roas 3t', 'roas 3', 'roas3'], 3);

          // Force finding Roas properly if they just named it "ROAS" 
          // Note: if 'roas' string is present in both 1 month and 3 month, findIdxInGroup returns the first match for tRoas1.
          // tRoas3 uses specific '3' keywords.



          const safeMonth = idxMonth >= 0 ? idxMonth : 0;
          const safeStartDate = idxStartDate >= 0 ? idxStartDate : 1;
          const safeEndDate = idxEndDate >= 0 ? idxEndDate : 2;
          const safeChannel = idxChannel >= 0 ? idxChannel : 7;
          const safeClassification = idxClassification >= 0 ? idxClassification : 8;
          const safePersonnel = idxPersonnel >= 0 ? idxPersonnel : 9;

          let roasBatch = writeBatch(db);
          let roasOpCount = 0;
          let roasSkipCount = 0;
          let roasWriteCount = 0;
          
          // Prefetch existing roas to avoid unchanged writes
          const existingRoasMap = new Map();
          try {
            // ROAS summary is generally small, so fetching all isn't terrible, but we can limit if needed.
            const roasSnap = await withTimeout(getDocs(collection(db, 'roasSummary')), 10000, 'Lỗi get roasSummary');
            roasSnap.forEach(d => {
              const { updatedAt: _, ...rest } = d.data();
              existingRoasMap.set(d.id, deterministicStringify(rest));
            });
          } catch(e) {}
          
          for (let i = headerRowIndex + 1; i < roasRows.length; i++) {
            const row = roasRows[i];
            if (!row || row.length < safePersonnel) continue; // Must have at least up to personnel
            
            const reportMonth = String(row[safeMonth] || '').trim();
            const channel = String(row[safeChannel] || '').trim();
            const classificationRaw = String(row[safeClassification] || '').trim().replace(/facbeook/i, 'Facebook').replace(/\s*_\s*/g, '_');
            const classification = classificationRaw.toUpperCase().includes('TỔNG KÊNH_FACEBOOK') ? 'Tổng kênh_Facebook' : classificationRaw;
            const personnel = String(row[safePersonnel] || '').trim();
            
            if (!reportMonth || !personnel) continue;

            const docId = `${reportMonth}_${channel}_${classification}_${personnel}`.replace(/[\/\s]/g, '_');
            const docRef = doc(db, 'roasSummary', docId);

            const docData = {
              reportMonth,
              startDate: String(row[safeStartDate] || ''),
              endDate: String(row[safeEndDate] || ''),
              channel,
              classification,
              personnel,
              total: {
                spend: parseNum(row[tChiPhi >= 0 ? tChiPhi : 10]),
                dataCount: parseNum(row[tData >= 0 ? tData : 11]),
                dataPrice: parseNum(row[tDataPrice >= 0 ? tDataPrice : 12]),
                roasMonth: parseNum(row[tRoas1 >= 0 ? tRoas1 : 13]),
                roas3Months: parseNum(row[tRoas3 >= 0 ? tRoas3 : 14])
              },
              domestic: {
                spend: parseNum(row[dChiPhi >= 0 ? dChiPhi : 15]),
                dataCount: parseNum(row[dData >= 0 ? dData : 16]),
                dataPrice: parseNum(row[dDataPrice >= 0 ? dDataPrice : 17]),
                roasMonth: parseNum(row[dRoas1 >= 0 ? dRoas1 : 18]),
                roas3Months: parseNum(row[dRoas3 >= 0 ? dRoas3 : 19])
              },
              overseas: {
                spend: parseNum(row[oChiPhi >= 0 ? oChiPhi : 20]),
                dataCount: parseNum(row[oData >= 0 ? oData : 21]),
                dataPrice: parseNum(row[oDataPrice >= 0 ? oDataPrice : 22]),
                roasMonth: parseNum(row[oRoas1 >= 0 ? oRoas1 : 23]),
                roas3Months: parseNum(row[oRoas3 >= 0 ? oRoas3 : 24])
              }
            };

            const newStr = deterministicStringify(docData);
            if (existingRoasMap.get(docId) === newStr) {
              roasSkipCount++;
              continue;
            }

            roasBatch.set(docRef, { ...docData, updatedAt: Date.now() }, { merge: true });
            roasOpCount++;
            roasWriteCount++;

            if (roasOpCount === BATCH_SIZE) {
              await withTimeout(roasBatch.commit(), 10000, 'Lỗi lưu chunk ROAS');
              await sleep(DELAY_BETWEEN_BATCHES);
              roasBatch = writeBatch(db);
              roasOpCount = 0;
            }
          }
          if (roasOpCount > 0) await withTimeout(roasBatch.commit(), 10000, 'Lỗi lưu chunk ROAS cuối');
        }
      }
    } catch (err: any) {
      console.error("Lỗi khi đồng bộ tab Roas tổng:", err);
    }

    log('Đồng bộ thành công!');
    return true;
  } catch (error: any) {
    console.error("Sync error:", JSON.stringify({msg: error.message, stack: error.stack, error}));
    const errorStr = String(error.message || error);
    
    if (errorStr.includes('quota') || errorStr.includes('resource-exhausted')) {
      throw new Error('Đã đạt giới hạn Quota. Bạn đang bị quá tải request (có thể do giới hạn đọc/ghi của Firebase hoặc Google Sheets API đang xử lý quá nhanh). Vui lòng thử lại sau vài giây.');
    }
    
    throw new Error(error.message || 'Lỗi không xác định khi đồng bộ');
  }
};
