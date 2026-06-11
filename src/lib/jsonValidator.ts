import {
  aiNormalizationResponseSchema,
  dataQualityIssueSchema,
  normalizedRecordSchema,
  type AiNormalizationResponse,
  type DataQualityIssue,
  type NormalizedRecord
} from '../prompts/schemas.js';

export function validateNormalizedRecord(record: unknown): { success: true; data: NormalizedRecord } | { success: false; issues: DataQualityIssue[] } {
  const parsed = normalizedRecordSchema.safeParse(record);
  if (parsed.success) return { success: true, data: parsed.data };

  return {
    success: false,
    issues: parsed.error.issues.map((issue): DataQualityIssue => ({
      rowIndex: typeof (record as any)?.rowIndex === 'number' ? (record as any).rowIndex : 0,
      severity: 'error',
      field: issue.path.join('.') || 'record',
      message: issue.message,
      value: null
    }))
  };
}

export function validateNormalizationResponse(payload: unknown): { success: true; data: AiNormalizationResponse } | { success: false; issues: DataQualityIssue[] } {
  const parsed = aiNormalizationResponseSchema.safeParse(payload);
  if (parsed.success) return { success: true, data: parsed.data };

  return {
    success: false,
    issues: parsed.error.issues.map((issue): DataQualityIssue => ({
      rowIndex: 0,
      severity: 'error',
      field: issue.path.join('.') || 'response',
      message: issue.message,
      value: null
    }))
  };
}

export function normalizeIssues(issues: unknown[]): DataQualityIssue[] {
  return issues.flatMap(issue => {
    const parsed = dataQualityIssueSchema.safeParse(issue);
    return parsed.success ? [parsed.data] : [];
  });
}
