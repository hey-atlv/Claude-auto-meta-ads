import { z } from 'zod';

export const recordTypeSchema = z.enum([
  'ads_data',
  'account_config',
  'fanpage_config',
  'content_master',
  'content_performance',
  'roas_summary',
  'unknown'
]);

export const issueSeveritySchema = z.enum(['error', 'warning']);

export const simpleValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null()
]);

export const canonicalDataSchema = z.object({
  date: z.string().nullable().optional(),
  report_period: z.string().nullable().optional(),
  market_scope: z.string().nullable().optional(),
  market: z.string().nullable().optional(),

  account_id: z.string().nullable().optional(),
  account_name: z.string().nullable().optional(),
  campaign_id: z.string().nullable().optional(),
  campaign_name: z.string().nullable().optional(),
  adset_id: z.string().nullable().optional(),
  adset_name: z.string().nullable().optional(),
  ad_id: z.string().nullable().optional(),
  ad_name: z.string().nullable().optional(),

  content_id: z.string().nullable().optional(),
  content_name: z.string().nullable().optional(),
  content_link: z.string().nullable().optional(),
  brand: z.string().nullable().optional(),
  team: z.string().nullable().optional(),
  format: z.string().nullable().optional(),
  editor: z.string().nullable().optional(),
  post_production_media: z.string().nullable().optional(),
  post_production_design: z.string().nullable().optional(),
  production_team: z.string().nullable().optional(),
  content_producer: z.string().nullable().optional(),
  production_media: z.string().nullable().optional(),
  production_date: z.string().nullable().optional(),
  sample_code: z.string().nullable().optional(),
  page: z.string().nullable().optional(),
  model_name: z.string().nullable().optional(),
  rejuvenation_group: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  age_range: z.string().nullable().optional(),
  model_description: z.string().nullable().optional(),

  status: z.string().nullable().optional(),
  bm_name: z.string().nullable().optional(),
  company_name: z.string().nullable().optional(),
  partner_name: z.string().nullable().optional(),
  ads_name: z.string().nullable().optional(),
  bank_name: z.string().nullable().optional(),
  number_card: z.string().nullable().optional(),

  page_code: z.string().nullable().optional(),
  page_id: z.string().nullable().optional(),
  page_name: z.string().nullable().optional(),
  page_type: z.string().nullable().optional(),
  source_code: z.string().nullable().optional(),
  page_link: z.string().nullable().optional(),
  pancake: z.string().nullable().optional(),
  add_bm: z.string().nullable().optional(),
  removed_pan: z.string().nullable().optional(),
  vung_target: z.string().nullable().optional(),

  channel: z.string().nullable().optional(),
  classification: z.string().nullable().optional(),
  personnel: z.string().nullable().optional(),

  spend: z.number().nullable().optional(),
  actual_spend: z.number().nullable().optional(),
  impressions: z.number().nullable().optional(),
  reach: z.number().nullable().optional(),
  clicks: z.number().nullable().optional(),
  messages: z.number().nullable().optional(),
  leads: z.number().nullable().optional(),
  purchases: z.number().nullable().optional(),
  revenue: z.number().nullable().optional(),
  data_count: z.number().nullable().optional(),
  data_price: z.number().nullable().optional(),
  roas_month: z.number().nullable().optional(),
  roas_3_months: z.number().nullable().optional(),
  cldt_value: z.number().nullable().optional(),
  cldt_positive_domestic: z.number().nullable().optional(),
  cldt_positive_overseas: z.number().nullable().optional(),
  cost_per_messaging_conversation: z.number().nullable().optional(),
  cost_per_purchase: z.number().nullable().optional(),
  ctr_all: z.number().nullable().optional(),
  cpm: z.number().nullable().optional(),
  frequency: z.number().nullable().optional()
}).passthrough();

export const normalizedRecordSchema = z.object({
  rowIndex: z.number().int().nonnegative(),
  recordType: recordTypeSchema,
  confidence: z.number().min(0).max(1),
  canonical: canonicalDataSchema,
  extra: z.record(z.string(), simpleValueSchema),
  warnings: z.array(z.string())
});

export const dataQualityIssueSchema = z.object({
  rowIndex: z.number().int().nonnegative(),
  severity: issueSeveritySchema,
  field: z.string(),
  message: z.string(),
  value: simpleValueSchema.optional()
});

export const aiNormalizationResponseSchema = z.object({
  records: z.array(normalizedRecordSchema),
  issues: z.array(dataQualityIssueSchema),
  stats: z.object({
    inputRows: z.number().int().nonnegative(),
    outputRows: z.number().int().nonnegative(),
    repairedRows: z.number().int().nonnegative(),
    rejectedRows: z.number().int().nonnegative()
  })
});

export type RecordType = z.infer<typeof recordTypeSchema>;
export type CanonicalData = z.infer<typeof canonicalDataSchema>;
export type NormalizedRecord = z.infer<typeof normalizedRecordSchema>;
export type DataQualityIssue = z.infer<typeof dataQualityIssueSchema>;
export type AiNormalizationResponse = z.infer<typeof aiNormalizationResponseSchema>;
