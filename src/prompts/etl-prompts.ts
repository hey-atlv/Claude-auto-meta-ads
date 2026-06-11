type BuildPromptInput = {
  sourceType?: string;
  records: unknown[];
  issues: unknown[];
};

export const AI_NORMALIZATION_SYSTEM_PROMPT = `You normalize messy Google Sheets rows for an advertising analytics ETL system.

Return only valid JSON that matches the provided schema.

Rules:
- Do not invent business facts. Use null when a value cannot be inferred safely.
- Preserve unknown columns in extra.
- Convert dates to YYYY-MM-DD when a day is known, or YYYY-MM for reporting periods.
- Convert currency and metric strings to numbers. Remove currency symbols and thousands separators.
- Treat #N/A, N/A, -, empty strings, and obvious formula errors as null.
- Use recordType ads_data for Meta Ads Manager daily metrics.
- Use recordType account_config for ad account configuration rows.
- Use recordType fanpage_config for fanpage/page configuration rows.
- Use recordType content_master for content catalog rows.
- Use recordType content_performance for content-level spend/data/ROAS by period and market.
- Use recordType roas_summary for accounting ROAS summary rows by channel/classification/personnel.
- If a row is a visual group label, subtotal, decoration, or too ambiguous, return recordType unknown with a warning.
- Keep rowIndex equal to the input rowIndex.
- Prefer deterministic field names exactly as listed in canonical.
`;

export function buildNormalizationUserPrompt(input: BuildPromptInput): string {
  return JSON.stringify({
    task: 'repair_and_standardize_rows_to_canonical_json',
    sourceType: input.sourceType || 'auto',
    records: input.records,
    knownIssuesFromDeterministicParser: input.issues,
    canonicalContract: {
      requiredForAdsData: ['date', 'account_id', 'campaign_id'],
      requiredForContentPerformance: ['content_id', 'report_period'],
      stableKeys: [
        'date', 'report_period', 'market_scope', 'market',
        'account_id', 'account_name', 'campaign_id', 'campaign_name',
        'adset_id', 'adset_name', 'ad_id', 'ad_name',
        'content_id', 'content_name', 'content_link', 'brand', 'team', 'format',
        'editor', 'post_production_media', 'post_production_design',
        'production_team', 'content_producer', 'production_media', 'production_date',
        'sample_code', 'page', 'model_name', 'rejuvenation_group', 'region',
        'age_range', 'model_description',
        'status', 'bm_name', 'company_name', 'partner_name', 'ads_name',
        'bank_name', 'number_card', 'page_code', 'page_id', 'page_name',
        'page_type', 'source_code', 'page_link', 'pancake', 'add_bm',
        'removed_pan', 'vung_target',
        'channel', 'classification', 'personnel',
        'spend', 'actual_spend', 'impressions', 'reach', 'clicks', 'messages',
        'leads', 'purchases', 'revenue', 'data_count', 'data_price',
        'roas_month', 'roas_3_months', 'cldt_value',
        'cldt_positive_domestic', 'cldt_positive_overseas',
        'cost_per_messaging_conversation', 'cost_per_purchase', 'ctr_all', 'cpm',
        'frequency'
      ]
    }
  });
}
