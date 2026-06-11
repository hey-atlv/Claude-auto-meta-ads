import { generateObject } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { aiNormalizationResponseSchema, type AiNormalizationResponse, type CanonicalData, type DataQualityIssue, type NormalizedRecord, type RecordType } from '../prompts/schemas.js';
import { AI_NORMALIZATION_SYSTEM_PROMPT, buildNormalizationUserPrompt } from '../prompts/etl-prompts.js';
import { tokenManager, getAiRuntimeConfig } from '../lib/tokenManager.js';
import { validateNormalizationResponse } from '../lib/jsonValidator.js';

export type NormalizeInputOptions = {
  sourceType?: string;
  useAI?: boolean;
  userId?: string;
};

export type NormalizeInputResult = AiNormalizationResponse & {
  success: boolean;
  aiUsed: boolean;
  aiConfigured: boolean;
  model: string;
  tokenStats: ReturnType<typeof tokenManager.getStats>;
};

type MaterializedRow = {
  rowIndex: number;
  raw: Record<string, unknown>;
};

const numberFields = new Set([
  'spend', 'actual_spend', 'impressions', 'reach', 'clicks', 'messages', 'leads',
  'purchases', 'revenue', 'data_count', 'data_price', 'roas_month', 'roas_3_months',
  'cldt_value', 'cldt_positive_domestic', 'cldt_positive_overseas',
  'cost_per_messaging_conversation', 'cost_per_purchase', 'ctr_all', 'cpm', 'frequency'
]);

const textFields = new Set([
  'date', 'report_period', 'market_scope', 'market', 'account_id', 'account_name',
  'campaign_id', 'campaign_name', 'adset_id', 'adset_name', 'ad_id', 'ad_name',
  'content_id', 'brand', 'team', 'format', 'editor', 'production_date', 'channel',
  'classification', 'personnel', 'content_name', 'content_link', 'post_production_media',
  'post_production_design', 'production_team', 'content_producer', 'production_media',
  'sample_code', 'page', 'model_name', 'rejuvenation_group', 'region', 'age_range',
  'model_description', 'status', 'bm_name', 'company_name', 'partner_name', 'ads_name',
  'bank_name', 'number_card', 'page_code', 'page_id', 'page_name', 'page_type',
  'source_code', 'page_link', 'pancake', 'add_bm', 'removed_pan', 'vung_target'
]);

const aliases: Record<keyof CanonicalData, string[]> = {
  date: ['date', 'ngay', 'ngaybaocao', 'day'],
  report_period: ['reportperiod', 'reportmonth', 'thangbaocao', 'thang', 'ky', 'period'],
  market_scope: ['marketscope', 'vung', 'vungdialy', 'phamvu', 'scope'],
  market: ['market', 'thitruong', 'dialy', 'geography', 'vungtarget'],

  account_id: ['accountid', 'account_id', 'idtaikhoan', 'taikhoanid', 'actid'],
  account_name: ['accountname', 'account_name', 'tentaikhoan', 'tentaikhoanqc'],
  campaign_id: ['campaignid', 'campaign_id', 'idchiendich'],
  campaign_name: ['campaignname', 'campaign_name', 'tenchiendich'],
  adset_id: ['adsetid', 'adset_id'],
  adset_name: ['adsetname', 'adset_name'],
  ad_id: ['adid', 'ad_id'],
  ad_name: ['adname', 'ad_name', 'tenquangcao', 'tenads'],

  content_id: ['contentid', 'idcontent', 'idcontent1', 'tencontent', 'tenbaiquangcao', 'macontent'],
  content_name: ['contentname', 'tencontent', 'tenbaiquangcao', 'idcontent1'],
  content_link: ['link', 'url', 'trello', 'linktask'],
  brand: ['brand', 'nhanhieu', 'thuonghieu'],
  team: ['team', 'teamsanxuat', 'nhomsanxuat'],
  format: ['format', 'dinhdang', 'loaivideo'],
  editor: ['editor', 'bientap', 'nguoidung', 'nguoidungcontent'],
  post_production_media: ['mediahauky'],
  post_production_design: ['designhauky'],
  production_team: ['teamsanxuat'],
  content_producer: ['contentsanxuat'],
  production_media: ['mediasanxuat'],
  production_date: ['productiondate', 'ngaysanxuat', 'ngayquay'],
  sample_code: ['msmau', 'mamau', 'samplecode'],
  page: ['page', 'loaipage'],
  model_name: ['tencgsd', 'nguoimau', 'model'],
  rejuvenation_group: ['nhomtrehoa'],
  region: ['mien', 'region', 'vung'],
  age_range: ['dotuoi', 'agerange'],
  model_description: ['mau', 'motamau'],

  status: ['status', 'tinhtrang'],
  bm_name: ['bmname'],
  company_name: ['companyname', 'congty'],
  partner_name: ['partnername', 'doitac'],
  ads_name: ['adsname', 'tenadchay', 'tenadschay'],
  bank_name: ['bankname', 'nganhang'],
  number_card: ['numbercard', 'sothe'],

  page_code: ['pagecode', 'mapage'],
  page_id: ['pageid', 'idpage'],
  page_name: ['pagename', 'tenpage'],
  page_type: ['pagetype', 'loaipage'],
  source_code: ['sourcecode', 'manguonget'],
  page_link: ['pagelink', 'linkpage'],
  pancake: ['pancake'],
  add_bm: ['addbm'],
  removed_pan: ['dagopan', 'removedpan'],
  vung_target: ['vungtarget', 'dialy'],

  channel: ['channel', 'kenh'],
  classification: ['classification', 'phanloai'],
  personnel: ['personnel', 'nhansu', 'tencgsd', 'adsname'],

  spend: ['spend', 'amountspent', 'chiphi', 'chiphivnd', 'ngansach'],
  actual_spend: ['actualspend', 'chiphiactual', 'chiphihoadon'],
  impressions: ['impressions', 'hienthi'],
  reach: ['reach', 'tiepcan'],
  clicks: ['clicks', 'clickall', 'linkclicks'],
  messages: ['messages', 'messagingconversationsstarted', 'tinnhan', 'tn'],
  purchases: ['purchases', 'orders', 'donhang', 'luotmua', 'sdt', 'sodienthoai'],
  revenue: ['revenue', 'doanhthu'],
  data_count: ['datacount', 'sldata', 'soluongdata'],
  data_price: ['dataprice', 'giadata', 'cpl'],
  roas_month: ['roasmonth', 'roastrongthang', 'roas'],
  roas_3_months: ['roas3months', 'roas3thang', 'roas3m'],
  cldt_value: ['cldtvalue', 'cldt', 'chatluongdata'],
  cldt_positive_domestic: ['cldtpositivedomestic', 'tichcuctrongnuoc'],
  cldt_positive_overseas: ['cldtpositiveoverseas', 'tichcucnuocngoai'],
  cost_per_messaging_conversation: ['costpermessagingconversation'],
  cost_per_purchase: ['costperpurchase'],
  ctr_all: ['ctrall'],
  cpm: ['cpm'],
  frequency: ['frequency', 'tansuat']
};

const aliasLookup = new Map<string, keyof CanonicalData>();
Object.entries(aliases).forEach(([canonical, values]) => {
  aliasLookup.set(normalizeKey(canonical), canonical as keyof CanonicalData);
  values.forEach(value => aliasLookup.set(normalizeKey(value), canonical as keyof CanonicalData));
});

export async function normalizeInputData(rawData: unknown[], options: NormalizeInputOptions = {}): Promise<NormalizeInputResult> {
  const config = getAiRuntimeConfig();
  const deterministic = deterministicNormalize(rawData);
  const shouldUseAI = Boolean(options.useAI || config.enabled) && config.hasApiKey;

  if (!shouldUseAI || deterministic.records.length === 0) {
    return {
      success: deterministic.issues.every(issue => issue.severity !== 'error'),
      records: deterministic.records,
      issues: deterministic.issues,
      stats: deterministic.stats,
      aiUsed: false,
      aiConfigured: config.hasApiKey,
      model: config.model,
      tokenStats: tokenManager.getStats()
    };
  }

  try {
    const provider = createGoogleGenerativeAI({ apiKey: config.apiKey });
    const estimatedTokens = estimateTokens(deterministic.records) + 1200;
    tokenManager.assertCanSpend(Math.min(estimatedTokens, config.maxTokensPerRequest));

    const result = await generateObject({
      model: provider(config.model),
      schema: aiNormalizationResponseSchema,
      schemaName: 'InputNormalizationResponse',
      schemaDescription: 'Canonical JSON rows for Auto Meta Ads ETL',
      system: AI_NORMALIZATION_SYSTEM_PROMPT,
      prompt: buildNormalizationUserPrompt({
        sourceType: options.sourceType,
        records: deterministic.records,
        issues: deterministic.issues
      }),
      temperature: 0.1,
      maxOutputTokens: config.maxOutputTokens
    });

    tokenManager.record({
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      totalTokens: result.usage.totalTokens
    });

    const validation = validateNormalizationResponse(result.object);
    if (!validation.success && 'issues' in validation) {
      return withAiFallback(deterministic, config.model, config.hasApiKey, validation.issues);
    }

    return {
      success: validation.data.issues.every(issue => issue.severity !== 'error'),
      records: validation.data.records,
      issues: validation.data.issues,
      stats: validation.data.stats,
      aiUsed: true,
      aiConfigured: true,
      model: config.model,
      tokenStats: tokenManager.getStats()
    };
  } catch (error: any) {
    return withAiFallback(deterministic, config.model, config.hasApiKey, [{
      rowIndex: 0,
      severity: 'warning',
      field: 'ai',
      message: `AI normalization fallback: ${error?.message || String(error)}`,
      value: null
    }]);
  }
}

export function prepareRowsForTransform(records: NormalizedRecord[]): Record<string, any>[] {
  return records
    .filter(record => record.recordType !== 'unknown')
    .map(record => ({
      ...record.extra,
      ...record.canonical,
      _recordType: record.recordType,
      _normalizationConfidence: record.confidence,
      _normalizationWarnings: record.warnings
    }));
}

export function getAiNormalizerStatus() {
  const config = getAiRuntimeConfig();
  return {
    enabled: config.enabled,
    configured: config.hasApiKey,
    model: config.model,
    maxOutputTokens: config.maxOutputTokens,
    maxRecordsPerRequest: config.maxRecordsPerRequest,
    tokenStats: tokenManager.getStats()
  };
}

function deterministicNormalize(rawData: unknown[]): AiNormalizationResponse {
  const rows = materializeRows(rawData);
  const records = rows.map(row => normalizeRow(row));
  const issues = records.flatMap(record => validateRecord(record));

  return {
    records,
    issues,
    stats: {
      inputRows: rawData.length,
      outputRows: records.length,
      repairedRows: 0,
      rejectedRows: records.filter(record => record.recordType === 'unknown').length
    }
  };
}

function materializeRows(rawData: unknown[]): MaterializedRow[] {
  if (!Array.isArray(rawData) || rawData.length === 0) return [];

  if (Array.isArray(rawData[0])) {
    const headers = (rawData[0] as unknown[]).map((header, index) => {
      const value = String(header || '').trim();
      return value || `column_${index + 1}`;
    });

    return rawData.slice(1).map((row, index) => {
      const cells = Array.isArray(row) ? row : [];
      const raw: Record<string, unknown> = {};
      headers.forEach((header, cellIndex) => {
        raw[header] = cells[cellIndex] ?? null;
      });
      return { rowIndex: index + 1, raw };
    }).filter(row => Object.values(row.raw).some(value => value !== null && String(value).trim() !== ''));
  }

  return rawData.map((row, index) => ({
    rowIndex: index,
    raw: row && typeof row === 'object' ? row as Record<string, unknown> : { value: row }
  }));
}

function normalizeRow(row: MaterializedRow): NormalizedRecord {
  const canonical: Record<string, any> = {};
  const extra: Record<string, string | number | boolean | null> = {};
  const warnings: string[] = [];

  Object.entries(row.raw).forEach(([key, value]) => {
    const canonicalKey = aliasLookup.get(normalizeKey(key));
    if (!canonicalKey) {
      extra[key] = toSimpleValue(value);
      return;
    }

    if (numberFields.has(canonicalKey)) {
      canonical[canonicalKey] = parseNumber(value);
    } else if (canonicalKey === 'date' || canonicalKey === 'production_date') {
      canonical[canonicalKey] = parseDate(value);
    } else if (canonicalKey === 'report_period') {
      canonical[canonicalKey] = parseReportPeriod(value);
    } else if (textFields.has(canonicalKey)) {
      canonical[canonicalKey] = cleanText(value);
    } else {
      canonical[canonicalKey] = toSimpleValue(value);
    }
  });

  if (canonical.account_id && typeof canonical.account_id === 'string') {
    canonical.account_id = canonical.account_id.trim();
  }

  const recordType = inferRecordType(canonical);
  if (recordType === 'unknown') {
    warnings.push('Could not infer record type from known fields.');
  }

  return {
    rowIndex: row.rowIndex,
    recordType,
    confidence: recordType === 'unknown' ? 0.35 : 0.8,
    canonical,
    extra,
    warnings
  };
}

function inferRecordType(canonical: Record<string, any>): RecordType {
  if (canonical.date && canonical.account_id && canonical.campaign_id) return 'ads_data';
  if (canonical.account_id && canonical.account_name && !canonical.campaign_id) return 'account_config';
  if (canonical.page_code && (canonical.page_name || canonical.page_id || canonical.page_type)) return 'fanpage_config';
  if (canonical.content_id && canonical.report_period && (hasNumber(canonical.spend) || hasNumber(canonical.roas_month) || hasNumber(canonical.data_count))) return 'content_performance';
  if (canonical.report_period && (canonical.channel || canonical.classification || canonical.personnel) && (hasNumber(canonical.roas_month) || hasNumber(canonical.spend))) return 'roas_summary';
  if (canonical.content_id && (canonical.brand || canonical.team || canonical.format || canonical.production_date)) return 'content_master';
  return 'unknown';
}

function validateRecord(record: NormalizedRecord): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  const c = record.canonical;

  if (record.recordType === 'ads_data') {
    if (!c.date) issues.push(issue(record.rowIndex, 'error', 'date', 'Missing date', null));
    if (!c.account_id) issues.push(issue(record.rowIndex, 'error', 'account_id', 'Missing account_id', null));
    if (!c.campaign_id) issues.push(issue(record.rowIndex, 'error', 'campaign_id', 'Missing campaign_id', null));
  }

  if (record.recordType === 'content_performance') {
    if (!c.content_id) issues.push(issue(record.rowIndex, 'error', 'content_id', 'Missing content_id', null));
    if (!c.report_period) issues.push(issue(record.rowIndex, 'error', 'report_period', 'Missing report_period', null));
  }

  if (record.recordType === 'unknown') {
    issues.push(issue(record.rowIndex, 'warning', 'recordType', 'Row is not usable for canonical ETL yet', null));
  }

  numberFields.forEach(field => {
    const value = (c as any)[field];
    if (value !== undefined && value !== null && (!Number.isFinite(value) || value < 0)) {
      issues.push(issue(record.rowIndex, 'error', field, 'Numeric field must be a non-negative finite number', value));
    }
  });

  return issues;
}

function issue(rowIndex: number, severity: 'error' | 'warning', field: string, message: string, value: string | number | boolean | null): DataQualityIssue {
  return { rowIndex, severity, field, message, value };
}

function withAiFallback(deterministic: AiNormalizationResponse, model: string, aiConfigured: boolean, aiIssues: DataQualityIssue[]): NormalizeInputResult {
  const issues = [...deterministic.issues, ...aiIssues];
  return {
    success: issues.every(issue => issue.severity !== 'error'),
    records: deterministic.records,
    issues,
    stats: deterministic.stats,
    aiUsed: false,
    aiConfigured,
    model,
    tokenStats: tokenManager.getStats()
  };
}

function normalizeKey(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function cleanText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text || ['#N/A', 'N/A', '-', 'null', 'undefined'].includes(text)) return null;
  return text;
}

function parseNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  let text = String(value).trim();
  if (!text || ['#N/A', 'N/A', '-', 'null', 'undefined'].includes(text)) return null;
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
  return Number.isFinite(number) ? number : null;
}

function parseDate(value: unknown): string | null {
  const text = cleanText(value);
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

function parseReportPeriod(value: unknown): string | null {
  const text = cleanText(value);
  if (!text) return null;
  if (/^\d{4}-\d{2}$/.test(text)) return text;

  const normalized = normalizeKey(text);
  const monthYear = text.match(/(\d{1,2})\s*[/-]\s*(\d{4})/);
  if (monthYear) return `${monthYear[2]}-${monthYear[1].padStart(2, '0')}`;
  const yearMonth = text.match(/(\d{4})\s*[/-]\s*(\d{1,2})/);
  if (yearMonth) return `${yearMonth[1]}-${yearMonth[2].padStart(2, '0')}`;
  const monthOnly = normalized.match(/(?:thang|t)(\d{1,2})/);
  if (monthOnly) {
    const year = new Date().getFullYear();
    return `${year}-${monthOnly[1].padStart(2, '0')}`;
  }
  return text;
}

function toSimpleValue(value: unknown): string | number | boolean | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return JSON.stringify(value);
}

function hasNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value);
}

function estimateTokens(value: unknown) {
  return Math.ceil(JSON.stringify(value).length / 4);
}
