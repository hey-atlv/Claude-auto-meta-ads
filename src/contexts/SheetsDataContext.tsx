import React, { createContext, useContext, useEffect, useState } from 'react';
import { collection, onSnapshot, query, getDocs, doc, getDoc, setDoc, where, orderBy, limit } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useAuth } from './AuthContext';
import { syncSheetData, SheetConfig } from '../lib/syncService';
import { format, subDays, startOfMonth } from 'date-fns';
import { parseCampaignName } from '../lib/campaignParser';

export interface AdsDataRow {
  id: string;
  date: string;
  market: string;
  account_id: string;
  account_name: string;
  campaign_id: string;
  campaign_name: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  brand?: string;
  page_code?: string;
  geography?: string;
  page_type?: string;
  content_id?: string;
  objective?: string;
  spend: number;
  impressions: number;
  reach?: number;
  frequency?: number;
  clicks: number;
  ctr_all?: number;
  cpm?: number;
  purchases: number;
  cost_per_purchase?: number;
  messages: number;
  cost_per_messaging_conversation?: number;
  revenue: number;
  personnel?: string;
  actualSpend: number;
}

export interface RoasSummary {
  id: string;
  reportMonth: string;
  startDate: string;
  endDate: string;
  channel: string;
  classification: string;
  personnel: string;
  total: {
    spend: number;
    dataCount: number;
    dataPrice: number;
    roasMonth: number;
    roas3Months: number;
  };
  domestic: {
    spend: number;
    dataCount: number;
    dataPrice: number;
    roasMonth: number;
    roas3Months: number;
  };
  overseas: {
    spend: number;
    dataCount: number;
    dataPrice: number;
    roasMonth: number;
    roas3Months: number;
  };
  updatedAt: number;
}

export interface DailySummary {
  id: string;
  date: string;
  spend: number;
  revenue: number;
  messaging: number;
  orders: number;
  data_platform?: number;
  markets?: Record<string, {
    spend: number;
    revenue: number;
    messaging: number;
    orders: number;
    data_platform?: number;
  }>;
}

export interface DataMTTRecord {
  date: string;        // "2026-05-01"
  name: string;        // original row name from sheet
  personnel: string;   // normalized: "Vũ Minh Hiếu" | "__team__" | "__domestic__" | "__overseas__"
  spend: number;
  dataMTT: number;     // Data mới + trùng tốt
  pricePerData: number;
}

interface PartnerFee {
  id: string;
  startDate: string;
  feeRate: number;
}

interface Partner {
  id: string;
  name: string;
  feeHistory: PartnerFee[];
}

const BANK_FEE = 0.011; // 1.1%
const VAT_FEE = 0.10; // 10%

interface SheetsDataContextValue {
  rows: AdsDataRow[];
  rawRows: AdsDataRow[];
  dailySummaries: DailySummary[];
  roasSummary: RoasSummary[];
  contents: any[];
  performance: any[];
  dataMTT: DataMTTRecord[];
  isLoading: boolean;
  isAutoSyncing: boolean;
  lastSyncTime: number | null;
  error: string | null;
  lastDataDate: string | null;
  marketFilter: string;
  setMarketFilter: (market: string) => void;
  personnelFilter: string;
  setPersonnelFilter: (personnel: string) => void;
  brandFilter: string;
  setBrandFilter: (brand: string) => void;
  formatFilter: string;
  setFormatFilter: (format: string) => void;
  adAccountsMap: Record<string, any>;
  fanpagesMap: Record<string, any>;
  partners: Partner[];
  refreshData: () => Promise<void>;
}

const SheetsDataContext = createContext<SheetsDataContextValue>({
  rows: [],
  rawRows: [],
  dailySummaries: [],
  roasSummary: [],
  contents: [],
  performance: [],
  dataMTT: [],
  isLoading: true,
  isAutoSyncing: false,
  lastSyncTime: null,
  error: null,
  lastDataDate: null,
  marketFilter: 'all',
  setMarketFilter: () => {},
  personnelFilter: 'all',
  setPersonnelFilter: () => {},
  brandFilter: 'all',
  setBrandFilter: () => {},
  formatFilter: 'all',
  setFormatFilter: () => {},
  adAccountsMap: {},
  fanpagesMap: {},
  partners: [],
  refreshData: async () => {},
});

export const useSheetsData = () => useContext(SheetsDataContext);

export const normalizePersonnelName = (adsName?: string, accountName?: string) => {
  const searchStr = (adsName || accountName || '').toLowerCase();
  if (searchStr.includes('hiếu')) return 'Vũ Minh Hiếu';
  if (searchStr.includes('ánh')) return 'Nguyễn Tiến Ánh';
  if (searchStr.includes('liên')) return 'Nguyễn Thị Liên';
  if (/\bka\b/.test(searchStr) || searchStr.includes('kim anh')) return 'Đặng Thị Kim Anh';
  if (searchStr.includes('khiêm')) return 'Quản Cao Khiêm';
  
  if (adsName && adsName.trim() !== '') return adsName;
  return accountName || 'Khác';
};

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

const handleFirestoreError = (error: any, operationType: OperationType, path: string | null) => {
  const errMessage = error instanceof Error ? error.message : String(error);
  const errInfo: FirestoreErrorInfo = {
    error: errMessage,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  const jsonError = JSON.stringify(errInfo);
  
  console.error('Firestore Error:', jsonError);
  return jsonError;
};

export const SheetsDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, role } = useAuth();
  const [rows, setRows] = useState<AdsDataRow[]>([]);
  const [dailySummaries, setDailySummaries] = useState<DailySummary[]>([]);
  const [roasSummary, setRoasSummary] = useState<RoasSummary[]>([]);
  const [contents, setContents] = useState<any[]>([]);
  const [performance, setPerformance] = useState<any[]>([]);
  const [dataMTT, setDataMTT] = useState<DataMTTRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAutoSyncing, setIsAutoSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [marketFilter, setMarketFilter] = useState<string>('all');
  const [personnelFilter, setPersonnelFilter] = useState<string>('all');
  const [brandFilter, setBrandFilter] = useState<string>('all');
  const [formatFilter, setFormatFilter] = useState<string>('all');
  const [adAccountsMap, setAdAccountsMap] = useState<Record<string, any>>({});
  const [fanpagesMap, setFanpagesMap] = useState<Record<string, any>>({});
  const [partners, setPartners] = useState<Partner[]>([]);

  // Check if PostgreSQL is available
  const checkPgAvailable = async (): Promise<boolean> => {
    try {
      const r = await fetch('/api/pg/health');
      const data = await r.json();
      return data.ok === true;
    } catch { return false; }
  };

  // Function to load entire caching data from server API
  const refreshData = async () => {
    setIsLoading(true);
    try {
      const pgAvailable = await checkPgAvailable();

      let cache: any = {};
      let accMap: Record<string, any> = {};
      let pageMap: Record<string, any> = {};
      if (pgAvailable) {
        console.log("[SheetsData] PostgreSQL available — loading analytics from PG...");
        // Load dimension data (small, always from cache for speed)
        const cacheRes = await fetch('/api/cached-data?type=all');
        cache = cacheRes.ok ? await cacheRes.json() : {};
        accMap = cache.adAccounts || {};
        pageMap = cache.fanpages || {};
        setAdAccountsMap(accMap);
        setFanpagesMap(pageMap);
        setContents(cache.contents || []);

        // Load analytics from PostgreSQL (faster + more accurate)
        // Note: content-performance from cache only — PG summary_content_perf has no per-content rows
        const [roasRes, dailyRes] = await Promise.all([
          fetch('/api/pg/roas-summary').then(r => r.json()).catch(() => []),
          fetch('/api/pg/daily-summaries').then(r => r.json()).catch(() => []),
        ]);

        // Map PG roas-summary to expected format for compatibility
        const roasGrouped: Record<string, any> = {};
        (roasRes as any[]).forEach((r: any) => {
          const id = [r.report_month, r.channel, r.classification, r.personnel].map((s: string) => String(s||'').replace(/\s+/g,'_')).join('_');
          if (!roasGrouped[id]) roasGrouped[id] = { id, reportMonth: r.report_month, channel: r.channel, classification: r.classification, personnel: r.personnel, total: {}, domestic: {}, overseas: {} };
          const geo = r.geography === 'domestic' ? 'domestic' : r.geography === 'overseas' ? 'overseas' : 'total';
          roasGrouped[id][geo] = { spend: r.spend, dataCount: r.data_count, dataPrice: r.data_price, roasMonth: r.roas_month, roas3Months: r.roas_3months };
        });
        setRoasSummary(Object.values(roasGrouped));

        // Map daily summaries
        const dailyMap: Record<string, any> = {};
        (dailyRes as any[]).forEach((r: any) => {
          if (!dailyMap[r.date]) dailyMap[r.date] = { id: r.date, date: r.date, spend: 0, messaging: 0, orders: 0, revenue: 0, data_platform: 0, markets: {} };
          const d = dailyMap[r.date];
          const geoLabel = r.geo_code === 'NN' ? 'Việt Kiều' : 'Nội Địa';
          d.spend    += Number(r.spend    || 0);
          d.messaging += Number(r.messaging || 0);
          d.orders   += Number(r.orders   || 0);
          if (!d.markets[geoLabel]) d.markets[geoLabel] = { spend: 0, messaging: 0, orders: 0 };
          d.markets[geoLabel].spend    += Number(r.spend    || 0);
          d.markets[geoLabel].messaging += Number(r.messaging || 0);
          d.markets[geoLabel].orders   += Number(r.orders   || 0);
        });
        // Merge with cache dailySummaries for dates not covered by PG
        const cacheDailyRes = await fetch('/api/cached-data?type=dailySummaries').then(r => r.ok ? r.json() : []).catch(() => []);
        const cacheDailySummaries: any[] = Array.isArray(cacheDailyRes) ? cacheDailyRes : (cacheDailyRes?.dailySummaries || []);
        cacheDailySummaries.forEach((s: any) => {
          if (s.date && !dailyMap[s.date]) {
            dailyMap[s.date] = s;
          }
        });
        setDailySummaries(Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date)));

        // Performance: always from cache (PG summary_content_perf has no per-content rows)
        setPerformance(cache.performance || []);
        setDataMTT(cache.dataMTT || []);

        console.log(`[SheetsData] PG loaded — ROAS: ${Object.keys(roasGrouped).length}, Daily: ${Object.keys(dailyMap).length}, Content: ${(cache.performance||[]).length}`);
      } else {
        // Fallback to server cache
        console.log("[SheetsData] PostgreSQL unavailable — falling back to server cache...");
        const res = await fetch('/api/cached-data?type=all');
        if (!res.ok) throw new Error("Không thể nạp dữ liệu đệm từ Server");
        cache = await res.json();
        accMap = cache.adAccounts || {};
        pageMap = cache.fanpages || {};
        setAdAccountsMap(accMap);
        setFanpagesMap(pageMap);
        setRoasSummary(cache.roasSummary || []);
        setDailySummaries(cache.dailySummaries || []);
        setContents(cache.contents || []);
        setPerformance(cache.performance || []);
        setDataMTT(cache.dataMTT || []);
      }

      // Always fetch Data_M+TT separately — /api/data-mtt auto-fetches from Sheet if cache is empty
      try {
        console.log('[SheetsData] Fetching dataMTT from /api/data-mtt (fresh)...');
        const mttRes = await fetch('/api/data-mtt?refresh=true');
        if (mttRes.ok) {
          const mttData = await mttRes.json();
          if (Array.isArray(mttData) && mttData.length > 0) {
            setDataMTT(mttData);
            console.log(`[SheetsData] dataMTT loaded: ${mttData.length} records`);
          } else {
            console.warn('[SheetsData] dataMTT: response is empty or invalid', mttData);
          }
        } else {
          const errBody = await mttRes.json().catch(() => ({}));
          console.error('[SheetsData] dataMTT fetch HTTP error:', mttRes.status, errBody);
        }
      } catch (e) {
        console.warn('[SheetsData] dataMTT fetch failed (non-critical):', e);
      }

      // Load partners from Firestore (It is tiny: safe, robust)
      let partnersList: Partner[] = [];
      try {
        const snap = await getDocs(collection(db, 'partners'));
        snap.forEach(d => {
          partnersList.push({ id: d.id, ...d.data() } as Partner);
        });
        setPartners(partnersList);
      } catch (e) {
        console.warn("Could not fetch partners from Firestore:", e);
      }

      const getFeeForDate = (partnerName: string | undefined, date: string) => {
        const partner = partnersList.find(p => p.name === partnerName);
        if (!partner || !partner.feeHistory || partner.feeHistory.length === 0) return 0.01;
        const sortedHistory = [...partner.feeHistory].sort((a, b) => b.startDate.localeCompare(a.startDate));
        const config = sortedHistory.find(c => c.startDate <= date);
        const rate = config ? Number(config.feeRate) : sortedHistory[sortedHistory.length - 1].feeRate;
        return isNaN(rate) ? 0.01 : rate;
      };

      // Process raw rows of Ads Data
      const rawAdsData = cache.adsData || [];
      const dedupeMap = new Map<string, AdsDataRow>();

      rawAdsData.forEach((rowData: any) => {
        let date = rowData.date || '';
        // Date normalization
        if (date.includes('.') || date.includes('/')) {
          const parts = date.replace(/\./g, '/').split('/');
          if (parts.length === 3) {
            if (parts[0].length === 4) {
              date = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
            } else {
              date = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            }
          }
        }

        const parsed = parseCampaignName(rowData.campaign_name || '');
        const acc = accMap[rowData.account_id];
        const adsName = acc?.Ads_name;
        const accountName = acc?.account_name || rowData.account_name;
        const personnel = normalizePersonnelName(adsName, accountName);

        const feeRate = getFeeForDate(acc?.Partner_name, date);
        const spendVal = Number(rowData.spend) || 0;
        const actualSpend = Math.round(spendVal * (1 + VAT_FEE + feeRate + BANK_FEE));

        const processedRow: AdsDataRow = {
          ...rowData,
          date,
          id: rowData.id || `${date}_${rowData.account_id}_${rowData.campaign_id}`,
          market: parsed.market || rowData.market,
          brand: parsed.brand || rowData.brand,
          page_code: parsed.page_code || rowData.page_code || "",
          page_type: parsed.page_type || rowData.page_type,
          personnel,
          actualSpend
        };

        const adId = rowData.ad_id || rowData.ad_name || 'no-ad-id';
        const logicKey = `${date}_${rowData.account_id}_${rowData.campaign_id}_${adId}`;

        const existing = dedupeMap.get(logicKey);
        if (!existing) {
          dedupeMap.set(logicKey, processedRow);
        } else {
          if ((processedRow.spend || 0) > (existing.spend || 0)) {
            dedupeMap.set(logicKey, processedRow);
          }
        }
      });

      setRows(Array.from(dedupeMap.values()));
      setError(null);
      console.log(`[SheetsData] Successfully loaded cache data. Row count: ${dedupeMap.size}`);
    } catch (e: any) {
      console.error("Error loading cache:", e);
      setError("Không thể tải dữ liệu tích luỹ từ Server. Kiểm tra cấu hình Google Sheets và tài khoản Admin.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!user) {
      setRows([]);
      setRoasSummary([]);
      setAdAccountsMap({});
      setFanpagesMap({});
      setContents([]);
      setPerformance([]);
      setIsLoading(false);
      return;
    }

    // Initial fetch of cached data
    refreshData();

    // Sync client-read configs to server to avoid serverside Firestore permission / quota issues
    const syncClientConfigsToServer = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, 'sheetsConfigs'));
        const configsList: SheetConfig[] = [];
        querySnapshot.forEach((docSnap) => {
          configsList.push({ id: docSnap.id, ...docSnap.data() } as SheetConfig);
        });
        if (configsList.length > 0) {
          await fetch('/api/save-configs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ configs: configsList })
          });
          console.log("[SheetsData] Background synced sheetsConfigs to server cache.");
        }
      } catch (e) {
        console.warn("[SheetsData] Background config sync warning:", e);
      }
    };
    syncClientConfigsToServer();

    // Listen to partners collection (Occasional tiny reads only)
    const partnersUnsubscribe = onSnapshot(collection(db, 'partners'), (snap) => {
      const list: Partner[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() } as Partner);
      });
      setPartners(list);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'partners');
    });

    // Listen to system sync logs snapshot to auto refetch
    const metaUnsubscribe = onSnapshot(doc(db, 'system', 'sync_meta'), (docSnap) => {
      if (docSnap.exists()) {
        const meta = docSnap.data();
        setLastSyncTime(meta.lastSyncedAt || null);
        console.log("[SheetsData] Phát hiện trạng thái đồng bộ được sửa đổi. Đang cập nhật dữ liệu...");
        refreshData();
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'system/sync_meta');
    });

    return () => {
      partnersUnsubscribe();
      metaUnsubscribe();
    };
  }, [user]);

  // Calculate last data date
  const lastDataDate = React.useMemo(() => {
    if (!rows.length) return null;
    const maxDateStr = rows.reduce((max, row) => 
      row.date > max ? row.date : max, rows[0].date
    );
    return maxDateStr;
  }, [rows]);

  // Filter rows by global filters
  const filteredRows = React.useMemo(() => {
    let result = rows;
    if (marketFilter !== 'all') {
      result = result.filter(r => r.market === marketFilter);
    }
    if (personnelFilter !== 'all') {
      result = result.filter(r => r.personnel === personnelFilter);
    }
    if (brandFilter !== 'all') {
      result = result.filter(r => r.brand === brandFilter);
    }
    if (formatFilter !== 'all') {
      result = result.filter(r => r.page_type === formatFilter);
    }
    return result;
  }, [rows, marketFilter, personnelFilter, brandFilter, formatFilter]);

  return (
    <SheetsDataContext.Provider value={{ 
      rows: filteredRows, 
      rawRows: rows,
      dailySummaries,
      roasSummary,
      contents,
      performance,
      dataMTT,
      isLoading,
      isAutoSyncing,
      lastSyncTime,
      error, 
      lastDataDate,
      marketFilter,
      setMarketFilter,
      personnelFilter,
      setPersonnelFilter,
      brandFilter,
      setBrandFilter,
      formatFilter,
      setFormatFilter,
      adAccountsMap,
      fanpagesMap,
      partners,
      refreshData
    }}>
      {children}
    </SheetsDataContext.Provider>
  );
};
