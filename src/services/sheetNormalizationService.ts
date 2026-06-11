import type { DataQualityIssue, NormalizedRecord, RecordType } from '../prompts/schemas.js';
import { normalizeInputData } from './etlServiceAI.js';
import { applyQualityGate } from '../lib/normalizationQualityGate.js';
import { detectSheetTable, type SheetTableModel } from '../lib/sheetTableDetector.js';
import {
  cleanSheetText,
  dateCanonicalFields,
  getSheetContract,
  numericCanonicalFields,
  parseSheetDate,
  parseSheetNumber,
  toSimpleSheetValue,
  type SheetType
} from '../lib/sheetSchemaRegistry.js';

export interface NormalizedSheetReport {
  spreadsheetId: string;
  sheetName: string;
  sourceName: string;
  sheetType: SheetType | 'unknown';
  headerRowIndex: number;
  confidence: number;
  aiUsed: boolean;
  mapping: Record<string, string>;
  missingRequiredFields: string[];
  unknownHeaders: string[];
  warnings: string[];
  stats: {
    inputRows: number;
    outputRows: number;
    rejectedRows: number;
    repairedRows: number;
    adapterOutputRows?: number;
  };
  issues: DataQualityIssue[];
}

export interface NormalizedSheetResult {
  success: boolean;
  table: SheetTableModel;
  sheetType: SheetType | 'unknown';
  records: NormalizedRecord[];
  rejectedRecords: NormalizedRecord[];
  issues: DataQualityIssue[];
  mapping: Record<string, string>;
  confidence: number;
  aiUsed: boolean;
  report: NormalizedSheetReport;
}

const matrixTypes = new Set<SheetType>(['content_performance_matrix', 'roas_summary_matrix', 'cldt_matrix']);

export async function normalizeSheetValues(input: {
  spreadsheetId: string;
  sheetName: string;
  sourceName?: string;
  values: unknown[][];
  expectedType?: SheetType;
  useAI?: boolean;
}): Promise<NormalizedSheetResult> {
  const table = detectSheetTable({
    spreadsheetId: input.spreadsheetId,
    sheetName: input.sheetName,
    sourceName: input.sourceName,
    values: input.values,
    expectedType: input.expectedType
  });

  const minConfidence = readNumberEnv('ETL_MIN_NORMALIZATION_CONFIDENCE', 0.85);
  const deterministicRecords = matrixTypes.has(table.detectedType as SheetType)
    ? []
    : table.rows.map(row => normalizeTableRow(table, row.rowIndex, row.raw));

  let records = deterministicRecords;
  let aiUsed = false;
  let aiIssues: DataQualityIssue[] = [];
  const shouldAskAI = shouldUseAiAssist(input.useAI, table.confidence) && deterministicRecords.length > 0;

  if (shouldAskAI) {
    const maxRecords = readNumberEnv('AI_NORMALIZE_BATCH_SIZE', 25);
    const sample = table.rows.slice(0, maxRecords).map(row => row.raw);
    const aiResult = await normalizeInputData(sample, {
      sourceType: String(table.detectedType),
      useAI: true,
      userId: 'server-sync'
    });
    aiUsed = aiResult.aiUsed;
    aiIssues = aiResult.issues;

    if (deterministicRecords.length <= maxRecords && aiResult.records.length > 0 && aiResult.aiUsed) {
      records = aiResult.records;
    }
  }

  const gate = applyQualityGate(records, table.detectedType, minConfidence);
  const issues = [...tableIssues(table), ...gate.issues, ...aiIssues];
  const success = issues.every(issue => issue.severity !== 'error');
  const report: NormalizedSheetReport = {
    spreadsheetId: input.spreadsheetId,
    sheetName: input.sheetName,
    sourceName: input.sourceName || '',
    sheetType: table.detectedType,
    headerRowIndex: table.headerRowIndex,
    confidence: table.confidence,
    aiUsed,
    mapping: table.mapping,
    missingRequiredFields: table.missingRequiredFields,
    unknownHeaders: table.unknownHeaders,
    warnings: table.warnings,
    stats: {
      inputRows: Math.max(0, input.values.length - Math.max(table.headerRowIndex + 1, 0)),
      outputRows: gate.acceptedRecords.length,
      rejectedRows: gate.rejectedRecords.length,
      repairedRows: 0
    },
    issues
  };

  return {
    success,
    table,
    sheetType: table.detectedType,
    records: gate.acceptedRecords,
    rejectedRecords: gate.rejectedRecords,
    issues,
    mapping: table.mapping,
    confidence: table.confidence,
    aiUsed,
    report
  };
}

export function buildQualitySummary(reports: NormalizedSheetReport[], quarantine: unknown[]) {
  const totalInputRows = reports.reduce((sum, report) => sum + report.stats.inputRows, 0);
  const totalOutputRows = reports.reduce((sum, report) => sum + (report.stats.adapterOutputRows ?? report.stats.outputRows), 0);
  const totalRejectedRows = reports.reduce((sum, report) => sum + report.stats.rejectedRows, 0);
  const errorCount = reports.reduce((sum, report) => sum + report.issues.filter(issue => issue.severity === 'error').length, 0);
  const warningCount = reports.reduce((sum, report) => sum + report.issues.filter(issue => issue.severity === 'warning').length, 0);
  const healthScore = totalInputRows > 0
    ? Math.max(0, Math.min(100, Math.round(((totalInputRows - totalRejectedRows - errorCount) / totalInputRows) * 100)))
    : 0;

  return {
    generatedAt: new Date().toISOString(),
    mode: process.env.ETL_NORMALIZATION_MODE || 'hybrid',
    healthScore,
    totals: {
      inputRows: totalInputRows,
      outputRows: totalOutputRows,
      rejectedRows: totalRejectedRows,
      quarantineRows: quarantine.length,
      errorCount,
      warningCount,
      aiUsedSheets: reports.filter(report => report.aiUsed).length
    },
    sheets: reports
  };
}

function normalizeTableRow(table: SheetTableModel, rowIndex: number, raw: Record<string, unknown>): NormalizedRecord {
  const canonical: Record<string, any> = {};
  const extra: Record<string, string | number | boolean | null> = {};
  const contract = getSheetContract(table.detectedType as SheetType);

  Object.entries(raw).forEach(([header, value]) => {
    const field = Object.entries(table.mapping).find(([, mappedHeader]) => mappedHeader === header)?.[0];
    if (!field) {
      extra[header] = toSimpleSheetValue(value);
      return;
    }
    canonical[field] = parseCanonicalField(field, value);
  });

  const missingRequired = (contract?.requiredFields || []).filter(field => !canonical[field]);
  const confidence = Math.max(0.1, table.confidence - missingRequired.length * 0.15);
  const recordType = toRecordType(table.detectedType);
  const warnings = [
    ...table.warnings,
    ...missingRequired.map(field => `Missing ${field}`)
  ];

  return {
    rowIndex,
    recordType,
    confidence,
    canonical,
    extra,
    warnings
  };
}

function parseCanonicalField(field: string, value: unknown) {
  if (numericCanonicalFields.has(field)) return parseSheetNumber(value);
  if (dateCanonicalFields.has(field)) return parseSheetDate(value);
  return cleanSheetText(value);
}

function toRecordType(sheetType: SheetType | 'unknown'): RecordType {
  if (sheetType === 'fanpage_config') return 'fanpage_config';
  if (sheetType === 'content_performance_matrix') return 'content_performance';
  if (sheetType === 'roas_summary_matrix') return 'roas_summary';
  if (sheetType === 'cldt_matrix') return 'unknown';
  if (sheetType === 'unknown') return 'unknown';
  return sheetType as RecordType;
}

function tableIssues(table: SheetTableModel): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  if (table.headerRowIndex < 0) {
    issues.push({ rowIndex: 0, severity: 'error', field: 'header', message: 'Could not detect header row', value: table.sheetName });
  }
  table.missingRequiredFields.forEach(field => {
    issues.push({ rowIndex: table.headerRowIndex, severity: 'error', field, message: `Missing required header ${field}`, value: table.sheetName });
  });
  return issues;
}

function shouldUseAiAssist(useAI: boolean | undefined, confidence: number) {
  if (useAI) return true;
  if (process.env.ETL_AI_NORMALIZE_ENABLED === 'true') return true;
  return process.env.ETL_AI_ASSIST_ON_LOW_CONFIDENCE === 'true' && confidence < 0.75;
}

function readNumberEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}
