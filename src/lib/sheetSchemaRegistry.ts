import type { RecordType } from '../prompts/schemas.js';

export type SheetType =
  | RecordType
  | 'fanpage_config'
  | 'content_performance_matrix'
  | 'roas_summary_matrix'
  | 'cldt_matrix';

export type AdapterTarget =
  | 'adsData'
  | 'adAccounts'
  | 'fanpages'
  | 'contents'
  | 'performance'
  | 'roasSummary'
  | 'cldt'
  | 'unknown';

export interface SheetSchemaContract {
  sheetType: SheetType;
  adapterTarget: AdapterTarget;
  requiredFields: string[];
  optionalFields: string[];
  headerAliases: Record<string, string[]>;
  minHeaderMatches: number;
}

const baseAliases: Record<string, string[]> = {
  date: ['date', 'ngay', 'ngay bao cao', 'day'],
  report_period: ['report period', 'report month', 'thang bao cao', 'thang', 'ky', 'period'],
  market_scope: ['market scope', 'vung', 'vung dia ly', 'dia ly', 'pham vi'],
  market: ['market', 'thi truong', 'dia ly', 'geography', 'vung target'],

  account_id: ['account id', 'account_id', 'id tai khoan', 'tai khoan id', 'act id'],
  account_name: ['account name', 'account_name', 'ten tai khoan', 'ten tai khoan qc'],
  campaign_id: ['campaign id', 'campaign_id', 'id chien dich'],
  campaign_name: ['campaign name', 'campaign_name', 'ten chien dich'],
  adset_id: ['adset id', 'adset_id'],
  adset_name: ['adset name', 'adset_name'],
  ad_id: ['ad id', 'ad_id'],
  ad_name: ['ad name', 'ad_name', 'ten quang cao', 'ten ads'],

  content_id: ['content id', 'id content', 'id content 1', 'ten content', 'ten bai quang cao', 'ma content', 'row labels'],
  content_name: ['content name', 'ten content', 'ten bai quang cao'],
  content_link: ['link', 'url', 'trello', 'link task'],
  brand: ['brand', 'nhan hieu', 'thuong hieu'],
  team: ['team', 'team san xuat', 'nhom san xuat'],
  editor: ['editor', 'bien tap', 'nguoi dung', 'nguoi dung content'],
  post_production_media: ['media hau ky'],
  post_production_design: ['design hau ky'],
  production_team: ['team san xuat'],
  content_producer: ['content san xuat'],
  production_media: ['media san xuat'],
  production_date: ['production date', 'ngay san xuat', 'ngay quay'],
  sample_code: ['ms mau', 'ma mau', 'sample code'],
  page: ['page', 'loai page'],
  model_name: ['ten cgsd', 'ten cgsđ', 'nguoi mau', 'model'],
  rejuvenation_group: ['nhom tre hoa', 'nhom tre hoá'],
  format: ['format', 'dinh dang', 'loai video'],
  region: ['mien', 'region', 'vung'],
  age_range: ['do tuoi', 'age range'],
  model_description: ['mau', 'mo ta mau'],
  personnel: ['personnel', 'nhan su', 'ten cgsd', 'ads name'],

  status: ['status', 'tinh trang'],
  bm_name: ['bm name', 'bm_name'],
  company_name: ['company name', 'company_name', 'cong ty'],
  partner_name: ['partner name', 'partner_name', 'doi tac'],
  ads_name: ['ads name', 'ads_name', 'ten ad chay', 'ten ads chay'],
  bank_name: ['bank name', 'bank_name', 'ngan hang'],
  number_card: ['number card', 'number_card', 'so the'],

  page_code: ['page code', 'page_code', 'ma page'],
  page_id: ['page id', 'page_id', 'id page'],
  page_name: ['page name', 'page_name', 'ten page'],
  page_type: ['page type', 'page_type', 'loai page'],
  source_code: ['source code', 'source_code', 'ma nguon get'],
  page_link: ['page link', 'page_link', 'link page'],
  pancake: ['pancake'],
  add_bm: ['add bm'],
  removed_pan: ['da go pan', 'removed pan'],
  vung_target: ['vung target', 'dia ly'],

  channel: ['channel', 'kenh'],
  classification: ['classification', 'phan loai'],
  spend: ['spend', 'amount spent', 'amount_spent', 'chi phi', 'chi phi vnd', 'ngan sach'],
  actual_spend: ['actual spend', 'chi phi actual', 'chi phi hoa don'],
  impressions: ['impressions', 'hien thi'],
  reach: ['reach', 'tiep can'],
  frequency: ['frequency', 'tan suat'],
  clicks: ['clicks', 'click all', 'link clicks'],
  ctr_all: ['ctr all', 'ctr_all'],
  cpm: ['cpm'],
  messages: ['messages', 'messaging conversations started', 'tin nhan', 'tn'],
  cost_per_messaging_conversation: ['cost per messaging conversation', 'cost_per_messaging_conversation'],
  purchases: ['purchases', 'orders', 'don hang', 'luot mua', 'sdt', 'so dien thoai'],
  cost_per_purchase: ['cost per purchase', 'cost_per_purchase'],
  revenue: ['revenue', 'doanh thu'],
  data_count: ['data count', 'sl data', 'so luong data'],
  data_price: ['data price', 'gia data', 'cpl'],
  roas_month: ['roas month', 'roas trong thang', 'roas'],
  roas_3_months: ['roas 3 months', 'roas 3 thang', 'roas 3m'],
  cldt_value: ['cldt value', 'cldt', 'chat luong data'],
  cldt_positive_domestic: ['cldt positive domestic', 'tich cuc trong nuoc'],
  cldt_positive_overseas: ['cldt positive overseas', 'tich cuc nuoc ngoai']
};

export const sheetContracts: SheetSchemaContract[] = [
  {
    sheetType: 'ads_data',
    adapterTarget: 'adsData',
    requiredFields: ['date', 'account_id', 'campaign_id'],
    optionalFields: [
      'account_name', 'campaign_name', 'adset_id', 'adset_name', 'ad_id', 'ad_name',
      'spend', 'impressions', 'reach', 'frequency', 'ctr_all', 'cpm', 'messages',
      'cost_per_messaging_conversation', 'purchases', 'cost_per_purchase', 'revenue', 'leads'
    ],
    headerAliases: baseAliases,
    minHeaderMatches: 5
  },
  {
    sheetType: 'account_config',
    adapterTarget: 'adAccounts',
    requiredFields: ['account_id'],
    optionalFields: ['account_name', 'status', 'bm_name', 'company_name', 'partner_name', 'ads_name', 'bank_name', 'number_card'],
    headerAliases: baseAliases,
    minHeaderMatches: 3
  },
  {
    sheetType: 'fanpage_config',
    adapterTarget: 'fanpages',
    requiredFields: ['page_code'],
    optionalFields: ['page_name', 'page_id', 'ads_name', 'source_code', 'page_type', 'geography', 'page_link', 'status', 'pancake', 'add_bm', 'removed_pan'],
    headerAliases: baseAliases,
    minHeaderMatches: 4
  },
  {
    sheetType: 'content_master',
    adapterTarget: 'contents',
    requiredFields: ['content_id'],
    optionalFields: [
      'content_name', 'content_link', 'team', 'brand', 'editor', 'post_production_media',
      'post_production_design', 'production_team', 'content_producer', 'production_media',
      'production_date', 'sample_code', 'page', 'model_name', 'rejuvenation_group',
      'format', 'region', 'age_range', 'model_description'
    ],
    headerAliases: baseAliases,
    minHeaderMatches: 5
  },
  {
    sheetType: 'content_performance_matrix',
    adapterTarget: 'performance',
    requiredFields: ['channel', 'classification', 'content_name'],
    optionalFields: ['spend', 'data_count', 'data_price', 'roas_month', 'roas_3_months', 'personnel', 'market_scope', 'report_period'],
    headerAliases: baseAliases,
    minHeaderMatches: 3
  },
  {
    sheetType: 'roas_summary_matrix',
    adapterTarget: 'roasSummary',
    requiredFields: ['report_period', 'channel', 'classification', 'personnel'],
    optionalFields: ['spend', 'data_count', 'data_price', 'roas_month', 'roas_3_months'],
    headerAliases: baseAliases,
    minHeaderMatches: 4
  },
  {
    sheetType: 'cldt_matrix',
    adapterTarget: 'cldt',
    requiredFields: ['content_id'],
    optionalFields: ['cldt_positive_domestic', 'cldt_positive_overseas', 'personnel'],
    headerAliases: baseAliases,
    minHeaderMatches: 2
  }
];

export function getSheetContract(sheetType: SheetType) {
  return sheetContracts.find(contract => contract.sheetType === sheetType);
}

export function inferExpectedSheetType(sourceName: string, sheetName: string): SheetType | undefined {
  const source = normalizeSheetKey(`${sourceName} ${sheetName}`);
  if (source.includes('masterdatabasecontent') || source.includes('idfb')) return 'content_master';
  if (source.includes('roascontent')) return 'content_performance_matrix';
  if (source.includes('cldt')) return 'cldt_matrix';
  if (source.includes('serynpage')) return 'fanpage_config';
  if (source.includes('config')) return 'account_config';
  if (source.includes('roastong') || source.includes('roastong')) return 'roas_summary_matrix';
  if (source.includes('rawdata')) return 'ads_data';
  return undefined;
}

export function normalizeSheetKey(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function cleanSheetText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text || ['#N/A', 'N/A', '-', 'null', 'undefined'].includes(text)) return null;
  return text;
}

export function parseSheetNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  let text = String(value).trim();
  if (!text || ['#N/A', 'N/A', '-', 'null', 'undefined'].includes(text)) return null;
  const isPercent = text.includes('%');
  text = text.replace('%', '').replace(/[^\d.,-]/g, '');
  if (!text) return null;

  const hasComma = text.includes(',');
  const hasDot = text.includes('.');
  if (hasComma && hasDot) {
    text = text.lastIndexOf(',') > text.lastIndexOf('.')
      ? text.replace(/\./g, '').replace(',', '.')
      : text.replace(/,/g, '');
  } else if (hasComma) {
    const parts = text.split(',');
    text = parts.length === 2 && parts[1].length !== 3 ? text.replace(',', '.') : text.replace(/,/g, '');
  } else if (hasDot) {
    const parts = text.split('.');
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      text = text.replace(/\./g, '');
    }
  }

  const number = Number.parseFloat(text);
  if (!Number.isFinite(number)) return null;
  return isPercent ? number / 100 : number;
}

export function parseSheetDate(value: unknown): string | null {
  const text = cleanSheetText(value);
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const normalized = text.replace(/[./]/g, '-');
  const dmy = normalized.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  const ymd = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;
  const compact = text.match(/^(\d{2})(\d{2})(\d{2})$/);
  if (compact) return `20${compact[1]}-${compact[2]}-${compact[3]}`;

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return text;
}

export function toSimpleSheetValue(value: unknown): string | number | boolean | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return JSON.stringify(value);
}

export const numericCanonicalFields = new Set([
  'spend', 'actual_spend', 'impressions', 'reach', 'frequency', 'clicks', 'messages',
  'leads', 'purchases', 'revenue', 'data_count', 'data_price', 'roas_month',
  'roas_3_months', 'cldt_value', 'cldt_positive_domestic', 'cldt_positive_overseas',
  'cost_per_messaging_conversation', 'cost_per_purchase', 'ctr_all', 'cpm'
]);

export const dateCanonicalFields = new Set(['date', 'production_date']);
