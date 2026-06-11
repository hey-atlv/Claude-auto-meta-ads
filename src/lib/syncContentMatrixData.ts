import { collection, doc, getDocs, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { SheetConfig } from './syncService';

const deterministicStringify = (obj: any): string => {
  if (!obj || typeof obj !== 'object') return String(obj);
  return JSON.stringify(Object.keys(obj).sort().reduce((res: any, key) => {
    res[key] = obj[key];
    return res;
  }, {}));
};

const robustParseNum = (val: any) => {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;
  let strVal = String(val).trim();
  const isPercent = strVal.includes('%');
  strVal = strVal.replace('%', '');
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
  return num;
};

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

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

export const syncContentMatrixData = async (config: SheetConfig, log: (msg: string) => void) => {
  try {
    log('Đang kết nối Google Sheets (CLDT Content Facebook)...');
    let cldtMap = new Map();
    try {
      const cldtUrl = `/api/proxy-sheets?spreadsheetId=${config.spreadsheetId}&sheetName=${encodeURIComponent('CLDT Content Facebook')}&apiKey=${config.apiKey}`;
      const cldtRes = await fetch(cldtUrl);
      if (cldtRes.ok) {
        const cldtData = await cldtRes.json();
        const cldtRows = cldtData.values;
        if (cldtRows && cldtRows.length > 2) {
          for (let i = 2; i < cldtRows.length; i++) {
            const row = cldtRows[i];
            const contentId = String(row[0] || '').trim();
            if (!contentId || !/^\d{4,6}/.test(contentId)) continue;
            const parsePct = (val: string) => {
              if(!val) return 0;
              return parseFloat(val.replace('%','').replace(',','.')) || 0;
            };
            cldtMap.set(contentId, {
              cldt_nn_tich_cuc: parsePct(row[4]),
              cldt_nd_tich_cuc: parsePct(row[13])
            });
          }
        }
      }
    } catch(e) {
      console.warn("Could not fetch CLDT", e);
    }

    log('Đang kết nối Google Sheets (ID FB)...');
    
    // FETCH sheet ID FB -> collection `contents`
    const proxyUrl1 = `/api/proxy-sheets?spreadsheetId=${config.spreadsheetId}&sheetName=${encodeURIComponent('ID FB')}&apiKey=${config.apiKey}`;
    const res1 = await fetch(proxyUrl1);
    if (!res1.ok) throw new Error('Không thể tải tab ID FB');
    const data1 = await res1.json();
    const rows1 = data1.values;

    if (rows1 && rows1.length >= 3) {
      log(`Tiến hành đồng bộ ${rows1.length - 2} content từ tab ID FB...`);
      
      let contentsBatch = writeBatch(db);
      let opCount = 0;
      
      const existingContentsMap = new Map();
      try {
        const existingSnap = await withTimeout(getDocs(collection(db, 'contents')), 25000, 'Lấy dữ liệu collections hiện tại quá lâu (Đã đạt giới hạn Quota hoặc mạng chậm)');
        existingSnap.forEach(d => {
          const { updatedAt: _, ...rest } = d.data();
          existingContentsMap.set(d.id, deterministicStringify(rest));
        });
      } catch (err: any) {
        log(`Cảnh báo: Không thể lấy dữ liệu content hiện tại (${err.message}). Sẽ ghi đè tất cả.`);
      }
      
      let writeCount = 0;
      
      for (let i = 2; i < rows1.length; i++) {
        const row = rows1[i];
        if (!row || row.length < 2 || !row[1]) continue;
        
        const id = String(row[1]).trim(); // B: ID content 1
        if (!id) continue;
        
        let nguySanXuat = String(row[12] || ''); // M: YYMMDD
        if (nguySanXuat.length === 6) {
          nguySanXuat = `20${nguySanXuat.substring(0, 2)}-${nguySanXuat.substring(2, 4)}-${nguySanXuat.substring(4, 6)}`;
        }
        
        const cldtInfo = cldtMap.get(id) || { cldt_nn_tich_cuc: 0, cldt_nd_tich_cuc: 0 };
        
        const docData = {
          id, // B
          brand: String(row[5] || '').trim(), // F
          team: String(row[4] || '').trim(),  // E
          bienTap: String(row[6] || '').trim(), // G
          dinhDang: String(row[17] || '').replace(/#N\/A/g, '').trim(), // R
          page: String(row[14] || '').replace(/#N\/A/g, '').trim(), // O
          tenCGSD: String(row[15] || '').trim(), // P
          nhomTreHoa: String(row[16] || '').trim(), // Q
          doTuoi: String(row[19] || '').trim(), // T
          mau: String(row[20] || '').trim(), // U
          maMau: String(row[13] || '').trim(), // N
          ngaySanXuat: nguySanXuat,
          cldt_nn_tich_cuc: cldtInfo.cldt_nn_tich_cuc,
          cldt_nd_tich_cuc: cldtInfo.cldt_nd_tich_cuc
        };

        const docId = encodeURIComponent(id.replace(/[\/\s]/g, '_'));
        const newDataStr = deterministicStringify(docData);
        if (existingContentsMap.get(docId) !== newDataStr) {
          contentsBatch.set(doc(db, 'contents', docId), { ...docData, updatedAt: Date.now() });
          opCount++;
          writeCount++;
        }
        
        if (opCount === 400) {
          await withTimeout(contentsBatch.commit(), 45000, 'Lưu dữ liệu vào Firestore Database thất bại (hết thời gian kết nối hoặc kẹt Quota)');
          await delay(200);
          contentsBatch = writeBatch(db);
          opCount = 0;
        }
      }
      
      if (opCount > 0) await withTimeout(contentsBatch.commit(), 45000, 'Lưu dữ liệu cuối vào Firestore Database thất bại (hết thời gian kết nối hoặc kẹt Quota)');
      log(`Đã lưu ${writeCount} content mới/cập nhật.`);
    }

    log('Đang kết nối Google Sheets (Roas content)...');
    
    // FETCH sheet Roas content -> collection `performance`
    const proxyUrl2 = `/api/proxy-sheets?spreadsheetId=${config.spreadsheetId}&sheetName=${encodeURIComponent('Roas content')}&apiKey=${config.apiKey}`;
    const res2 = await fetch(proxyUrl2);
    if (!res2.ok) throw new Error('Không thể tải tab Roas content');
    const data2 = await res2.json();
    const rows2 = data2.values;

    if (rows2 && rows2.length > 3) {
      log(`Tiến hành đồng bộ dữ liệu performance...`);
      
      const vungMap = [
        { name: 'trong_nuoc', label: 'Trong nước', offset: 5 },
        { name: 'nuoc_ngoai', label: 'Nước ngoài', offset: 10 },
        { name: 'tong_cong', label: 'Tổng cộng', offset: 0 }
      ];
      
      const kyMap = [
        { name: 'tong_nam', label: 'Tổng năm 2026', idx: 0, col: 3 }, 
        { name: 'thang1', label: 'Tháng 1', idx: 1, col: 18 }, 
        { name: 'thang2', label: 'Tháng 2', idx: 2, col: 33 },
        { name: 'thang3', label: 'Tháng 3', idx: 3, col: 48 },
        { name: 'thang4', label: 'Tháng 4', idx: 4, col: 63 },
        { name: 'thang5', label: 'Tháng 5', idx: 5, col: 78 },
        { name: 'thang6', label: 'Tháng 6', idx: 6, col: 93 },
        { name: 'thang7', label: 'Tháng 7', idx: 7, col: 108 },
        { name: 'thang8', label: 'Tháng 8', idx: 8, col: 123 },
        { name: 'thang9', label: 'Tháng 9', idx: 9, col: 138 },
        { name: 'thang10', label: 'Tháng 10', idx: 10, col: 153 },
        { name: 'thang11', label: 'Tháng 11', idx: 11, col: 168 },
        { name: 'thang12', label: 'Tháng 12', idx: 12, col: 183 },
      ];

      const existingPerfMap = new Map();
      try {
        const existingSnap = await withTimeout(getDocs(collection(db, 'performance')), 25000, 'Lấy dữ liệu performance hiện tại quá lâu');
        existingSnap.forEach(d => {
          const { updatedAt: _, ...rest } = d.data();
          existingPerfMap.set(d.id, deterministicStringify(rest));
        });
      } catch (err: any) {
        log(`Cảnh báo: Không thể lấy dữ liệu performance hiện tại (${err.message}). Sẽ ghi đè tất cả.`);
      }

      let perfBatch = writeBatch(db);
      let opCount = 0;
      let writeCount = 0;
      let skipCount = 0;
      
      for (let i = 3; i < rows2.length; i++) {
        const row = rows2[i];
        if (!row || row.length < 3) continue;
        
        const kenh = String(row[0] || '').trim();
        const phanLoai = String(row[1] || '').trim();
        const tenContent = String(row[2] || '').trim();
        
        // Skip summary rows where tenContent is empty or is not an ID (e.g., brand name "Hiếu", "S", "Khác")
        if (!tenContent || !/^\d{4,6}/.test(tenContent)) continue;
        
        const tenCGSD = String(row[198] || '').trim(); 
        
        for (const ky of kyMap) {
          for (const vung of vungMap) {
            const baseCol = ky.col + vung.offset;
            const chiPhiStr = String(row[baseCol] || '').trim();
            const chiPhi = robustParseNum(chiPhiStr);
            const slDataStr = String(row[baseCol + 1] || '').trim();
            
            // Only write if there is a chiPhi or it's not totally empty
            if (chiPhi === 0 && slDataStr === '') continue; 
            
            const slData = robustParseNum(slDataStr);
            const giaTData = robustParseNum(row[baseCol + 2]);
            const roasTrong = robustParseNum(row[baseCol + 3]);
            const roas3Thang = robustParseNum(row[baseCol + 4]);
            
            const docData = {
              tenContent,
              tenCGSD,
              kenh,
              phanLoai,
              ky: ky.name,
              kyLabel: ky.label,
              kyIndex: ky.idx,
              vung: vung.name,
              vungLabel: vung.label,
              chiPhi,
              slData,
              giaTData,
              roasTrong,
              roas3Thang
            };
            
            // Stable ID
            const docId = encodeURIComponent(`${tenContent}_${ky.name}_${vung.name}`.replace(/[\/\s]/g, '_'));
            
            const newDataStr = deterministicStringify(docData);
            if (existingPerfMap.get(docId) === newDataStr) {
              skipCount++;
              continue;
            }

            perfBatch.set(doc(db, 'performance', docId), { ...docData, updatedAt: Date.now() });
            opCount++;
            writeCount++;
            
            if (opCount === 400) {
              await withTimeout(perfBatch.commit(), 45000, 'Lưu dữ liệu performance vào Firestore thất bại (hết thời gian kết nối hoặc kẹt Quota)');
              await delay(200);
              perfBatch = writeBatch(db);
              opCount = 0;
            }
          }
        }
      }
      
      if (opCount > 0) await withTimeout(perfBatch.commit(), 45000, 'Lưu dữ liệu performance cuối vào Firestore thất bại (hết thời gian kết nối hoặc kẹt Quota)');
      log(`Đã lưu ${writeCount} bản ghi hiệu suất performance mới/cập nhật, bỏ qua ${skipCount} bản ghi trùng khớp.`);
    }

    log('Đồng bộ Data Content hoàn tất!');
    return true;
  } catch (err: any) {
    console.error("Content Sync error:", err);
    throw new Error(err.message || 'Lỗi không xác định khi đồng bộ Content');
  }
};
