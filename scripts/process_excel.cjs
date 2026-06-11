/**
 * process_excel.js
 * Converts 3 raw Excel files → 6 normalized flat files (JSON + CSV)
 * Output: scripts/output/
 *
 * Tables produced:
 *   dim_accounts.json/csv         - Ad account master
 *   dim_fanpages.json/csv         - Fanpage master
 *   dim_contents.json/csv         - Content catalog
 *   fact_ads.json/csv             - Ad performance facts (226K rows)
 *   summary_roas_monthly.json/csv - Monthly ROAS by personnel (unpivoted)
 *   summary_content_perf.json/csv - Content performance by month (unpivoted)
 */

const XLSX = require('../node_modules/xlsx');
const fs   = require('fs');
const path = require('path');

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const FILES = {
  master:  'C:/Users/atlv/Downloads/Meta_Ads_Master_Database.xlsx',
  content: 'C:/Users/atlv/Downloads/Meta_Ads_Master_Database_Content (3).xlsx',
  period:  'C:/Users/atlv/Downloads/Meta_Ads_Master_Database_01.01-22.03.xlsx',
};
const OUT_DIR = path.join(__dirname, 'output');

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/** Excel serial date → YYYY-MM-DD */
function excelDateToISO(serial) {
  if (!serial || isNaN(serial)) return null;
  // Excel epoch: Jan 1, 1900 = 1 (with Lotus 1-2-3 bug: 1900 treated as leap year)
  const date = new Date((serial - 25569) * 86400 * 1000);
  return date.toISOString().slice(0, 10);
}

/** Clean cell value: null/""/N/A → null */
function clean(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s || s === '#N/A' || s === 'N/A' || s === '-') return null;
  return s;
}

/** Parse number, handle comma/dot ambiguity */
function num(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v;
  const s = String(v).replace(/\s/g, '').replace(/%$/, '');
  // If has both comma and dot: last one is decimal separator
  const hasComma = s.includes(',');
  const hasDot   = s.includes('.');
  let n;
  if (hasComma && hasDot) {
    // e.g. "1,234.56" or "1.234,56"
    const lastComma = s.lastIndexOf(',');
    const lastDot   = s.lastIndexOf('.');
    n = lastComma > lastDot
      ? parseFloat(s.replace('.', '').replace(',', '.'))
      : parseFloat(s.replace(',', ''));
  } else if (hasComma) {
    n = parseFloat(s.replace(',', '.'));
  } else {
    n = parseFloat(s);
  }
  return isNaN(n) ? null : n;
}

/**
 * Parse campaign_name → { channel, page_code, geo_code, objective, content_id }
 * Format: "S - Khiêm S07 - TQ - CGSĐ - 260115-SC CGSĐ Hiếu..."
 *      or "G - KA121 - NN - CGSD - 251015-..."
 */
const VALID_GEO = new Set(['TQ','NN','ND','MB','MN','QT','HN','HCM','DN']);
function parseCampaignName(name) {
  if (!name) return {};
  const parts = name.split(' - ');
  const rawGeo = clean(parts[2]);
  return {
    channel:    clean(parts[0]) || null,
    page_code:  clean(parts[1]) || null,
    geo_code:   (rawGeo && VALID_GEO.has(rawGeo.toUpperCase())) ? rawGeo.toUpperCase() : null,
    objective:  clean(parts[3]) || null,
  };
}

/** Extract content_id from ad_name (first 6-digit token) */
function extractContentId(adName) {
  if (!adName) return null;
  const m = String(adName).match(/^(\d{5,6})/);
  return m ? m[1] : null;
}

/** Write both JSON and CSV */
function writeOutput(name, rows, columns) {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  // JSON
  fs.writeFileSync(
    path.join(OUT_DIR, name + '.json'),
    JSON.stringify(rows, null, 2),
    'utf8'
  );

  // CSV
  const escape = v => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n'))
      return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const lines = [
    columns.join(','),
    ...rows.map(r => columns.map(c => escape(r[c])).join(','))
  ];
  fs.writeFileSync(path.join(OUT_DIR, name + '.csv'), lines.join('\n'), 'utf8');

  console.log(`  ✓ ${name}: ${rows.length} rows`);
}

// ─── 1. DIM_ACCOUNTS ─────────────────────────────────────────────────────────
function buildDimAccounts(wb) {
  console.log('\n[1/6] Building dim_accounts...');
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['Config'], { header: 1, defval: null });
  // Row 0 = headers
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[0]) continue;
    out.push({
      account_id:   clean(r[0]),
      account_name: clean(r[1]),
      status:       clean(r[2]),
      bm_name:      clean(r[3]),
      company:      clean(r[4]),
      partner:      clean(r[5]),
      runner:       clean(r[6]),
      bank:         clean(r[7]),
      card_last4:   clean(r[8]),
    });
  }
  const cols = ['account_id','account_name','status','bm_name','company','partner','runner','bank','card_last4'];
  writeOutput('dim_accounts', out, cols);
  return out;
}

// ─── 2. DIM_FANPAGES ─────────────────────────────────────────────────────────
function buildDimFanpages(wb) {
  console.log('\n[2/6] Building dim_fanpages...');
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['Seryn Page'], { header: 1, defval: null });
  // Row 0 = title "SERYN PAGE", Row 1 = actual headers, Row 2+ = data
  const out = [];
  for (let i = 2; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const pageCode = clean(r[2]);
    if (!pageCode) continue; // skip rows with null/empty page_code
    out.push({
      page_code:   pageCode,
      page_name:   clean(r[1]),
      page_id:     clean(r[8]),
      runner:      clean(r[3]),
      source_code: clean(r[4]),
      page_type:   clean(r[5]),
      geography:   clean(r[6]),
      page_link:   clean(r[7]),
      status:      clean(r[9]),
      pancake:     r[10] === true || r[10] === 'TRUE' || r[10] === 1 ? true : false,
      add_bm:      r[11] === true || r[11] === 'TRUE' || r[11] === 1 ? true : false,
      removed_pan: r[12] === true || r[12] === 'TRUE' || r[12] === 1 ? true : false,
    });
  }
  const cols = ['page_code','page_name','page_id','runner','source_code','page_type','geography','page_link','status','pancake','add_bm','removed_pan'];
  writeOutput('dim_fanpages', out, cols);
  return out;
}

// ─── 3. DIM_CONTENTS ─────────────────────────────────────────────────────────
function buildDimContents(wb) {
  console.log('\n[3/6] Building dim_contents...');
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['ID FB'], { header: 1, defval: null });
  // Row 0 = headers, Row 1 = group header (e.g. "MEGA GANGNAM"), Row 2+ = data
  const out = [];
  const seen = new Set();
  for (let i = 2; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[1]) continue; // content_id at col 1
    const rawId = clean(r[1]);
    if (!rawId) continue;
    // Extract numeric prefix as content_id key
    const m = rawId.match(/^(\d{5,6})/);
    const contentId = m ? m[1] : rawId.slice(0, 20);
    if (seen.has(contentId)) continue;
    seen.add(contentId);

    // Parse production_date: col 12
    // May be: 6-digit "250225" → 2025-02-25, Excel serial 44820 → ISO, or null
    let prodDate = null;
    const pdRaw = r[12];
    if (typeof pdRaw === 'number' && pdRaw > 40000) {
      prodDate = excelDateToISO(pdRaw); // Excel serial date
    } else {
      const pd = clean(pdRaw);
      if (pd && /^\d{6}$/.test(pd)) {
        prodDate = `20${pd.slice(0,2)}-${pd.slice(2,4)}-${pd.slice(4,6)}`;
      } else if (pd && /^\d{4}-\d{2}-\d{2}$/.test(pd)) {
        prodDate = pd;
      }
      // else: leave null (unparseable date)
    }

    out.push({
      content_id:         contentId,
      content_name:       rawId,
      link:               clean(r[3]),
      team:               clean(r[4]),
      brand:              clean(r[5]),
      editor:             clean(r[6]),
      media_post:         clean(r[7]),
      design_post:        clean(r[8]),
      production_team:    clean(r[9]),
      content_producer:   clean(r[10]),
      media_producer:     clean(r[11]),
      production_date:    prodDate,
      sample_code:        clean(r[13]),
      page:               clean(r[14]),
      cgsđ_name:          clean(r[15]),
      rejuvenation_group: clean(r[16]),
      format:             clean(r[17]),
      region:             clean(r[18]),
      age_range:          clean(r[19]),
      model:              clean(r[20]),
    });
  }
  const cols = ['content_id','content_name','link','team','brand','editor','media_post','design_post','production_team','content_producer','media_producer','production_date','sample_code','page','cgsđ_name','rejuvenation_group','format','region','age_range','model'];
  writeOutput('dim_contents', out, cols);
  return out;
}

// ─── 4. FACT_ADS ─────────────────────────────────────────────────────────────
function buildFactAds(masterWb, periodWb) {
  console.log('\n[4/6] Building fact_ads (merging 2 raw data sheets)...');
  const out = [];
  const seen = new Set(); // deduplicate by account_id|campaign_id|adset_id|ad_id|date

  function processSheet(rows) {
    // Row 0 = headers
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.length < 10) continue;

      const date = typeof r[0] === 'number' ? excelDateToISO(r[0]) : clean(r[0]);
      if (!date) continue;

      const campaignName = clean(r[4]);
      const adName       = clean(r[8]);
      const adsetName    = clean(r[6]);
      const { channel, page_code, geo_code, objective } = parseCampaignName(campaignName);
      const contentId = extractContentId(adName);

      const key = [date, clean(r[1]), clean(r[2]), clean(r[3])].join('|');
      // Note: allow same campaign/date with different adsets (don't over-deduplicate)
      const fullKey = [date, clean(r[1]), clean(r[3]), clean(r[5])].join('|');
      if (seen.has(fullKey)) continue;
      seen.add(fullKey);

      // Truncate parsed fields to match DB column sizes
      const safePageCode = (page_code || adsetName || '').slice(0, 50) || null;
      const safeGeoCode  = geo_code ? geo_code.slice(0, 10) : null;

      out.push({
        date,
        account_id:       clean(r[1]),
        account_name:     clean(r[2]),
        campaign_id:      clean(r[3]),
        campaign_name:    campaignName,
        adset_id:         clean(r[5]),
        adset_name:       adsetName,
        ad_id:            clean(r[7]),
        ad_name:          adName,
        // Parsed / derived
        content_id:       contentId,
        page_code:        safePageCode,
        geo_code:         safeGeoCode,
        objective,
        channel,
        // Metrics (store as-is, VND already integer)
        spend:            num(r[9]),
        impressions:      num(r[10]),
        reach:            num(r[11]),
        frequency:        num(r[12]),
        ctr:              num(r[13]),
        cpm:              num(r[14]),
        messages:         num(r[15]),
        cost_per_message: num(r[16]),
        purchases:        num(r[17]),
        cost_per_purchase:num(r[18]),
      });
    }
  }

  const masterRows = XLSX.utils.sheet_to_json(masterWb.Sheets['Raw_Data'], { header: 1, defval: null });
  processSheet(masterRows);
  console.log(`    Master sheet processed: ${out.length} rows so far`);

  const periodRows = XLSX.utils.sheet_to_json(periodWb.Sheets['Raw_Data_01.01-22.03'], { header: 1, defval: null });
  const beforeCount = out.length;
  processSheet(periodRows);
  console.log(`    Period sheet added: ${out.length - beforeCount} new rows (${out.length - beforeCount} unique)`);

  const cols = ['date','account_id','account_name','campaign_id','campaign_name','adset_id','adset_name','ad_id','ad_name','content_id','page_code','geo_code','objective','channel','spend','impressions','reach','frequency','ctr','cpm','messages','cost_per_message','purchases','cost_per_purchase'];
  writeOutput('fact_ads', out, cols);
  return out;
}

// ─── 5. SUMMARY_ROAS_MONTHLY ─────────────────────────────────────────────────
function buildSummaryRoasMonthly(wb) {
  console.log('\n[5/6] Building summary_roas_monthly (unpivoting Roas tổng)...');
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['Roas tổng'], { header: 1, defval: null });

  // Row 0: geography headers (TỔNG CỘNG col 9, TRONG NƯỚC col 14, NƯỚC NGOÀI col 19)
  // Row 1: field headers
  // Row 2+: data

  // Geography blocks: each has 5 metrics starting at these col indices
  const GEO_BLOCKS = [
    { geo: 'total',    startCol: 9  },
    { geo: 'domestic', startCol: 14 },
    { geo: 'overseas', startCol: 19 },
  ];

  const out = [];
  for (let i = 2; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[0]) continue;
    const reportMonth = clean(r[0]);
    if (!reportMonth) continue;

    // Convert dates
    const startDate = typeof r[1] === 'number' ? excelDateToISO(r[1]) : clean(r[1]);
    const endDate   = typeof r[2] === 'number' ? excelDateToISO(r[2]) : clean(r[2]);

    const channel        = clean(r[6]);
    const classification = clean(r[7]);
    const personnel      = clean(r[8]);

    for (const { geo, startCol } of GEO_BLOCKS) {
      const spend      = num(r[startCol]);
      const dataCount  = num(r[startCol + 1]);
      const dataPrice  = num(r[startCol + 2]);
      const roasMonth  = num(r[startCol + 3]);
      const roas3m     = num(r[startCol + 4]);

      if (spend === null && dataCount === null) continue;

      out.push({
        report_month:    reportMonth,
        start_date:      startDate,
        end_date:        endDate,
        channel,
        classification,
        personnel,
        geography:       geo,
        spend,
        data_count:      dataCount,
        data_price:      dataPrice,
        roas_month:      roasMonth,
        roas_3months:    roas3m,
      });
    }
  }

  const cols = ['report_month','start_date','end_date','channel','classification','personnel','geography','spend','data_count','data_price','roas_month','roas_3months'];
  writeOutput('summary_roas_monthly', out, cols);
  return out;
}

// ─── 6. SUMMARY_CONTENT_PERF ─────────────────────────────────────────────────
function buildSummaryContentPerf(wb) {
  console.log('\n[6/6] Building summary_content_perf (unpivoting Roas content, 199 cols)...');
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['Roas content'], { header: 1, defval: null });

  // Row 0: period headers (TỔNG NĂM 2026, THÁNG 1, THÁNG 2, ...)
  // Row 1: geography headers (TỔNG CỘNG, TRONG NƯỚC, NƯỚC NGOÀI) per period
  // Row 2: metric headers (Chi phí, SL data, Giá data, Roas trong tháng, Roas 3 tháng)
  // Row 3+: data (col 0 = channel, col 1 = classification, col 2 = content name, col 3+ = metrics)

  // Build column map from rows 0-2
  // Each block = 5 metrics; each period has 3 geo blocks = 15 cols
  // Total data cols = (N_periods × 3 geos × 5 metrics) starting at col 3

  const periodRow  = rows[0] || [];
  const geoRow     = rows[1] || [];
  const metricRow  = rows[2] || [];

  // Build blocks: { period, geo, colIndex, metricName }
  const blocks = [];
  let currentPeriod = null;
  let currentGeo    = null;

  for (let c = 3; c < metricRow.length; c++) {
    if (periodRow[c] && String(periodRow[c]).trim()) {
      currentPeriod = String(periodRow[c]).trim()
        .replace('TỔNG NĂM ', 'full-')
        .replace('THÁNG ', 'T');
    }
    if (geoRow[c] && String(geoRow[c]).trim()) {
      const g = String(geoRow[c]).trim().toUpperCase();
      if (g.includes('TỔNG')) currentGeo = 'total';
      else if (g.includes('TRONG')) currentGeo = 'domestic';
      else if (g.includes('NGOÀI')) currentGeo = 'overseas';
    }
    const metric = clean(metricRow[c]);
    if (metric) {
      blocks.push({ period: currentPeriod, geo: currentGeo, col: c, metric });
    }
  }

  // Group blocks by (period, geo) → 5 metrics per group
  const groups = {};
  for (const b of blocks) {
    const key = `${b.period}||${b.geo}`;
    if (!groups[key]) groups[key] = { period: b.period, geo: b.geo, cols: {} };
    // Normalize metric name
    const m = String(b.metric).toLowerCase();
    if (m.includes('chi phí') || m.includes('chi phi')) groups[key].cols.spend = b.col;
    else if (m.includes('sl data') || m.includes('sldata')) groups[key].cols.data_count = b.col;
    else if (m.includes('giá data') || m.includes('gia data')) groups[key].cols.data_price = b.col;
    else if (m.includes('roas') && m.includes('3')) groups[key].cols.roas_3months = b.col;
    else if (m.includes('roas')) groups[key].cols.roas_month = b.col;
  }

  const out = [];
  const seenKeys = new Set();
  for (let i = 3; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[0]) continue;
    const channel        = clean(r[0]);
    const classification = clean(r[1]);
    const contentName    = clean(r[2]);
    // Extract content_id from name
    const cidMatch = contentName && contentName.match(/^(\d{5,6})/);
    const contentId = cidMatch ? cidMatch[1] : null;

    for (const grp of Object.values(groups)) {
      const spend     = num(r[grp.cols.spend]);
      const dataCount = num(r[grp.cols.data_count]);
      if (spend === null && dataCount === null) continue;
      if (!spend && !dataCount) continue;

      // Deduplicate by unique key (content_id, channel, classification, period, geography)
      const ukey = `${contentId}||${channel}||${classification}||${grp.period}||${grp.geo}`;
      if (seenKeys.has(ukey)) continue;
      seenKeys.add(ukey);

      out.push({
        content_id:      contentId,
        content_name:    contentName,
        channel,
        classification,
        period:          grp.period,
        geography:       grp.geo,
        spend:           spend,
        data_count:      dataCount,
        data_price:      num(r[grp.cols.data_price]),
        roas_month:      num(r[grp.cols.roas_month]),
        roas_3months:    num(r[grp.cols.roas_3months]),
      });
    }
  }

  const cols = ['content_id','content_name','channel','classification','period','geography','spend','data_count','data_price','roas_month','roas_3months'];
  writeOutput('summary_content_perf', out, cols);
  return out;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
console.log('Loading Excel files...');
const masterWb  = XLSX.readFile(FILES.master);
const contentWb = XLSX.readFile(FILES.content);
const periodWb  = XLSX.readFile(FILES.period);
console.log('Files loaded.');

buildDimAccounts(masterWb);
buildDimFanpages(masterWb);
buildDimContents(contentWb);
buildFactAds(masterWb, periodWb);
buildSummaryRoasMonthly(masterWb);
buildSummaryContentPerf(contentWb);

console.log('\n✅ Done! Output files in: ' + OUT_DIR);
console.log('\nFiles produced:');
fs.readdirSync(OUT_DIR).forEach(f => {
  const size = (fs.statSync(path.join(OUT_DIR, f)).size / 1024).toFixed(1);
  console.log(`  ${f.padEnd(40)} ${size} KB`);
});
