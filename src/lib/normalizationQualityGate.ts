import type { DataQualityIssue, NormalizedRecord } from '../prompts/schemas.js';
import type { SheetType } from './sheetSchemaRegistry.js';

export interface QualityGateResult {
  acceptedRecords: NormalizedRecord[];
  rejectedRecords: NormalizedRecord[];
  issues: DataQualityIssue[];
}

const requiredByType: Record<string, string[]> = {
  ads_data: ['date', 'account_id', 'campaign_id'],
  account_config: ['account_id'],
  fanpage_config: ['page_code'],
  content_master: ['content_id'],
  content_performance: ['content_id', 'report_period', 'market_scope'],
  roas_summary: ['report_period', 'channel', 'classification', 'personnel']
};

export function applyQualityGate(records: NormalizedRecord[], sheetType: SheetType | 'unknown', minConfidence = 0.85): QualityGateResult {
  const acceptedRecords: NormalizedRecord[] = [];
  const rejectedRecords: NormalizedRecord[] = [];
  const issues: DataQualityIssue[] = [];

  for (const record of records) {
    const effectiveType = record.recordType === 'unknown' ? sheetType : record.recordType;
    const requiredFields = requiredByType[String(effectiveType)] || [];
    const missing = getMissingRequiredFields(record, String(effectiveType), requiredFields);
    const hardReject = (record.recordType === 'unknown' && sheetType === 'unknown') || missing.length > 0 || record.confidence < 0.6;

    if (missing.length > 0) {
      issues.push({
        rowIndex: record.rowIndex,
        severity: 'error',
        field: 'requiredFields',
        message: `Missing required fields: ${missing.join(', ')}`,
        value: missing.join(', ')
      });
    }

    if (record.confidence < minConfidence && !hardReject) {
      issues.push({
        rowIndex: record.rowIndex,
        severity: 'warning',
        field: 'confidence',
        message: `Normalization confidence below target ${minConfidence}`,
        value: record.confidence
      });
      acceptedRecords.push(record);
    } else if (hardReject) {
      rejectedRecords.push(record);
    } else {
      acceptedRecords.push(record);
    }
  }

  return { acceptedRecords, rejectedRecords, issues };
}

function getMissingRequiredFields(record: NormalizedRecord, effectiveType: string, requiredFields: string[]) {
  const canonical = record.canonical as any;
  if (effectiveType === 'content_master') {
    return isEmpty(canonical.content_id) && isEmpty(canonical.content_name) ? ['content_id or content_name'] : [];
  }
  return requiredFields.filter(field => isEmpty(canonical[field]));
}

function isEmpty(value: unknown) {
  return value === undefined || value === null || String(value).trim() === '';
}
