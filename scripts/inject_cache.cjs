/**
 * inject_cache.cjs
 * Converts scripts/output/*.json → server-cache/*.json (exact format the webapp expects)
 * Run: node scripts/inject_cache.cjs
 */

const fs   = require('fs');
const path = require('path');

const OUT_DIR   = path.join(__dirname, 'output');
const CACHE_DIR = path.join(__dirname, '..', 'server-cache');

function read(name) {
  return JSON.parse(fs.readFileSync(path.join(OUT_DIR, name + '.json'), 'utf8'));
}

function writeCache(name, data) {
  const dest = path.join(CACHE_DIR, name + '.json');
  fs.writeFileSync(dest, JSON.stringify(data), 'utf8');
  const size = (fs.statSync(dest).size / 1024).toFixed(1);
  console.log(`  ✓ server-cache/${name}.json  ${size} KB  (${Array.isArray(data) ? data.length + ' rows' : Object.keys(data).length + ' keys'})`);
}

// ── 1. adAccounts.json (object map, capitalized field names) ──────────────────
function buildAdAccounts() {
  const accounts = read('dim_accounts');
  const map = {};
  accounts.forEach(a => {
    if (!a.account_id) return;
    const key = encodeURIComponent(String(a.account_id).replace(/[\/\s]/g, '_'));
    map[key] = {
      account_id:   a.account_id,
      account_name: a.account_name,
      status:       a.status,
      bm_name:      a.bm_name,
      Company_name: a.company,
      Partner_name: a.partner,
      Ads_name:     a.runner,
      Bank_name:    a.bank,
      number_card:  a.card_last4,
      updatedAt:    Date.now(),
    };
  });
  writeCache('adAccounts', map);
}

// ── 2. fanpages.json (object map, type/vung_target/pancake as string) ─────────
function buildFanpages() {
  const pages = read('dim_fanpages');
  const map = {};
  pages.forEach(p => {
    if (!p.page_code) return;
    const key = encodeURIComponent(String(p.page_code).replace(/[\/\s]/g, '_').toLowerCase());
    map[key] = {
      page_code:   p.page_code,
      page_id:     p.page_id,
      page_name:   p.page_name,
      type:        p.page_type,
      geography:   p.geography,
      vung_target: p.geography,
      runner:      p.runner,
      source_code: p.source_code,
      page_link:   p.page_link,
      status:      p.status,
      pancake:     p.pancake ? 'TRUE' : 'FALSE',
      add_bm:      p.add_bm  ? 'TRUE' : 'FALSE',
      removed_pan: p.removed_pan ? 'TRUE' : 'FALSE',
      updatedAt:   Date.now(),
    };
  });
  writeCache('fanpages', map);
}

// ── 3. contents.json (array, Vietnamese field names, with CLDT) ───────────────
function buildContents() {
  const contents = read('dim_contents');
  const arr = contents.map(c => ({
    id:                c.content_name,   // full name as ID
    brand:             c.brand,
    team:              c.team,
    bienTap:           c.editor,
    dinhDang:          c.format,
    page:              c.page,
    tenCGSD:           c.cgsđ_name,
    nhomTreHoa:        c.rejuvenation_group,
    doTuoi:            c.age_range   || '',
    mau:               c.model       || '',
    maMau:             c.sample_code || '',
    ngaySanXuat:       c.production_date,
    cldt_nn_tich_cuc:  0,
    cldt_nd_tich_cuc:  0,
  }));
  writeCache('contents', arr);
}

// ── 4. roasSummary.json (array with nested total/domestic/overseas) ───────────
function buildRoasSummary() {
  const rows = read('summary_roas_monthly');

  // Group by (report_month, channel, classification, personnel)
  const groups = {};
  rows.forEach(r => {
    const id = [r.report_month, r.channel, r.classification, r.personnel]
      .map(s => String(s || '').trim().replace(/\s+/g, '_'))
      .join('_');

    if (!groups[id]) {
      groups[id] = {
        id,
        reportMonth:    r.report_month,
        startDate:      r.start_date ? fmtDate(r.start_date) : '',
        endDate:        r.end_date   ? fmtDate(r.end_date)   : '',
        channel:        r.channel,
        classification: r.classification,
        personnel:      r.personnel,
        total:    { spend:0, dataCount:0, dataPrice:0, roasMonth:0, roas3Months:0 },
        domestic: { spend:0, dataCount:0, dataPrice:0, roasMonth:0, roas3Months:0 },
        overseas: { spend:0, dataCount:0, dataPrice:0, roasMonth:0, roas3Months:0 },
      };
    }

    const geoKey = r.geography === 'domestic' ? 'domestic'
                 : r.geography === 'overseas'  ? 'overseas'
                 : 'total';

    groups[id][geoKey] = {
      spend:      Math.round(r.spend     || 0),
      dataCount:  Math.round(r.data_count || 0),
      dataPrice:  Math.round(r.data_price || 0),
      roasMonth:  round4(r.roas_month),
      roas3Months:round4(r.roas_3months),
    };
  });

  writeCache('roasSummary', Object.values(groups));
}

// ── 5. performance.json (array, Vietnamese field names) ───────────────────────
function buildPerformance() {
  const rows = read('summary_content_perf');

  // Normalize period: "full-2026" → ky="tong_nam", kyIndex=0
  //                   "T1"        → ky="thang1",   kyIndex=1
  function normPeriod(p) {
    if (!p) return { ky: 'unknown', kyLabel: p || '', kyIndex: -1 };
    if (p.startsWith('full-')) return { ky: 'tong_nam', kyLabel: 'TỔNG NĂM ' + p.slice(5), kyIndex: 0 };
    const m = p.match(/T(\d+)/);
    if (m) {
      const idx = parseInt(m[1]);
      return { ky: 'thang' + idx, kyLabel: 'THÁNG ' + idx, kyIndex: idx };
    }
    return { ky: p, kyLabel: p, kyIndex: -1 };
  }

  function normGeo(g) {
    if (g === 'domestic') return { vung: 'trong_nuoc', vungLabel: 'Trong nuoc' };
    if (g === 'overseas') return { vung: 'nuoc_ngoai', vungLabel: 'Nuoc ngoai' };
    return { vung: 'tong_cong', vungLabel: 'Tong cong' };
  }

  const arr = rows.map(r => {
    const { ky, kyLabel, kyIndex } = normPeriod(r.period);
    const { vung, vungLabel }      = normGeo(r.geography);
    return {
      tenContent:  r.content_name,
      tenCGSD:     null,
      kenh:        r.channel,
      phanLoai:    r.classification,
      ky,
      kyLabel,
      kyIndex,
      vung,
      vungLabel,
      chiPhi:      Math.round(r.spend      || 0),
      slData:      Math.round(r.data_count || 0),
      giaTData:    Math.round(r.data_price || 0),
      roasTrong:   round4(r.roas_month),
      roas3Thang:  round4(r.roas_3months),
    };
  });
  writeCache('performance', arr);
}

// ── 6. dailySummaries.json (aggregate fact_ads by date+market) ────────────────
function buildDailySummaries() {
  const facts = read('fact_ads');

  // Map geo_code → market label (matching existing data format)
  const GEO_MAP = {
    'NN': 'Việt Kiều', 'TQ': 'Nội Địa', 'ND': 'Nội Địa',
    'MB': 'Miền Bắc',  'MN': 'Miền Nam', 'QT': 'Việt Kiều',
  };

  const byDate = {};
  facts.forEach(r => {
    if (!r.date) return;
    const market = GEO_MAP[r.geo_code] || (r.geo_code ? r.geo_code : 'Khác');

    if (!byDate[r.date]) {
      byDate[r.date] = { id: r.date, date: r.date, spend: 0, revenue: 0, leads: 0, messaging: 0, orders: 0, markets: {} };
    }
    const d = byDate[r.date];
    d.spend    += (r.spend     || 0);
    d.messaging += (r.messages  || 0);
    d.orders   += (r.purchases || 0);

    if (!d.markets[market]) d.markets[market] = { spend:0, revenue:0, leads:0, messaging:0, orders:0 };
    d.markets[market].spend    += (r.spend     || 0);
    d.markets[market].messaging += (r.messages  || 0);
    d.markets[market].orders   += (r.purchases || 0);
  });

  const arr = Object.values(byDate).sort((a,b) => a.date.localeCompare(b.date));
  writeCache('dailySummaries', arr);
}

// ── 7. adsData.json (same schema as fact_ads, direct copy) ───────────────────
function buildAdsData() {
  const facts = read('fact_ads');
  // Rename fields to match exact server schema expected by SheetsDataContext
  const arr = facts.map(r => ({
    date:             r.date,
    account_id:       r.account_id,
    account_name:     r.account_name,
    campaign_id:      r.campaign_id,
    campaign_name:    r.campaign_name,
    adset_id:         r.adset_id,
    adset_name:       r.adset_name,
    ad_id:            r.ad_id,
    ad_name:          r.ad_name,
    brand:            null,
    page_code:        r.page_code,
    geography:        r.geo_code,
    page_type:        null,
    content_id:       r.content_id,
    objective:        r.objective,
    spend:            r.spend,
    impressions:      r.impressions,
    reach:            r.reach,
    frequency:        r.frequency,
    clicks:           null,
    ctr_all:          r.ctr,
    cpm:              r.cpm,
    messages:         r.messages,
    cost_per_messaging_conversation: r.cost_per_message,
    purchases:        r.purchases,
    cost_per_purchase:r.cost_per_purchase,
    revenue:          null,
    leads:            r.messages,  // messages used as leads proxy
    market:           null,
  }));
  writeCache('adsData', arr);
}

// ── UTILS ─────────────────────────────────────────────────────────────────────
function fmtDate(iso) {
  // "2026-01-01" → "1/1/2026"
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${parseInt(d)}/${parseInt(m)}/${y}`;
}
function round4(v) { return v ? Math.round(v * 10000) / 10000 : 0; }

// ── MAIN ─────────────────────────────────────────────────────────────────────
console.log('Injecting output/ → server-cache/...\n');
buildAdAccounts();
buildFanpages();
buildContents();
buildRoasSummary();
buildPerformance();
buildDailySummaries();
buildAdsData();

console.log('\n✅ server-cache updated. Restart npm run dev to pick up changes.');
