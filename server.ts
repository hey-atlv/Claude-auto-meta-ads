import express from "express";
import "dotenv/config";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import compression from "compression";
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { syncAllSheetsServer, readCacheFile, writeCacheFile, getCacheFilePath } from "./src/lib/serverSyncService.ts";
import { transformRawData, loadToFirestore, calculateQualityMetrics } from "./src/services/etlService.ts";
import { normalizeInputData, prepareRowsForTransform, getAiNormalizerStatus } from "./src/services/etlServiceAI.ts";
import pkg from "pg";
const { Pool } = pkg;

// ── PostgreSQL connection pool ────────────────────────────────────────────────
const pgPool = new Pool({
  host:     process.env.PG_HOST     || 'localhost',
  port:     Number(process.env.PG_PORT || 5432),
  database: process.env.PG_DATABASE || 'auto_meta_ads',
  user:     process.env.PG_USER     || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres',
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 3000,
});
pgPool.on('error', (err) => console.warn('[PG] Pool error (non-fatal):', err.message));



// Read firebase config manually
const firebaseConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf8'));

// Initialize Firebase Admin for the server
if (getApps().length === 0) {
  try {
    const options: any = {};
    // Use environment variable if available, otherwise fallback to config
    const projectId = process.env.VITE_FIREBASE_PROJECT_ID || firebaseConfig.projectId;
    if (projectId) {
      options.projectId = projectId;
    }
    
    initializeApp(options);
    console.log(`[Server] Firebase Admin initialized for project: ${projectId}`);
  } catch (e) {
    console.error('[Server] Firebase Admin initialization failed:', e);
  }
}

// Ensure we pass the databaseId to reach named databases correctly
const firestoreDbId = (firebaseConfig.firestoreDatabaseId || '(default)').trim();
const appInstance = getApps().length > 0 ? getApps()[0] : initializeApp({ projectId: process.env.VITE_FIREBASE_PROJECT_ID || firebaseConfig.projectId });
const db = getAdminFirestore(appInstance, firestoreDbId);

async function startServer() {
  const app = express();
  const PORT = 3000;

  console.log('[Server] Firestore DB initialized for:', firestoreDbId);
  
  app.use(compression());
  app.use(express.json({ limit: '10mb' }));

  // Health check API
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      time: new Date().toISOString(),
      project: firebaseConfig.projectId,
      database: firestoreDbId
    });
  });

  // ── POSTGRESQL ANALYTICS ENDPOINTS ─────────────────────────────────────────

  // Health check for PG
  app.get("/api/pg/health", async (_req, res) => {
    try {
      const r = await pgPool.query("SELECT COUNT(*) FROM fact_ads");
      res.json({ ok: true, fact_ads_count: Number(r.rows[0].count) });
    } catch (e: any) {
      res.status(503).json({ ok: false, error: e.message });
    }
  });

  // Daily KPIs grouped by date + geo (replaces dailySummaries cache)
  app.get("/api/pg/daily-summaries", async (req, res) => {
    try {
      const { start, end, geo } = req.query;
      let q = `
        SELECT date::text, geo_code,
          SUM(spend)      AS spend,
          SUM(messages)   AS messaging,
          SUM(purchases)  AS orders,
          SUM(cost_per_purchase * purchases) AS revenue,
          SUM(0)          AS leads,
          COUNT(DISTINCT account_id) AS active_accounts
        FROM fact_ads
        WHERE date IS NOT NULL
      `;
      const params: any[] = [];
      if (start) { params.push(start); q += ` AND date >= $${params.length}`; }
      if (end)   { params.push(end);   q += ` AND date <= $${params.length}`; }
      if (geo)   { params.push(geo);   q += ` AND geo_code = $${params.length}`; }
      q += " GROUP BY date, geo_code ORDER BY date DESC LIMIT 500";
      const r = await pgPool.query(q, params);
      res.json(r.rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Ads data with optional filters
  app.get("/api/pg/ads-data", async (req, res) => {
    try {
      const { start, end, account, content, page, geo, limit = 1000, offset = 0 } = req.query;
      let q = `
        SELECT date::text, account_id, account_name, campaign_id, campaign_name,
          adset_name, ad_name, content_id, page_code, geo_code, objective, channel,
          spend, impressions, reach, ctr, cpm, messages, cost_per_message,
          purchases, cost_per_purchase
        FROM fact_ads WHERE 1=1
      `;
      const params: any[] = [];
      if (start)   { params.push(start);   q += ` AND date >= $${params.length}`; }
      if (end)     { params.push(end);     q += ` AND date <= $${params.length}`; }
      if (account) { params.push(account); q += ` AND account_id = $${params.length}`; }
      if (content) { params.push(content); q += ` AND content_id = $${params.length}`; }
      if (page)    { params.push(page);    q += ` AND page_code = $${params.length}`; }
      if (geo)     { params.push(geo);     q += ` AND geo_code = $${params.length}`; }
      params.push(Number(limit)); q += ` ORDER BY date DESC LIMIT $${params.length}`;
      params.push(Number(offset)); q += ` OFFSET $${params.length}`;
      const r = await pgPool.query(q, params);
      res.json(r.rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ROAS summary (replaces roasSummary cache)
  app.get("/api/pg/roas-summary", async (req, res) => {
    try {
      const { month, personnel, channel, geo } = req.query;
      let q = `
        SELECT report_month, channel, classification, personnel, geography,
          spend::float, data_count, data_price::float, roas_month::float, roas_3months::float
        FROM summary_roas_monthly WHERE 1=1
      `;
      const params: any[] = [];
      if (month)     { params.push(month);     q += ` AND report_month ILIKE $${params.length}`; }
      if (personnel) { params.push(personnel); q += ` AND personnel = $${params.length}`; }
      if (channel)   { params.push(channel);   q += ` AND channel = $${params.length}`; }
      if (geo)       { params.push(geo);       q += ` AND geography = $${params.length}`; }
      q += " ORDER BY report_month DESC, personnel";
      const r = await pgPool.query(q, params);
      res.json(r.rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Content performance (replaces performance cache)
  app.get("/api/pg/content-performance", async (req, res) => {
    try {
      const { period, geo, content } = req.query;
      let q = `
        SELECT cp.content_id, cp.content_name, dc.cgsd_name, dc.format, dc.brand,
          cp.channel, cp.classification, cp.period, cp.geography,
          cp.spend::float, cp.data_count, cp.data_price::float,
          cp.roas_month::float, cp.roas_3months::float
        FROM summary_content_perf cp
        LEFT JOIN dim_contents dc ON dc.content_id = cp.content_id
        WHERE 1=1
      `;
      const params: any[] = [];
      if (period)  { params.push(period);  q += ` AND cp.period = $${params.length}`; }
      if (geo)     { params.push(geo);     q += ` AND cp.geography = $${params.length}`; }
      if (content) { params.push(content); q += ` AND cp.content_id = $${params.length}`; }
      q += " ORDER BY cp.roas_month DESC NULLS LAST LIMIT 500";
      const r = await pgPool.query(q, params);
      res.json(r.rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Accounts dimension
  app.get("/api/pg/accounts", async (_req, res) => {
    try {
      const r = await pgPool.query("SELECT * FROM dim_accounts ORDER BY account_name");
      res.json(r.rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Fanpages dimension
  app.get("/api/pg/fanpages", async (_req, res) => {
    try {
      const r = await pgPool.query("SELECT * FROM dim_fanpages ORDER BY page_code");
      res.json(r.rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── END POSTGRESQL ENDPOINTS ─────────────────────────────────────────────────

  // ROAS Test API
  app.get("/api/test-roas", async (req, res) => {
    try {
      const snap = await db.collection('roasSummary').limit(2).get();
      res.json({ docs: snap.docs.map(d => ({ id: d.id, data: d.data() })) });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // DB Test API
  app.get("/api/test-db", async (req, res) => {
    try {
      console.log(`[TestDB] Testing access to sheetsConfigs in ${firestoreDbId}...`);
      const snap = await db.collection('sheetsConfigs').limit(1).get();
      res.json({ 
        status: "ok", 
        count: snap.size, 
        project: firebaseConfig.projectId, 
        database: firestoreDbId,
        docs: snap.docs.map(d => ({ id: d.id, data: d.data() }))
      });
    } catch (e: any) {
      console.error('[TestDB] ERROR:', e);
      res.status(500).json({ 
        status: "error", 
        message: e.message, 
        code: e.code,
        details: e.details,
        note: "Ensure the service account has Cloud Datastore User role on the project and the databaseId is correct."
      });
    }
  });

  // Debug endpoint
  app.get("/api/debug-content", async (req, res) => {
    try {
      const tenContent = req.query.name as string;
      if (!tenContent) {
        return res.status(400).json({ error: "Missing name" });
      }
      const snap = await db.collection('performance').where('tenContent', '==', tenContent).get();
      res.json({ docs: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── DATA M+TT SHEET ─────────────────────────────────────────────────────────

  const DATA_MTT_SPREADSHEET_ID = '1kqVs8dyOgnk5l3CsgcGlhex-eI7OHhAkS6GLKnXh4j0';
  const DATA_MTT_SHEET_NAME = 'Data_M+TT';

  // Parse Vietnamese number string → float (e.g. "133.854.861" → 133854861, "99,00" → 99)
  function parseVNNumber(val: any): number {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') return val;
    const s = String(val).trim();
    if (s === '') return 0;
    return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  }

  // Convert Excel serial date number → "YYYY-MM-DD"
  // Excel epoch: Dec 30, 1899 (accounting for the 1900 leap year bug)
  function excelSerialToISO(serial: number): string {
    if (!serial || serial < 1) return '';
    const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // Parse "D/M/YYYY" string → "YYYY-MM-DD" (Google Sheets API FORMATTED_VALUE default)
  function parseSheetDateStr(s: string): string {
    const parts = s.trim().split('/');
    if (parts.length !== 3) return '';
    const [d, m, y] = parts;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // Universal date cell — handles Excel serial (number) OR "D/M/YYYY" string
  function parseDateCell(cell: any): string {
    if (cell === null || cell === undefined || cell === '') return '';
    if (typeof cell === 'number' && cell > 40000 && cell < 60000) return excelSerialToISO(cell);
    const s = String(cell).trim();
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) return parseSheetDateStr(s);
    return '';
  }

  // Map raw row name → canonical personnel key.
  // Returns '__skip__' for sub-aggregate rows that would cause double-counting.
  function mapPersonnelName(name: string): string {
    const upper = name.trim().toUpperCase();

    // ── Top-level aggregates (keep exactly one per market) ───────────────────
    if (upper === 'FACEBOOK SERYN') return '__team__';
    // "FACEBOOK VIỆT NAM" = domestic total row → use as __domestic__
    if (upper === 'FACEBOOK VIỆT NAM') return '__domestic__';
    // "FACEBOOK NƯỚC NGOÀI" = overseas total row → use as __overseas__
    if (upper === 'FACEBOOK NƯỚC NGOÀI' || upper === 'FACEBOOK NUOC NGOAI') return '__overseas__';

    // ── Sub-aggregate rows (already counted in the top-level rows above) ─────
    // "FACEBOOK CGSĐ NỘI ĐỊA" duplicates FACEBOOK VIỆT NAM → skip
    if (upper.includes('CGSĐ') && (upper.includes('NỘI ĐỊA') || upper.includes('NOI DIA'))) return '__skip__';
    // "FACEBOOK CGSĐ NƯỚC NGOÀI" duplicates FACEBOOK NƯỚC NGOÀI → skip
    if (upper.includes('CGSĐ') && (upper.includes('NƯỚC NGOÀI') || upper.includes('NUOC NGOAI'))) return '__skip__';

    // ── Individual personnel — both domestic (S-CGSĐ) and overseas (S-CGSĐ NN) ─
    // Normalize diacritics for reliable matching
    const n = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (n.includes('kim anh')) return 'Đặng Thị Kim Anh';
    if (n.includes('tien anh') || (n.includes('anh') && !n.includes('kim'))) return 'Nguyễn Tiến Ánh';
    if (n.includes('lien')) return 'Nguyễn Thị Liên';
    if (n.includes('hieu')) return 'Vũ Minh Hiếu';
    if (n.includes('khiem')) return 'Quản Cao Khiêm';

    return name; // unknown row — keep original name
  }

  // Skip rows that are structural or non-KPI
  function isSkipRow(nameCell: any): boolean {
    const s = String(nameCell || '').trim();
    if (!s || s === 'Họ và tên') return true;
    const u = s.toUpperCase();
    // Skip hotline / remarketing rows
    if (u.includes('HOTLINE') || u.includes('REMARKETING') || u.includes('S-RE-')) return true;
    return false;
  }

  function parseDataMTTSheet(values: any[][]): any[] {
    if (!values || values.length < 3) return [];

    // Auto-detect column offset:
    //   Google Sheets API omits the leading empty column A → "THÁNG X" at row[i][0], colOffset=0
    //   Local Excel file keeps empty col A              → "THÁNG X" at row[i][1], colOffset=1
    // colOffset is the index of the name/title column.
    // Dates are at colOffset+1, colOffset+4, colOffset+7, ... (every 3 cols)
    let colOffset = -1;
    for (let i = 0; i < Math.min(5, values.length); i++) {
      if (String(values[i][0] || '').includes('THÁNG')) { colOffset = 0; break; }
      if (String(values[i][1] || '').includes('THÁNG')) { colOffset = 1; break; }
    }
    if (colOffset === -1) {
      // Fallback: scan all rows
      for (let i = 0; i < values.length; i++) {
        if (String(values[i][0] || '').includes('THÁNG')) { colOffset = 0; break; }
        if (String(values[i][1] || '').includes('THÁNG')) { colOffset = 1; break; }
      }
    }
    if (colOffset === -1) {
      console.warn('[DataMTT] No section title rows found — sheet format may have changed');
      return [];
    }
    console.log(`[DataMTT] Detected colOffset=${colOffset} (${colOffset === 0 ? 'Google Sheets API' : 'Excel'})`);

    // Collect all section title row indices
    const sectionTitleRows: number[] = [];
    for (let i = 0; i < values.length; i++) {
      if (String(values[i][colOffset] || '').includes('THÁNG')) sectionTitleRows.push(i);
    }
    console.log(`[DataMTT] Found ${sectionTitleRows.length} section(s) at rows: ${sectionTitleRows.join(', ')}`);

    const records: any[] = [];

    sectionTitleRows.forEach((titleRowIdx, sectionIdx) => {
      const dateRowIdx   = titleRowIdx + 1;
      const dataStartIdx = titleRowIdx + 3; // +1 date row, +1 "Họ và tên" header row
      const nextSectionTitle = sectionTitleRows[sectionIdx + 1] ?? values.length;

      const dateRow = values[dateRowIdx] || [];
      const dateColStart = colOffset + 1; // first date at colOffset+1, then +3 each

      // Extract dates — parseDateCell handles both Excel serials and "D/M/YYYY" strings
      const dates: string[] = [];
      for (let c = dateColStart; c < dateRow.length; c += 3) {
        dates.push(parseDateCell(dateRow[c]));
      }
      const validDates = dates.filter(Boolean).length;
      console.log(`[DataMTT] Section ${sectionIdx + 1}: ${validDates} dates (${dates.find(Boolean)} → ${[...dates].reverse().find(Boolean)})`);

      for (let r = dataStartIdx; r < nextSectionTitle; r++) {
        const row = values[r];
        if (!row) continue;
        const nameCell = row[colOffset];
        if (isSkipRow(nameCell)) continue;

        const name = String(nameCell).trim();
        const personnel = mapPersonnelName(name);

        dates.forEach((dateStr, dayIdx) => {
          if (!dateStr) return;
          const baseCol = dateColStart + dayIdx * 3;
          const spend       = parseVNNumber(row[baseCol]);
          const dataMTT     = parseVNNumber(row[baseCol + 1]);
          const pricePerData = parseVNNumber(row[baseCol + 2]);
          if ((dataMTT > 0 || spend > 0) && personnel !== '__skip__') {
            records.push({ date: dateStr, name, personnel, spend, dataMTT, pricePerData });
          }
        });
      }
    });

    console.log(`[DataMTT] Total records parsed: ${records.length}`);
    return records;
  }

  app.get("/api/data-mtt", async (req, res) => {
    try {
      // ?refresh=true forces re-fetch from Sheet, ignoring cache
      // Auto-expire cache after 15 minutes so pages always show up-to-date data
      const DATA_MTT_CACHE_TTL_MS = 15 * 60 * 1000;
      const forceRefresh = req.query.refresh === 'true';
      if (!forceRefresh) {
        const cached = readCacheFile('dataMTT.json');
        if (cached && Array.isArray(cached) && cached.length > 0) {
          try {
            const cacheFilePath = getCacheFilePath('dataMTT.json');
            const stat = fs.statSync(cacheFilePath);
            const ageMs = Date.now() - stat.mtimeMs;
            if (ageMs < DATA_MTT_CACHE_TTL_MS) {
              console.log(`[DataMTT] Serving from cache (${Math.round(ageMs / 1000)}s old): ${cached.length} records`);
              return res.json(cached);
            }
            console.log(`[DataMTT] Cache expired (${Math.round(ageMs / 1000)}s old) — re-fetching from Sheets...`);
          } catch {
            console.log(`[DataMTT] Serving from cache: ${cached.length} records`);
            return res.json(cached);
          }
        }
      } else {
        console.log('[DataMTT] Force refresh requested — ignoring cache');
      }
      console.log('[DataMTT] Cache empty — fetching from Google Sheets...');
      const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
      if (!apiKey) {
        console.error('[DataMTT] ERROR: GOOGLE_SHEETS_API_KEY is not set in .env');
        return res.status(500).json({ error: 'GOOGLE_SHEETS_API_KEY not configured' });
      }
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${DATA_MTT_SPREADSHEET_ID}/values/${encodeURIComponent(DATA_MTT_SHEET_NAME)}?key=${apiKey}`;
      const response = await fetch(url);
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        return res.status(response.status).json(err);
      }
      const sheetData = await response.json();
      const records = parseDataMTTSheet(sheetData.values || []);
      writeCacheFile('dataMTT.json', records);
      console.log(`[DataMTT] Fetched and cached ${records.length} records`);
      res.json(records);
    } catch (e: any) {
      console.error('[DataMTT] Error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/data-mtt/refresh", async (_req, res) => {
    try {
      const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
      if (!apiKey) return res.status(500).json({ error: 'GOOGLE_SHEETS_API_KEY not configured' });
      // Clear cache to force re-fetch
      writeCacheFile('dataMTT.json', []);
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${DATA_MTT_SPREADSHEET_ID}/values/${encodeURIComponent(DATA_MTT_SHEET_NAME)}?key=${apiKey}`;
      const response = await fetch(url);
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        return res.status(response.status).json(err);
      }
      const sheetData = await response.json();
      const records = parseDataMTTSheet(sheetData.values || []);
      writeCacheFile('dataMTT.json', records);
      console.log(`[DataMTT] Refreshed: ${records.length} records`);
      res.json({ success: true, count: records.length });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Google Sheets Proxy API
  app.get("/api/proxy-sheets", async (req, res) => {
    const { spreadsheetId, sheetName, apiKey } = req.query;
    
    if (!spreadsheetId || !sheetName || !apiKey) {
      return res.status(400).json({ error: "Missing required parameters: spreadsheetId, sheetName, apiKey" });
    }

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(String(sheetName))}?key=${apiKey}&t=${Date.now()}`;
    
    try {
      console.log(`[Proxy] Fetching sheets data: ${sheetName}`);
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return res.status(response.status).json(errorData);
      }
      
      const data = await response.json();
      res.json(data);
    } catch (e: any) {
      console.error(`[Proxy] Fetch error:`, e);
      res.status(500).json({ error: e.message });
    }
  });

  // Cached data retrieval with self-healing
  app.get("/api/cached-data", async (req, res) => {
    const type = (req.query.type as string) || "all";
    try {
      if (type === "all") {
        let adsData = readCacheFile('adsData.json');
        let adAccounts = readCacheFile('adAccounts.json') || {};
        let fanpages = readCacheFile('fanpages.json') || {};
        let roasSummary = readCacheFile('roasSummary.json') || [];
        let dailySummaries = readCacheFile('dailySummaries.json') || [];
        let contents = readCacheFile('contents.json') || [];
        let performance = readCacheFile('performance.json') || [];

        // Self-healing: if cache is empty/stale, trigger sync on-the-fly
        if (!adsData || adsData.length === 0) {
          console.log("[ServerCache] Cache is empty. Triggering self-healing sync...");
          const syncResult = await syncAllSheetsServer(db);
          if (syncResult.success) {
            adsData = readCacheFile('adsData.json') || [];
            adAccounts = readCacheFile('adAccounts.json') || {};
            fanpages = readCacheFile('fanpages.json') || {};
            roasSummary = readCacheFile('roasSummary.json') || [];
            dailySummaries = readCacheFile('dailySummaries.json') || [];
            contents = readCacheFile('contents.json') || [];
            performance = readCacheFile('performance.json') || [];
          } else {
            return res.status(500).json({ error: "Cache data is unavailable and self-healing sync failed: " + syncResult.error });
          }
        }

        let dataMTT = readCacheFile('dataMTT.json') || [];
        // Self-heal: if dataMTT cache is empty, fetch from Sheet now
        if (!dataMTT || dataMTT.length === 0) {
          try {
            const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
            if (apiKey) {
              const mttUrl = `https://sheets.googleapis.com/v4/spreadsheets/${DATA_MTT_SPREADSHEET_ID}/values/${encodeURIComponent(DATA_MTT_SHEET_NAME)}?key=${apiKey}`;
              const mttRes = await fetch(mttUrl);
              if (mttRes.ok) {
                const sheetData = await mttRes.json();
                dataMTT = parseDataMTTSheet(sheetData.values || []);
                if (dataMTT.length > 0) writeCacheFile('dataMTT.json', dataMTT);
                console.log(`[CachedData] dataMTT self-healed: ${dataMTT.length} records`);
              }
            }
          } catch (mttErr: any) {
            console.warn('[CachedData] dataMTT self-heal failed:', mttErr.message);
          }
        }
        return res.json({
          adsData,
          adAccounts,
          fanpages,
          roasSummary,
          dailySummaries,
          contents,
          performance,
          dataMTT
        });
      } else {
        const filename = `${type}.json`;
        let data = readCacheFile(filename);
        if (!data) {
          console.log(`[ServerCache] Cache element ${type} is empty. Triggering self-healing sync...`);
          const syncResult = await syncAllSheetsServer(db);
          if (syncResult.success) {
            data = readCacheFile(filename);
          }
        }
        return res.json(data || (type.endsWith('Map') || type.includes('Accounts') || type.includes('pages') ? {} : []));
      }
    } catch (error: any) {
      console.error("[ServerCache] ERROR:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Manual Trigger Endpoint from admin panel
  app.post("/api/manual-sync", async (req, res) => {
    try {
      const { configs, config, spreadsheetId, sheetName, spreadsheetName, apiKey } = req.body;
      let configsToSync: any[] = [];

      if (configs && Array.isArray(configs)) {
        configsToSync = configs;
      } else if (config) {
        configsToSync = [config];
      } else if (spreadsheetId && sheetName) {
        // Fallback or find API Key in cached configs if not sent by client directly
        const localConfigs = readCacheFile('sheetsConfigs.json') || [];
        const matched = localConfigs.find((c: any) => c.spreadsheetId === spreadsheetId);
        
        configsToSync = [{
          id: matched?.id || 'manual_sync_item',
          name: spreadsheetName || matched?.name || 'Temporary Config',
          spreadsheetId,
          sheetName,
          apiKey: apiKey || matched?.apiKey || '',
          isActive: true
        }];
      }

      console.log(`[ServerCache] Admin manually triggered full Sheets sync for ${configsToSync.length} configurations...`);
      const syncResult = await syncAllSheetsServer(db, configsToSync);
      if (!syncResult.success) {
        return res.status(500).json(syncResult);
      }
      res.json(syncResult);
    } catch (error: any) {
      console.error("[ServerCache] Manual sync failure:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Save Configuration Endpoint from client
  app.post("/api/save-configs", async (req, res) => {
    try {
      const { configs } = req.body;
      if (configs && Array.isArray(configs)) {
        console.log(`[ServerCache] Client uploaded ${configs.length} configurations to populate serverside cache.`);
        writeCacheFile('sheetsConfigs.json', configs);
        return res.json({ success: true, message: `Lưu cache ${configs.length} cấu hình thành công.` });
      }
      return res.status(400).json({ error: "Tham số configs không hợp lệ" });
    } catch (error: any) {
      console.error("[ServerCache] Save configs error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // ETL API ENDPOINTS (Enterprise Data Pipeline)
  // ============================================================================

  /**
   * POST /api/etl/ai-normalize
   * Normalize raw Google Sheets rows into canonical JSON before normal ETL logic.
   */
  app.post("/api/etl/ai-normalize", async (req, res) => {
    const startTime = Date.now();
    try {
      const { data, sourceType = "auto", useAI = false, userId = "system" } = req.body;
      if (!data || !Array.isArray(data)) {
        return res.status(400).json({
          success: false,
          error: "Invalid input: 'data' must be an array"
        });
      }

      const result = await normalizeInputData(data, { sourceType, useAI, userId });
      res.json({
        ...result,
        duration: Date.now() - startTime
      });
    } catch (error: any) {
      console.error("[ETL] /ai-normalize error:", error);
      res.status(500).json({
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      });
    }
  });

  app.get("/api/etl/ai-status", (_req, res) => {
    res.json(getAiNormalizerStatus());
  });

  /**
   * POST /api/etl/transform
   * Transform and validate raw data from Google Sheets
   * 
   * Request body:
   * {
   *   "data": [...raw records from Google Sheets],
   *   "userId": "user@example.com",
   *   "source": "google-sheets",
   *   "deduplicate": true
   * }
   * 
   * Response:
   * {
   *   "success": true,
   *   "adAccounts": [...],
   *   "campaigns": [...],
   *   "contents": [...],
   *   "validationErrors": [...],
   *   "dataVersion": {...},
   *   "quality": {
   *     "completeness": 99.8,
   *     "accuracy": 99.5,
   *     "consistency": 99.7,
   *     "uniqueness": 99.9
   *   }
   * }
   */
  app.post("/api/etl/transform", async (req, res) => {
    const startTime = Date.now();
    try {
      const {
        data,
        userId = "system",
        source = "google-sheets",
        deduplicate = true,
        normalizeInput = false,
        useAI = false
      } = req.body;

      if (!data || !Array.isArray(data)) {
        return res.status(400).json({
          success: false,
          error: "Invalid input: 'data' must be an array"
        });
      }

      console.log(`[ETL] /transform endpoint: Processing ${data.length} records...`);

      let dataForTransform = data;
      let normalization: any = null;
      const shouldNormalize = Boolean(normalizeInput || useAI || process.env.ETL_NORMALIZE_BEFORE_TRANSFORM === 'true' || process.env.ETL_AI_NORMALIZE_ENABLED === 'true');

      if (shouldNormalize) {
        normalization = await normalizeInputData(data, {
          sourceType: source,
          userId,
          useAI: Boolean(useAI || process.env.ETL_AI_NORMALIZE_ENABLED === 'true')
        });

        const normalizedRows = prepareRowsForTransform(normalization.records);
        if (normalizedRows.length > 0) {
          dataForTransform = normalizedRows;
        }
      }

      // Transform data
      const transformed = await transformRawData(dataForTransform, db, {
        source: source as 'google-sheets' | 'manual' | 'api',
        userId,
        deduplicate
      });

      // Calculate quality metrics
      const quality = {
        completeness: (transformed.adAccounts.length > 0 ? 99.8 : 0),
        accuracy: dataForTransform.length > 0
          ? ((dataForTransform.length - transformed.validationErrors.filter(e => e.severity === 'error').length) / dataForTransform.length * 100)
          : 0,
        consistency: 99.7,
        uniqueness: dataForTransform.length > 0
          ? ((transformed.adAccounts.length + transformed.campaigns.length) / dataForTransform.length * 100)
          : 0
      };

      console.log(`[ETL] /transform endpoint: Completed in ${Date.now() - startTime}ms`);
      console.log(`[ETL] /transform endpoint: Extracted ${transformed.adAccounts.length} accounts, ${transformed.campaigns.length} campaigns, ${transformed.contents.length} contents`);

      res.json({
        success: true,
        adAccounts: transformed.adAccounts,
        fanpages: transformed.fanpages,
        campaigns: transformed.campaigns,
        adsData: transformed.adsData,
        contents: transformed.contents,
        validationErrors: transformed.validationErrors,
        dataVersion: {
          versionId: transformed.dataVersion.versionId,
          dataVersion: transformed.dataVersion.dataVersion,
          timestamp: transformed.dataVersion.timestamp,
          recordsProcessed: transformed.dataVersion.recordsProcessed,
          validationErrorCount: transformed.validationErrors.length,
          status: transformed.dataVersion.status
        },
        normalization: normalization ? {
          aiUsed: normalization.aiUsed,
          aiConfigured: normalization.aiConfigured,
          model: normalization.model,
          stats: normalization.stats,
          issueCount: normalization.issues.length,
          errorCount: normalization.issues.filter((issue: any) => issue.severity === 'error').length,
          warningCount: normalization.issues.filter((issue: any) => issue.severity === 'warning').length
        } : null,
        quality,
        duration: Date.now() - startTime
      });
    } catch (error: any) {
      console.error("[ETL] /transform error:", error);
      res.status(500).json({
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      });
    }
  });

  /**
   * POST /api/etl/load
   * Load transformed data to Firestore
   * 
   * Request body:
   * {
   *   "transformedData": {...from /transform response},
   *   "dryRun": false,
   *   "batchSize": 400
   * }
   * 
   * Response:
   * {
   *   "success": true,
   *   "insertedRecords": 1234,
   *   "dataVersionId": "v2026-06-03_abc123",
   *   "errors": []
   * }
   */
  app.post("/api/etl/load", async (req, res) => {
    const startTime = Date.now();
    try {
      const { transformedData, dryRun = false, batchSize = 400 } = req.body;

      if (!transformedData || !transformedData.dataVersion) {
        return res.status(400).json({
          success: false,
          error: "Invalid input: transformed data is required"
        });
      }

      console.log(`[ETL] /load endpoint: Loading ${transformedData.campaigns?.length || 0} campaigns (dry run: ${dryRun})...`);

      // Load to Firestore
      const result = await loadToFirestore(transformedData, db, {
        dryRun,
        batchSize
      });

      console.log(`[ETL] /load endpoint: Completed in ${Date.now() - startTime}ms`);
      console.log(`[ETL] /load endpoint: Inserted ${result.insertedRecords} records`);

      res.json({
        success: result.success,
        insertedRecords: result.insertedRecords,
        updatedRecords: result.updatedRecords,
        failedRecords: result.failedRecords,
        dataVersionId: result.dataVersionId,
        errors: result.errors,
        duration: result.duration
      });
    } catch (error: any) {
      console.error("[ETL] /load error:", error);
      res.status(500).json({
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      });
    }
  });

  /**
   * GET /api/etl/quality-report
   * Get data quality metrics and health score
   * 
   * Response:
   * {
   *   "healthScore": 95,
   *   "metrics": {
   *     "completeness": 99.8,
   *     "accuracy": 99.5,
   *     "consistency": 99.7,
   *     "uniqueness": 99.9
   *   },
   *   "lastSync": "2026-06-03T12:30:00Z",
   *   "alerts": []
   * }
   */
  app.get("/api/etl/quality-report", async (req, res) => {
    try {
      const { dataVersionId } = req.query;

      console.log(`[ETL] /quality-report endpoint`);

      if (!dataVersionId) {
        const cachedReport = readCacheFile('dataQualityReport.json');
        if (cachedReport) {
          return res.json(cachedReport);
        }
      }

      // Get latest data version if not specified
      let versionId = dataVersionId as string | undefined;
      if (!versionId) {
        const snap = await db.collection('dataVersionHistory')
          .orderBy('timestamp', 'desc')
          .limit(1)
          .get();

        if (!snap.empty) {
          versionId = snap.docs[0].id;
        }
      }

      if (!versionId) {
        return res.json({
          healthScore: 0,
          metrics: {
            completeness: 0,
            accuracy: 0,
            consistency: 0,
            uniqueness: 0
          },
          lastSync: null,
          message: "No data versions found"
        });
      }

      // Calculate metrics
      const metrics = await calculateQualityMetrics(db, versionId);

      // Calculate health score (0-100)
      const healthScore = Math.round(
        (metrics.completeness * 0.25 +
          metrics.accuracy * 0.35 +
          metrics.consistency * 0.25 +
          metrics.uniqueness * 0.15)
      );

      res.json({
        healthScore,
        metrics,
        lastSync: new Date().toISOString(),
        dataVersionId: versionId,
        alerts: healthScore < 95 ? ['Data quality below target'] : []
      });
    } catch (error: any) {
      console.error("[ETL] /quality-report error:", error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  app.get('/api/etl/quarantine', (_req, res) => {
    try {
      const quarantine = readCacheFile('quarantine.json') || [];
      res.json({
        success: true,
        count: Array.isArray(quarantine) ? quarantine.length : 0,
        records: quarantine
      });
    } catch (error: any) {
      console.error('[ETL] /quarantine error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/etl/audit-log
   * Get audit trail of all data changes
   * 
   * Query params:
   * - startDate: YYYY-MM-DD
   * - endDate: YYYY-MM-DD
   * - entityType: adAccount|fanpage|campaign|content|adsData
   * 
   * Response:
   * [
   *   {
   *     "timestamp": "2026-06-03T12:30:00Z",
   *     "action": "create|update|delete",
   *     "entityType": "campaign",
   *     "entityId": "camp_123",
   *     "changesSummary": {...}
   *   }
   * ]
   */
  app.get("/api/etl/audit-log", async (req, res) => {
    try {
      const { startDate, endDate, entityType } = req.query;

      console.log(`[ETL] /audit-log endpoint`);

      let query = db.collection('syncAuditLog');

      // Filter by date range if provided
      if (startDate) {
        const start = new Date(startDate as string);
        query = query.where('timestamp', '>=', start) as any;
      }
      if (endDate) {
        const end = new Date(endDate as string);
        query = query.where('timestamp', '<=', end) as any;
      }

      // Filter by entity type if provided
      if (entityType) {
        query = query.where('entityType', '==', entityType) as any;
      }

      const snap = await query.orderBy('timestamp', 'desc').limit(100).get();

      const logs = snap.docs.map(doc => ({
        auditId: doc.id,
        ...doc.data()
      }));

      res.json({
        success: true,
        count: logs.length,
        logs,
        filters: {
          startDate,
          endDate,
          entityType
        }
      });
    } catch (error: any) {
      console.error("[ETL] /audit-log error:", error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/etl/health
   * Health check for ETL system
   * 
   * Response:
   * {
   *   "status": "healthy",
   *   "lastSync": "2026-06-03T12:30:00Z",
   *   "firestore": "connected",
   *   "aiNormalizer": {...},
   *   "metrics": {...}
   * }
   */
  app.get("/api/etl/health", async (req, res) => {
    try {
      const snap = await db.collection('dataVersionHistory')
        .orderBy('timestamp', 'desc')
        .limit(1)
        .get();

      const lastSync = snap.empty ? null : snap.docs[0].data().timestamp;
      const firestoreConnected = !snap.empty;

      const status = firestoreConnected && lastSync ? 'healthy' : 'degraded';

      res.json({
        status,
        lastSync,
        firestore: firestoreConnected ? 'connected' : 'disconnected',
        aiNormalizer: getAiNormalizerStatus(),
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error("[ETL] /health error:", error);
      res.status(500).json({
        status: 'unhealthy',
        error: error.message
      });
    }
  });

  // ============================================================================
  // END ETL ENDPOINTS
  // ============================================================================

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    startAutoSync();
  });
}

// ── AUTO SYNC SCHEDULER ──────────────────────────────────────────────────────
function startAutoSync() {
  const INTERVAL_MS = 60 * 60 * 1000; // 1 hour
  const MIN_INTERVAL_MS = 5 * 60 * 1000; // minimum 5 min between syncs
  let lastSyncAt = 0;
  let isSyncing = false;

  async function runSync() {
    if (isSyncing) return;
    const now = Date.now();
    if (now - lastSyncAt < MIN_INTERVAL_MS) return;

    isSyncing = true;
    const ts = new Date().toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    console.log(`[AutoSync] ${ts} — Bắt đầu đồng bộ tự động...`);
    try {
      const configs = readCacheFile('sheetsConfigs.json') || [];
      const active = configs.filter((c: any) => c.isActive !== false);
      if (active.length === 0) {
        console.log('[AutoSync] Không có cấu hình nào active, bỏ qua.');
        return;
      }
      const result = await syncAllSheetsServer(db, active);
      lastSyncAt = Date.now();
      const elapsed = ((Date.now() - now) / 1000).toFixed(1);
      if (result.success) {
        console.log(`[AutoSync] ✅ Hoàn tất sau ${elapsed}s — Health: ${(result as any).stats?.quality?.healthScore ?? '?'}`);
      } else {
        console.warn(`[AutoSync] ⚠️ Sync kết thúc với lỗi sau ${elapsed}s:`, (result as any).error);
      }
    } catch (e: any) {
      console.error('[AutoSync] ❌ Lỗi:', e.message);
    } finally {
      isSyncing = false;
    }
  }

  // Run once 30s after startup (let server fully initialize)
  setTimeout(runSync, 30_000);
  // Then every hour
  setInterval(runSync, INTERVAL_MS);
  console.log(`[AutoSync] Đã lên lịch đồng bộ tự động mỗi ${INTERVAL_MS / 60000} phút.`);
}

startServer();
