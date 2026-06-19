import { Firestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  adaptAccountConfigs,
  adaptAdsData,
  adaptContentMaster,
  adaptFanpageConfigs,
  adaptRoasContentMatrix,
  adaptRoasPageMatrix,
  adaptRoasSummary,
  parseCldtMap
} from './canonicalAdapters.js';
import { type SheetType } from './sheetSchemaRegistry.js';
import { buildQualitySummary, normalizeSheetValues, type NormalizedSheetReport } from '../services/sheetNormalizationService.js';

export interface SheetConfig {
  id: string;
  name: string;
  spreadsheetId: string;
  sheetName: string;
  apiKey: string;
  isActive: boolean;
}

const CACHE_DIR = path.join(process.cwd(), 'server-cache');

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

export const getCacheFilePath = (filename: string) => {
  return path.join(CACHE_DIR, filename);
};

const inMemoryCache = new Map<string, { mtimeMs: number; data: any }>();

// Read data from Cache file (Optimized with In-Memory Caching and mtime checks)
export const readCacheFile = (filename: string): any | null => {
  const filePath = getCacheFilePath(filename);
  if (fs.existsSync(filePath)) {
    try {
      const stat = fs.statSync(filePath);
      const cached = inMemoryCache.get(filename);
      if (cached && cached.mtimeMs === stat.mtimeMs) {
        return cached.data;
      }
      const raw = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(raw);
      inMemoryCache.set(filename, { mtimeMs: stat.mtimeMs, data });
      return data;
    } catch (e) {
      console.error(`[Cache] Error reading cache file ${filename}:`, e);
      return null;
    }
  }
  return null;
};

// Write data to Cache file
export const writeCacheFile = (filename: string, data: any) => {
  const filePath = getCacheFilePath(filename);
  try {
    fs.writeFileSync(filePath, JSON.stringify(data), 'utf8');
    console.log(`[Cache] Successfully wrote ${filename} to ${filePath}`);
    
    // Proactively update in-memory cache to stay in sync with zero latency
    try {
      const stat = fs.statSync(filePath);
      inMemoryCache.set(filename, { mtimeMs: stat.mtimeMs, data });
    } catch (e) {
      inMemoryCache.delete(filename);
    }
    
    return true;
  } catch (e) {
    console.error(`[Cache] Error writing cache file ${filename}:`, e);
    return false;
  }
};

const fetchSheetValues = async (spreadsheetId: string, sheetName: string, apiKey: string) => {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}?key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Status ${res.status}`);
  const data = await res.json();
  return Array.isArray(data.values) ? data.values : [];
};

/** Fetch with auto-fallback: try exact name, then discover actual tab name */
const fetchTabSmart = async (spreadsheetId: string, tabName: string, apiKey: string, log: (m: string) => void): Promise<any[][]> => {
  try {
    return await fetchSheetValues(spreadsheetId, tabName, apiKey);
  } catch (e: any) {
    if (e.message?.includes('400') || e.message?.includes('404')) {
      log(`[ServerSync] Tab "${tabName}" not found directly, discovering actual tab name...`);
      const actual = await discoverTabName(spreadsheetId, apiKey, tabName);
      if (actual && actual !== tabName) {
        log(`[ServerSync] Found matching tab: "${actual}" (was looking for "${tabName}")`);
        return await fetchSheetValues(spreadsheetId, actual, apiKey);
      }
    }
    throw e;
  }
};

/** Fetch all tab names in a spreadsheet, then find the best match for a target tab name */
const discoverTabName = async (spreadsheetId: string, apiKey: string, targetName: string): Promise<string | null> => {
  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?key=${apiKey}&fields=sheets.properties.title`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const titles: string[] = (data.sheets || []).map((s: any) => s.properties?.title as string).filter(Boolean);

    // Exact match first
    if (titles.includes(targetName)) return targetName;

    // Case-insensitive match
    const norm = (s: string) => s.toLowerCase().replace(/[\s_\-]/g, '').normalize('NFD').replace(/[̀-ͯ]/g, '');
    const normTarget = norm(targetName);
    const ci = titles.find(t => norm(t) === normTarget);
    if (ci) return ci;

    // Partial match (target keywords present in tab name)
    const partial = titles.find(t => norm(t).includes(normTarget) || normTarget.includes(norm(t)));
    return partial || null;
  } catch {
    return null;
  }
};

// Dynamic Fetch and Cache logic
export const syncAllSheetsServer = async (db: Firestore | null, configsToSync?: SheetConfig[], onProgress?: (msg: string) => void) => {
  const log = (msg: string) => {
    console.log(msg);
    if (onProgress) onProgress(msg);
  };

  log(`[ServerSync] Bắt đầu đồng bộ toàn bộ dữ liệu từ Google Sheets...`);

  try {
    let activeConfigs: SheetConfig[] = [];

    // Prioritize passed configs from client
    if (configsToSync && configsToSync.length > 0) {
      activeConfigs = configsToSync.filter(c => c.isActive);
      log(`[ServerSync] Sử dụng ${activeConfigs.length} cấu hình do Client gửi lên trực tiếp.`);
      writeCacheFile('sheetsConfigs.json', configsToSync);
    } else {
      // 1. Try reading from local cache file first
      const cachedConfigs = readCacheFile('sheetsConfigs.json');
      if (cachedConfigs && Array.isArray(cachedConfigs) && cachedConfigs.length > 0) {
        activeConfigs = cachedConfigs.filter(c => c.isActive);
        log(`[ServerSync] Sử dụng ${activeConfigs.length} cấu hình từ bộ nhớ đệm cache file đại phương.`);
      } else if (db) {
        // 2. Fallback to fetching from Firestore
        try {
          log(`[ServerSync] Thử kết nối và nạp cấu hình từ Firestore...`);
          const configsSnap = await db.collection('sheetsConfigs').get();
          const configs: SheetConfig[] = [];
          configsSnap.forEach(docSnap => {
            configs.push({ id: docSnap.id, ...docSnap.data() } as SheetConfig);
          });
          writeCacheFile('sheetsConfigs.json', configs);
          activeConfigs = configs.filter(c => c.isActive);
          log(`[ServerSync] Lấy thành công ${activeConfigs.length} cấu hình từ Firestore.`);
        } catch (dbErr: any) {
          log(`[ServerSync] Cảnh báo: Lỗi nạp cấu hình từ Firestore (${dbErr.message || dbErr}). Không thể tiếp tục nếu không có cấu hình.`);
          return { success: false, error: 'Không thể nạp cấu hình từ Firestore hoặc cache địa phương' };
        }
      } else {
        log(`[ServerSync] Không có cấu hình nào được cung cấp và Firestore không khả dụng.`);
        return { success: false, error: 'Không tìm thấy cấu hình Google Sheets' };
      }
    }

    if (activeConfigs.length === 0) {
      log(`[ServerSync] Cảnh báo: Không tìm thấy cấu hình Google Sheet nào đang được kích hoạt.`);
      return { success: false, error: 'Không có cấu hình hoạt động' };
    }

    log(`[ServerSync] Bắt đầu đồng bộ ${activeConfigs.length} nguồn dữ liệu.`);

    // Containers for compiled sheets data
    let adsDataList: any[] = [];
    let adAccountsMap: Record<string, any> = {};
    let fanpagesMap: Record<string, any> = {};
    let roasSummaryList: any[] = [];
    let dailySummariesList: any[] = [];
    let contentsList: any[] = [];
    let performanceList: any[] = [];
    let roasPageList: any[] = [];
    const qualityReports: NormalizedSheetReport[] = [];
    const quarantineRecords: any[] = [];
    const normalizationMappings: any[] = [];

    const normalizeAndTrack = async (config: SheetConfig, sheetName: string, values: unknown[][], expectedType: SheetType) => {
      const result = await normalizeSheetValues({
        spreadsheetId: config.spreadsheetId,
        sheetName,
        sourceName: config.name,
        values,
        expectedType
      });
      qualityReports.push(result.report);
      normalizationMappings.push({
        sourceName: config.name,
        spreadsheetId: config.spreadsheetId,
        sheetName,
        sheetType: result.sheetType,
        confidence: result.confidence,
        aiUsed: result.aiUsed,
        mapping: result.mapping
      });
      quarantineRecords.push(...result.rejectedRecords.map(record => ({
        sourceName: config.name,
        spreadsheetId: config.spreadsheetId,
        sheetName,
        sheetType: result.sheetType,
        ...record
      })));
      return result;
    };

    const dailyStats = new Map<string, {
      spend: number,
      revenue: number,
      data_platform: number,
      messaging: number,
      orders: number,
      markets: Record<string, {
        spend: number,
        revenue: number,
        data_platform: number,
        messaging: number,
        orders: number
      }>
    }>();

    for (const config of activeConfigs) {
      // SOURCE A: Is it the content master report (named "id fb", "roas content", or contains master content)?
      const isMasterContent = config.name.includes("META_ADS_MASTER_DATABASE_CONTENT") || config.sheetName === "ID FB";

      if (isMasterContent) {
        log(`[ServerSync] Đang tải & phân tích nguồn Content Master: ${config.name}...`);
        
        // Tab A1: CLDT Content Facebook
        let cldtMap = new Map<string, any>();
        try {
          log(`[ServerSync] Tải tab 'CLDT Content Facebook'...`);
          const rows = await fetchTabSmart(config.spreadsheetId, 'CLDT Content Facebook', config.apiKey, log);
          const normalization = await normalizeAndTrack(config, 'CLDT Content Facebook', rows, 'cldt_matrix');
          cldtMap = parseCldtMap(rows);
          normalization.report.stats.adapterOutputRows = cldtMap.size;
        } catch (e) {
          log(`[ServerSync] Bỏ qua lỗi CLDT: ${e instanceof Error ? e.message : String(e)}`);
        }

        // Tab A2: ID FB (contents)
        try {
          log(`[ServerSync] Tải tab 'ID FB'...`);
          const rows = await fetchTabSmart(config.spreadsheetId, 'ID FB', config.apiKey, log);
          const normalization = await normalizeAndTrack(config, 'ID FB', rows, 'content_master');
          const parsedContents = adaptContentMaster(normalization.records, cldtMap);
          normalization.report.stats.adapterOutputRows = parsedContents.length;
          log(`[ServerSync] Content master normalized rows: ${parsedContents.length}`);
          contentsList.push(...parsedContents);
        } catch (e: any) {
          log(`[ServerSync] Bỏ qua lỗi ID FB: ${e instanceof Error ? e.message : String(e)}`);
        }

        // Tab A3: Roas content (performance)
        try {
          log(`[ServerSync] Tải tab 'Roas content'...`);
          const rows = await fetchTabSmart(config.spreadsheetId, 'Roas content', config.apiKey, log);
          const normalization = await normalizeAndTrack(config, 'Roas content', rows, 'content_performance_matrix');
          const parsedPerformance = adaptRoasContentMatrix(rows);
          normalization.report.stats.adapterOutputRows = parsedPerformance.length;
          log(`[ServerSync] Roas content normalized rows: ${parsedPerformance.length}`);
          performanceList.push(...parsedPerformance);
        } catch (e: any) {
          log(`[ServerSync] Bỏ qua lỗi Roas content: ${e instanceof Error ? e.message : String(e)}`);
        }

        // Tab A4: Roas page (per-fanpage performance — authoritative source for AlertsFanpage)
        try {
          log(`[ServerSync] Tải tab 'Roas page'...`);
          const rows = await fetchTabSmart(config.spreadsheetId, 'Roas page', config.apiKey, log);
          const normalization = await normalizeAndTrack(config, 'Roas page', rows, 'content_performance_matrix');
          const parsedRoasPage = adaptRoasPageMatrix(rows);
          normalization.report.stats.adapterOutputRows = parsedRoasPage.length;
          log(`[ServerSync] Roas page normalized rows: ${parsedRoasPage.length}`);
          roasPageList.push(...parsedRoasPage);
        } catch (e: any) {
          log(`[ServerSync] Bỏ qua lỗi Roas page: ${e instanceof Error ? e.message : String(e)}`);
        }

      } else {
        // SOURCE B: Main marketing ads sheets (having Ads Data, Config, Seryn Page, Roas tổng)
        log(`[ServerSync] Đang tải & phân tích nguồn Marketing Ads: ${config.name}...`);

        // Tab B1: Ads Data
        try {
          log(`[ServerSync] Tải tab '${config.sheetName}'...`);
          const rows = await fetchTabSmart(config.spreadsheetId, config.sheetName, config.apiKey, log);
          const normalization = await normalizeAndTrack(config, config.sheetName, rows, 'ads_data');
          const parsedAds = adaptAdsData(normalization.records);
          normalization.report.stats.adapterOutputRows = parsedAds.length;

          for (const row of parsedAds) {
            const date = String(row.date || '').trim();
            if (!date) continue;

            const spend = Number(row.spend) || 0;
            const revenue = Number(row.revenue) || 0;
            const data_platform = Number(row.purchases) || 0; // SĐT thô từ ads
            const messages = Number(row.messages) || 0;
            const market = row.market || 'unknown';
            const stats = dailyStats.get(date) || {
              spend: 0, revenue: 0, data_platform: 0, messaging: 0, orders: 0,
              markets: {}
            };

            stats.spend += spend;
            stats.revenue += revenue;
            stats.data_platform += data_platform;
            stats.messaging += messages;
            stats.orders += data_platform; // orders = SĐT thô (data platform)

            if (!stats.markets[market]) {
              stats.markets[market] = { spend: 0, revenue: 0, data_platform: 0, messaging: 0, orders: 0 };
            }
            stats.markets[market].spend += spend;
            stats.markets[market].revenue += revenue;
            stats.markets[market].data_platform += data_platform;
            stats.markets[market].messaging += messages;
            stats.markets[market].orders += data_platform;

            dailyStats.set(date, stats);
          }

          log(`[ServerSync] Ads Data normalized rows: ${parsedAds.length}`);
          adsDataList.push(...parsedAds);
        } catch (e: any) {
          log(`[ServerSync] Bỏ qua lỗi Ads Data: ${e instanceof Error ? e.message : String(e)}`);
        }

        // Tab B2: Config -> Accounts
        try {
          log(`[ServerSync] Tải tab 'Config'...`);
          const rows = await fetchTabSmart(config.spreadsheetId, 'Config', config.apiKey, log);
          const normalization = await normalizeAndTrack(config, 'Config', rows, 'account_config');
          const parsedAccounts = adaptAccountConfigs(normalization.records);
          normalization.report.stats.adapterOutputRows = Object.keys(parsedAccounts).length;
          adAccountsMap = { ...adAccountsMap, ...parsedAccounts };
          log(`[ServerSync] Config normalized accounts: ${Object.keys(parsedAccounts).length}`);
        } catch (e) {
          log(`[ServerSync] Bỏ qua tab Config: ${e instanceof Error ? e.message : String(e)}`);
        }

        // Tab B3: Seryn Page -> Fanpages
        try {
          log(`[ServerSync] Tải tab 'Seryn Page'...`);
          const rawRows = await fetchTabSmart(config.spreadsheetId, 'Seryn Page', config.apiKey, log);
          // Seryn Page has a title row at index 0 ("SERYN PAGE") — actual header is row 1
          const rows = rawRows.length > 1 && String(rawRows[0]?.[1] || '').toUpperCase().includes('SERYN PAGE')
            ? rawRows.slice(1) : rawRows;
          const normalization = await normalizeAndTrack(config, 'Seryn Page', rows, 'fanpage_config');
          const parsedFanpages = adaptFanpageConfigs(normalization.records);
          normalization.report.stats.adapterOutputRows = Object.keys(parsedFanpages).length;
          fanpagesMap = { ...fanpagesMap, ...parsedFanpages };
          log(`[ServerSync] Seryn Page normalized fanpages: ${Object.keys(parsedFanpages).length}`);
        } catch (e) {
          log(`[ServerSync] Bỏ qua tab Seryn Page: ${e instanceof Error ? e.message : String(e)}`);
        }

        // Tab B4: Roas tổng -> roasSummary
        try {
          log(`[ServerSync] Tải tab 'Roas tổng'...`);
          const rows = await fetchTabSmart(config.spreadsheetId, 'Roas tổng', config.apiKey, log);
          const normalization = await normalizeAndTrack(config, 'Roas tổng', rows, 'roas_summary_matrix');
          const parsedRoasSummary = adaptRoasSummary(rows);
          normalization.report.stats.adapterOutputRows = parsedRoasSummary.length;
          log(`[ServerSync] Roas tổng normalized rows: ${parsedRoasSummary.length}`);
          roasSummaryList.push(...parsedRoasSummary);
        } catch (e) {
          log(`[ServerSync] Bỏ qua tab Roas tổng: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }

    // Process compiled dailyStats Map to dailySummariesList array
    for (const [date, stats] of dailyStats.entries()) {
      dailySummariesList.push({
        id: date,
        date,
        ...stats
      });
    }

    // 4. Record as JSON Cache files (Only save if we actually fetched something)
    log(`[ServerSync] Hoàn thành xử lý dữ liệu. Đang lưu cache dạng JSON...`);

    if (adsDataList.length > 0) {
      writeCacheFile('adsData.json', adsDataList);
    }
    if (Object.keys(adAccountsMap).length > 0) {
      writeCacheFile('adAccounts.json', adAccountsMap);
    }
    if (Object.keys(fanpagesMap).length > 0) {
      writeCacheFile('fanpages.json', fanpagesMap);
    }
    if (roasSummaryList.length > 0) {
      writeCacheFile('roasSummary.json', roasSummaryList);
    }
    if (dailySummariesList.length > 0) {
      writeCacheFile('dailySummaries.json', dailySummariesList);
    }
    if (contentsList.length > 0) {
      writeCacheFile('contents.json', contentsList);
    }
    if (roasPageList.length > 0) {
      writeCacheFile('roasPage.json', roasPageList);
    }
    if (performanceList.length > 0) {
      writeCacheFile('performance.json', performanceList);
    }

    const qualitySummary = buildQualitySummary(qualityReports, quarantineRecords);
    if (process.env.ETL_WRITE_QUALITY_REPORT !== 'false') {
      writeCacheFile('dataQualityReport.json', qualitySummary);
      writeCacheFile('quarantine.json', quarantineRecords);
      writeCacheFile('normalizationMappings.json', normalizationMappings);
      log(`[ServerSync] Quality report: health=${qualitySummary.healthScore}, quarantine=${quarantineRecords.length}`);
    }

    // 5. Update globally in Firestore (system/sync_meta) so client knows synchronization occurred
    const syncMetaObj = {
      lastSyncedAt: Date.now(),
      status: 'SUCCESS',
      message: `Đồng bộ thành công sạch sẽ. Bản ghi adsData: ${adsDataList.length}, content: ${contentsList.length}`
    };

    // Always cache locally
    writeCacheFile('sync_meta.json', syncMetaObj);

    if (db) {
      try {
        const historyRef = db.collection('system').doc('sync_meta');
        await historyRef.set(syncMetaObj, { merge: true });
      } catch (fsErr: any) {
        log(`[ServerSync] Cảnh báo: Không thể cập nhật sync_meta lên Firestore (${fsErr.message || fsErr}). Đã lưu cache cục bộ.`);
      }
    }

    log(`[ServerSync] Đồng bộ toàn bộ dữ liệu hoàn tất xuất sắc và ổn định!`);
    return {
      success: true,
      stats: {
        adsData: adsDataList.length,
        adAccounts: Object.keys(adAccountsMap).length,
        fanpages: Object.keys(fanpagesMap).length,
        roasSummary: roasSummaryList.length,
        dailySummaries: dailySummariesList.length,
        contents: contentsList.length,
        performance: performanceList.length,
        roasPage: roasPageList.length,
        quality: {
          healthScore: qualitySummary.healthScore,
          quarantineRows: quarantineRecords.length,
          warningCount: qualitySummary.totals.warningCount,
          errorCount: qualitySummary.totals.errorCount,
          aiUsedSheets: qualitySummary.totals.aiUsedSheets
        }
      }
    };

  } catch (error: any) {
    console.error(`[ServerSync] ERROR:`, error);
    log(`[ServerSync] Lỗi đồng bộ nghiêm trọng: ${error.message || String(error)}`);
    return { success: false, error: error.message || String(error) };
  }
};
