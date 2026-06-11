import { FieldValue, Firestore } from 'firebase-admin/firestore';
import { parseCampaignName } from './campaignParser.ts';

export interface SheetConfig {
  id: string;
  name: string;
  spreadsheetId: string;
  sheetName: string;
  apiKey: string;
  isActive: boolean;
}

const BANK_FEE = 0.011; // 1.1%
const VAT_FEE = 0.10; // 10%

export const syncSheetDataServer = async (db: Firestore, config: SheetConfig, onProgress?: (msg: string) => void) => {
  const log = (msg: string) => {
    console.log(msg);
    if (onProgress) onProgress(msg);
  };

  log(`[ServerSync] Starting sync for ${config.name}...`);
  
  try {
    // 1. Fetch Ads Data
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}/values/${config.sheetName}?key=${config.apiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData?.error?.message || response.statusText;
      throw new Error(`Google Sheets API Error: ${errorMsg}`);
    }
    
    const data = await response.json();
    const rows = data.values;
    
    if (!rows || rows.length < 2) {
      throw new Error("No data found or missing header row.");
    }

    log(`[ServerSync] Fetched ${rows.length - 1} rows. Processing...`);

    const normalizeHeader = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const headers = rows[0].map(normalizeHeader);
    
    const getIdx = (name: string) => {
      const normalizedName = normalizeHeader(name);
      return headers.findIndex((h: string) => h.includes(normalizedName));
    };
    
    const BATCH_SIZE = 400; // Admin SDK allows up to 500
    let batch = db.batch();
    let operationCount = 0;

    const dailyStats = new Map<string, {
      spend: number,
      revenue: number,
      leads: number,
      messaging: number,
      orders: number,
      markets: Record<string, {
        spend: number,
        revenue: number,
        leads: number,
        messaging: number,
        orders: number
      }>
    }>();

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
        if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
      } catch (e) {}
      return strVal;
    };

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const dateRaw = row[getIdx('date')] || '';
        const date = formatSheetDate(dateRaw);
        const account_id = row[getIdx('account_id')] || '';
        const campaign_id = row[getIdx('campaign_id')] || '';
        const ad_id = row[getIdx('ad_id')] || '';
        
        if (!date || !account_id || !campaign_id) continue;

        const spend = robustParseNum(row[getIdx('amount_spent')]);
        const revenue = robustParseNum(row[getIdx('revenue')]);
        const leads = robustParseNum(row[getIdx('leads')]);
        const messages = robustParseNum(row[getIdx('messaging_conversations_started')]);
        const purchases = robustParseNum(row[getIdx('purchases')]);

        const campaign_name = row[getIdx('campaign_name')] || '';
        const parsedCampaign = parseCampaignName(campaign_name);
        const market = parsedCampaign.market || 'unknown';

        // Accumulate daily stats
        const stats = dailyStats.get(date) || { 
          spend: 0, revenue: 0, leads: 0, messaging: 0, orders: 0,
          markets: {}
        };
        stats.spend += spend;
        stats.revenue += revenue;
        stats.leads += leads;
        stats.messaging += messages;
        stats.orders += purchases;

        if (!stats.markets[market]) {
          stats.markets[market] = { spend: 0, revenue: 0, leads: 0, messaging: 0, orders: 0 };
        }
        stats.markets[market].spend += spend;
        stats.markets[market].revenue += revenue;
        stats.markets[market].leads += leads;
        stats.markets[market].messaging += messages;
        stats.markets[market].orders += purchases;

        dailyStats.set(date, stats);

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
          spend,
          impressions: robustParseNum(row[getIdx('impressions')]),
          purchases,
          messages,
          revenue,
          leads,
          ...parsedCampaign,
          updatedAt: FieldValue.serverTimestamp()
        };

        const adPart = ad_id || (row[getIdx('ad_name')] || 'no-ad').substring(0, 50).replace(/[^a-z0-9]/gi, '_');
        const uniqueId = `${date}_${account_id}_${campaign_id}_${adPart}`;
        const docRef = db.collection('adsData').doc(uniqueId);
        
        batch.set(docRef, docData, { merge: true });
        operationCount++;

        if (operationCount >= BATCH_SIZE) {
          await batch.commit();
          batch = db.batch();
          operationCount = 0;
          log(`[ServerSync] Committed batch for ADS ${i}/${rows.length}...`);
          await new Promise(r => setTimeout(r, 100)); // Small pause
        }
    }

    if (operationCount > 0) {
      await batch.commit();
      batch = db.batch();
      operationCount = 0;
    }

    // 2. Save Daily Summaries
    log(`[ServerSync] Saving daily summaries for ${dailyStats.size} days...`);
    for (const [date, stats] of dailyStats.entries()) {
      const summaryRef = db.collection('dailySummaries').doc(date);
      batch.set(summaryRef, {
        date,
        ...stats,
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
      operationCount++;

      if (operationCount >= BATCH_SIZE) {
        await batch.commit();
        batch = db.batch();
        operationCount = 0;
        await new Promise(r => setTimeout(r, 100));
      }
    }

    if (operationCount > 0) {
      await batch.commit();
      batch = db.batch();
      operationCount = 0;
    }

    // 3. Sync Config Tab
    log('[ServerSync] Syncing Config tab...');
    try {
      const configUrl = `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}/values/Config?key=${config.apiKey}`;
      const configRes = await fetch(configUrl);
      if (configRes.ok) {
        const configData = await configRes.json();
        const configRows = configData.values;
        if (configRows && configRows.length > 1) {
          const normalize = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          const configHeaders = configRows[0].map(normalize);
          const getCfgIdx = (name: string) => configHeaders.indexOf(normalize(name));
          
          for (let i = 1; i < configRows.length; i++) {
            const row = configRows[i];
            const accId = String(row[getCfgIdx('account_id')] || '').trim();
            if (!accId) continue;
            
            const docId = encodeURIComponent(accId.replace(/[\/\s]/g, '_'));
            const docRef = db.collection('adAccounts').doc(docId);
            
            batch.set(docRef, {
              account_id: accId.substring(0, 90),
              account_name: String(row[getCfgIdx('account_name')] || '').substring(0, 190),
              status: String(row[getCfgIdx('status')] || '').substring(0, 90),
              bm_name: String(row[getCfgIdx('bm_name')] || '').substring(0, 190),
              updatedAt: FieldValue.serverTimestamp()
            }, { merge: true });
            operationCount++;

            if (operationCount >= BATCH_SIZE) {
              await batch.commit();
              batch = db.batch();
              operationCount = 0;
              await new Promise(r => setTimeout(r, 100));
            }
          }
          if (operationCount > 0) {
            await batch.commit();
            batch = db.batch();
            operationCount = 0;
          }
        }
      }
    } catch (e) {
      console.warn('[ServerSync] Config tab sync failed (ignoring):', e);
    }

    // 4. Sync Roas tổng Tab
    log('[ServerSync] Syncing Roas tổng tab...');
    try {
      const roasUrl = `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}/values/${encodeURIComponent('Roas tổng')}?key=${config.apiKey}`;
      const roasRes = await fetch(roasUrl);
      if (roasRes.ok) {
        const roasData = await roasRes.json();
        const roasRows = roasData.values;
        if (roasRows && roasRows.length > 2) {
          let headerRowIndex = 0;
          for (let i = 0; i < Math.min(10, roasRows.length); i++) {
            const row = roasRows[i];
            if (row && row.some((cell: any) => String(cell).toLowerCase().includes('tháng báo cáo'))) {
              headerRowIndex = i;
              break;
            }
          }

          const headerRow = roasRows[headerRowIndex].map((h: any) => String(h || '').toLowerCase().trim());
          const chiPhiIdxs: number[] = [];
          const dataIdxs: number[] = [];
          const priceIdxs: number[] = [];
          const roas1Idxs: number[] = [];
          const roas3Idxs: number[] = [];

          headerRow.forEach((h: string, i: number) => {
            if (h.includes('chi phí')) chiPhiIdxs.push(i);
            else if (h.includes('sl data') || h === 'data') dataIdxs.push(i);
            else if (h.includes('giá data')) priceIdxs.push(i);
            else if (h.includes('roas trong tháng')) roas1Idxs.push(i);
            else if (h.includes('roas 3 tháng')) roas3Idxs.push(i);
          });

          const getSafeIdx = (arr: number[], def: number, occ: number) => arr.length >= occ ? arr[occ-1] : def;

          const fIdx = (name: string) => headerRow.findIndex((h: string) => h.includes(name));
          const idxMonth = fIdx('tháng');
          const idxStart = fIdx('ngày bắt đầu');
          const idxEnd = fIdx('ngày kết thúc');
          const idxChan = fIdx('kênh');
          const idxClass = fIdx('phân loại');
          const idxPers = fIdx('nhân sự');

          for (let i = headerRowIndex + 1; i < roasRows.length; i++) {
            const row = roasRows[i];
            const month = String(row[idxMonth >= 0 ? idxMonth : 0] || '').trim();
            const pers = String(row[idxPers >= 0 ? idxPers : 9] || '').trim();
            if (!month || !pers) continue;

            const channel = String(row[idxChan >= 0 ? idxChan : 7] || '').trim();
            const classification = String(row[idxClass >= 0 ? idxClass : 8] || '').trim().replace(/facbeook/i, 'Facebook');
            
            const docId = `${month}_${channel}_${classification}_${pers}`.replace(/[\/\s]/g, '_');
            const docRef = db.collection('roasSummary').doc(docId);

            batch.set(docRef, {
              reportMonth: month,
              startDate: String(row[idxStart >= 0 ? idxStart : 1] || ''),
              endDate: String(row[idxEnd >= 0 ? idxEnd : 2] || ''),
              channel,
              classification,
              personnel: pers,
              total: {
                spend: robustParseNum(row[getSafeIdx(chiPhiIdxs, 10, 1)]),
                dataCount: robustParseNum(row[getSafeIdx(dataIdxs, 11, 1)]),
                dataPrice: robustParseNum(row[getSafeIdx(priceIdxs, 12, 1)]),
                roasMonth: robustParseNum(row[getSafeIdx(roas1Idxs, 13, 1)]),
                roas3Months: robustParseNum(row[getSafeIdx(roas3Idxs, 14, 1)])
              },
              domestic: {
                spend: robustParseNum(row[getSafeIdx(chiPhiIdxs, 15, 2)]),
                dataCount: robustParseNum(row[getSafeIdx(dataIdxs, 16, 2)]),
                dataPrice: robustParseNum(row[getSafeIdx(priceIdxs, 17, 2)]),
                roasMonth: robustParseNum(row[getSafeIdx(roas1Idxs, 18, 2)]),
                roas3Months: robustParseNum(row[getSafeIdx(roas3Idxs, 19, 2)])
              },
              overseas: {
                spend: robustParseNum(row[getSafeIdx(chiPhiIdxs, 20, 3)]),
                dataCount: robustParseNum(row[getSafeIdx(dataIdxs, 21, 3)]),
                dataPrice: robustParseNum(row[getSafeIdx(priceIdxs, 22, 3)]),
                roasMonth: robustParseNum(row[getSafeIdx(roas1Idxs, 23, 3)]),
                roas3Months: robustParseNum(row[getSafeIdx(roas3Idxs, 24, 3)])
              },
              updatedAt: FieldValue.serverTimestamp()
            }, { merge: true });
            operationCount++;

            if (operationCount >= BATCH_SIZE) {
              await batch.commit();
              batch = db.batch();
              operationCount = 0;
              await new Promise(r => setTimeout(r, 100));
            }
          }
          if (operationCount > 0) {
            await batch.commit();
          }
        }
      }
    } catch (e) {
      console.warn('[ServerSync] Roas tổng tab sync failed (ignoring):', e);
    }

    log(`[ServerSync] Sync completed for ${config.name}.`);
    return true;
  } catch (error) {
    console.error(`[ServerSync] Error syncing ${config.name}:`, error);
    throw error;
  }
};
