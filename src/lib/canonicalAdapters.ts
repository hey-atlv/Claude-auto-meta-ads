import type { NormalizedRecord } from '../prompts/schemas.js';
import { cleanSheetText, normalizeSheetKey, parseSheetDate, parseSheetNumber } from './sheetSchemaRegistry.js';
import { parseCampaignName } from './campaignParser.js';

type CldtInfo = {
  cldt_nn_tich_cuc: number;
  cldt_nd_tich_cuc: number;
};

const text = (value: unknown, fallback = '') => cleanSheetText(value) || fallback;
const num = (value: unknown, fallback = 0) => parseSheetNumber(value) ?? fallback;

export function adaptAdsData(records: NormalizedRecord[]) {
  return records.map(record => {
    const c = record.canonical as any;
    const campaignName = text(c.campaign_name);
    const parsedCampaign = parseCampaignName(campaignName);
    return {
      date: text(c.date),
      account_id: text(c.account_id),
      account_name: text(c.account_name),
      campaign_id: text(c.campaign_id),
      campaign_name: campaignName,
      adset_id: text(c.adset_id),
      adset_name: text(c.adset_name),
      ad_id: text(c.ad_id),
      ad_name: text(c.ad_name),
      spend: num(c.spend),
      impressions: num(c.impressions),
      purchases: num(c.purchases),  // SĐT thô từ ads (data platform)
      messages: num(c.messages),
      revenue: num(c.revenue),
      ...parsedCampaign
    };
  });
}

export function adaptAccountConfigs(records: NormalizedRecord[]) {
  const map: Record<string, any> = {};
  records.forEach(record => {
    const c = record.canonical as any;
    const accountId = text(c.account_id);
    if (!accountId) return;
    const docId = encodeURIComponent(accountId.replace(/[\/\s]/g, '_'));
    map[docId] = {
      account_id: accountId.substring(0, 90),
      account_name: text(c.account_name).substring(0, 190),
      status: text(c.status).substring(0, 90),
      bm_name: text(c.bm_name).substring(0, 190),
      Company_name: text(c.company_name).substring(0, 190),
      Partner_name: text(c.partner_name).substring(0, 190),
      Ads_name: text(c.ads_name).substring(0, 190),
      Bank_name: text(c.bank_name).substring(0, 190),
      number_card: text(c.number_card).substring(0, 90)
    };
  });
  return map;
}

export function adaptFanpageConfigs(records: NormalizedRecord[]) {
  const map: Record<string, any> = {};
  records.forEach(record => {
    const c = record.canonical as any;
    const code = text(c.page_code);
    if (!code) return;
    const cleanId = encodeURIComponent(code.replace(/[\/\s]/g, '_').toLowerCase());
    map[cleanId] = {
      page_code: code,
      page_id: text(c.page_id).substring(0, 90),
      page_name: text(c.page_name).substring(0, 190),
      type: text(c.page_type).substring(0, 90),
      geography: text(c.geography || c.vung_target).substring(0, 90),
      vung_target: text(c.vung_target || c.geography).substring(0, 90),
      runner: text(c.ads_name).substring(0, 190),
      source_code: text(c.source_code).substring(0, 190),
      page_link: text(c.page_link).substring(0, 500),
      status: text(c.status).substring(0, 90),
      pancake: text(c.pancake).substring(0, 20),
      add_bm: text(c.add_bm).substring(0, 20),
      removed_pan: text(c.removed_pan).substring(0, 20)
    };
  });
  return map;
}

export function adaptContentMaster(records: NormalizedRecord[], cldtMap: Map<string, CldtInfo>) {
  return records.map(record => {
    const c = record.canonical as any;
    const id = text(c.content_id || c.content_name);
    const cldtInfo = cldtMap.get(id) || { cldt_nn_tich_cuc: 0, cldt_nd_tich_cuc: 0 };
    return {
      id,
      brand: text(c.brand),
      team: text(c.team || c.production_team),
      bienTap: text(c.editor),
      dinhDang: text(c.format).replace(/#N\/A/g, ''),
      page: text(c.page).replace(/#N\/A/g, ''),
      tenCGSD: text(c.model_name || c.personnel),
      nhomTreHoa: text(c.rejuvenation_group),
      doTuoi: text(c.age_range),
      mau: text(c.model_description),
      maMau: text(c.sample_code),
      ngaySanXuat: text(c.production_date),
      cldt_nn_tich_cuc: cldtInfo.cldt_nn_tich_cuc,
      cldt_nd_tich_cuc: cldtInfo.cldt_nd_tich_cuc
    };
  }).filter(row => row.id);
}

export function parseCldtMap(values: unknown[][]) {
  const map = new Map<string, CldtInfo>();
  const headerRowIndex = values.findIndex(row => row.some(cell => normalizeSheetKey(cell).includes('rowlabels')));
  if (headerRowIndex < 0) return map;

  const regionRow = values[Math.max(0, headerRowIndex - 2)] || [];
  const groupRow = values[Math.max(0, headerRowIndex - 1)] || [];
  const metricRow = values[headerRowIndex] || [];
  const positiveColumns: Array<{ col: number; key: keyof CldtInfo }> = [];
  let currentRegion = '';

  for (let col = 0; col < Math.max(regionRow.length, groupRow.length, metricRow.length); col++) {
    const region = normalizeSheetKey(regionRow[col]);
    if (region.includes('nuocngoai')) currentRegion = 'overseas';
    if (region.includes('trongnuoc')) currentRegion = 'domestic';

    const group = normalizeSheetKey(groupRow[col]);
    const metric = normalizeSheetKey(metricRow[col + 1]);
    if (group.includes('tichcuc') && metric.includes('tyle')) {
      positiveColumns.push({
        col: col + 1,
        key: currentRegion === 'domestic' ? 'cldt_nd_tich_cuc' : 'cldt_nn_tich_cuc'
      });
    }
  }

  for (let rowIndex = headerRowIndex + 1; rowIndex < values.length; rowIndex++) {
    const row = values[rowIndex] || [];
    const contentId = text(row[0]);
    if (!contentId || !/^\d{4,6}/.test(contentId)) continue;
    const current = map.get(contentId) || { cldt_nn_tich_cuc: 0, cldt_nd_tich_cuc: 0 };
    positiveColumns.forEach(({ col, key }) => {
      current[key] = num(row[col]);
    });
    map.set(contentId, current);
  }

  return map;
}

export function adaptRoasContentMatrix(values: unknown[][]) {
  const metricRowIndex = values.findIndex(row => {
    const keys = row.map(normalizeSheetKey);
    return keys.some(key => key === 'kenh') && keys.some(key => key === 'phanloai') && keys.some(key => key === 'tencontent');
  });
  if (metricRowIndex < 0) return [];

  const periodRow = values[Math.max(0, metricRowIndex - 2)] || [];
  const regionRow = values[Math.max(0, metricRowIndex - 1)] || [];
  const metricRow = values[metricRowIndex] || [];
  const metricKeys = metricRow.map(normalizeSheetKey);
  const contentCol = metricKeys.findIndex(key => key === 'tencontent' || key === 'contentid');
  const channelCol = metricKeys.findIndex(key => key === 'kenh');
  const classificationCol = metricKeys.findIndex(key => key === 'phanloai');
  const personnelCol = metricKeys.findIndex(key => key === 'tencgsd' || key === 'personnel');
  const blocks = buildPerformanceBlocks(periodRow, regionRow, metricRow);
  const output: any[] = [];

  for (let rowIndex = metricRowIndex + 1; rowIndex < values.length; rowIndex++) {
    const row = values[rowIndex] || [];
    const tenContent = text(row[contentCol]);
    if (!tenContent || !/^\d{4,6}/.test(tenContent)) continue;
    const tenCGSD = personnelCol >= 0 ? text(row[personnelCol]) : '';

    for (const block of blocks) {
      const chiPhi = num(row[block.col]);
      const slDataRaw = row[block.col + 1];
      const slDataText = text(slDataRaw);
      if (chiPhi === 0 && !slDataText) continue;
      output.push({
        tenContent,
        tenCGSD,
        kenh: text(row[channelCol]),
        phanLoai: text(row[classificationCol]).replace(/facbeook/i, 'Facebook'),
        ky: block.periodName,
        kyLabel: block.periodLabel,
        kyIndex: block.periodIndex,
        vung: block.regionName,
        vungLabel: block.regionLabel,
        chiPhi,
        slData: num(slDataRaw),
        giaTData: num(row[block.col + 2]),
        roasTrong: num(row[block.col + 3]),
        roas3Thang: num(row[block.col + 4])
      });
    }
  }
  return output;
}

export function adaptRoasSummary(values: unknown[][]) {
  const headerRowIndex = values.findIndex(row => row.some(cell => normalizeSheetKey(cell).includes('thangbaocao')));
  if (headerRowIndex < 0) return [];
  const headerRow = values[headerRowIndex].map(normalizeSheetKey);
  const chiPhiIdxs: number[] = [];
  const dataIdxs: number[] = [];
  const priceIdxs: number[] = [];
  const roas1Idxs: number[] = [];
  const roas3Idxs: number[] = [];

  headerRow.forEach((header, index) => {
    if (header.includes('chiphi')) chiPhiIdxs.push(index);
    else if (header.includes('sldata') || header === 'data') dataIdxs.push(index);
    else if (header.includes('giadata')) priceIdxs.push(index);
    else if (header.includes('roastrongthang')) roas1Idxs.push(index);
    else if (header.includes('roas3thang')) roas3Idxs.push(index);
  });

  const idxMonth = findHeader(headerRow, ['thangbaocao', 'thang']);
  const idxStart = findHeader(headerRow, ['ngaybatdau']);
  const idxEnd = findHeader(headerRow, ['ngayketthuc']);
  const idxChan = findHeader(headerRow, ['kenh']);
  const idxClass = findHeader(headerRow, ['phanloai']);
  const idxPers = findHeader(headerRow, ['nhansu', 'personnel']);
  const output: any[] = [];

  for (let rowIndex = headerRowIndex + 1; rowIndex < values.length; rowIndex++) {
    const row = values[rowIndex] || [];
    const month = text(row[idxMonth >= 0 ? idxMonth : 0]);
    const pers = text(row[idxPers >= 0 ? idxPers : 9]);
    if (!month || !pers) continue;
    const channel = text(row[idxChan >= 0 ? idxChan : 7]);
    const classification = text(row[idxClass >= 0 ? idxClass : 8]).replace(/facbeook/i, 'Facebook');
    const docId = `${month}_${channel}_${classification}_${pers}`.replace(/[\/\s]/g, '_');
    output.push({
      id: docId,
      reportMonth: month,
      startDate: text(row[idxStart >= 0 ? idxStart : 1]),
      endDate: text(row[idxEnd >= 0 ? idxEnd : 2]),
      channel,
      classification,
      personnel: pers,
      total: buildRoasMetric(row, chiPhiIdxs, dataIdxs, priceIdxs, roas1Idxs, roas3Idxs, 1),
      domestic: buildRoasMetric(row, chiPhiIdxs, dataIdxs, priceIdxs, roas1Idxs, roas3Idxs, 2),
      overseas: buildRoasMetric(row, chiPhiIdxs, dataIdxs, priceIdxs, roas1Idxs, roas3Idxs, 3)
    });
  }
  return output;
}

function buildPerformanceBlocks(periodRow: unknown[], regionRow: unknown[], metricRow: unknown[]) {
  const blocks: Array<{ col: number; periodName: string; periodLabel: string; periodIndex: number; regionName: string; regionLabel: string }> = [];
  let currentPeriod = '';
  let currentRegion = '';
  for (let col = 0; col < metricRow.length; col++) {
    const periodCell = text(periodRow[col]);
    const regionCell = text(regionRow[col]);
    if (periodCell) currentPeriod = periodCell;
    if (regionCell) currentRegion = regionCell;
    if (!normalizeSheetKey(metricRow[col]).includes('chiphi')) continue;
    const period = normalizePeriod(currentPeriod);
    const region = normalizeRegion(currentRegion);
    blocks.push({ col, ...period, ...region });
  }
  return blocks;
}

function normalizePeriod(label: string) {
  const key = normalizeSheetKey(label);
  if (key.includes('tongnam')) return { periodName: 'tong_nam', periodLabel: label || 'Tong nam', periodIndex: 0 };
  const match = key.match(/thang(\d{1,2})/);
  const index = match ? Number(match[1]) : 0;
  return { periodName: index ? `thang${index}` : key || 'unknown', periodLabel: label || 'Unknown', periodIndex: index };
}

function normalizeRegion(label: string) {
  const key = normalizeSheetKey(label);
  if (key.includes('trongnuoc')) return { regionName: 'trong_nuoc', regionLabel: 'Trong nuoc' };
  if (key.includes('nuocngoai')) return { regionName: 'nuoc_ngoai', regionLabel: 'Nuoc ngoai' };
  return { regionName: 'tong_cong', regionLabel: 'Tong cong' };
}

function findHeader(headers: string[], aliases: string[]) {
  return headers.findIndex(header => aliases.some(alias => header.includes(alias)));
}

function getOccurrence(indexes: number[], occurrence: number, fallback: number) {
  return indexes.length >= occurrence ? indexes[occurrence - 1] : fallback;
}

function buildRoasMetric(row: unknown[], chiPhiIdxs: number[], dataIdxs: number[], priceIdxs: number[], roas1Idxs: number[], roas3Idxs: number[], occurrence: number) {
  return {
    spend: num(row[getOccurrence(chiPhiIdxs, occurrence, 10 + (occurrence - 1) * 5)]),
    dataCount: num(row[getOccurrence(dataIdxs, occurrence, 11 + (occurrence - 1) * 5)]),
    dataPrice: num(row[getOccurrence(priceIdxs, occurrence, 12 + (occurrence - 1) * 5)]),
    roasMonth: num(row[getOccurrence(roas1Idxs, occurrence, 13 + (occurrence - 1) * 5)]),
    roas3Months: num(row[getOccurrence(roas3Idxs, occurrence, 14 + (occurrence - 1) * 5)])
  };
}
