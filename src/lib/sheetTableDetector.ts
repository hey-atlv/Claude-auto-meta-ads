import {
  getSheetContract,
  inferExpectedSheetType,
  normalizeSheetKey,
  sheetContracts,
  type SheetSchemaContract,
  type SheetType
} from './sheetSchemaRegistry.js';

export interface SheetTableRow {
  rowIndex: number;
  cells: unknown[];
  raw: Record<string, unknown>;
}

export interface SheetTableModel {
  spreadsheetId: string;
  sheetName: string;
  sourceName: string;
  detectedType: SheetType | 'unknown';
  headerRowIndex: number;
  headers: string[];
  rows: SheetTableRow[];
  mapping: Record<string, string>;
  fieldIndexes: Record<string, number>;
  unknownHeaders: string[];
  missingRequiredFields: string[];
  confidence: number;
  warnings: string[];
}

type HeaderCandidate = {
  contract: SheetSchemaContract;
  rowIndex: number;
  headers: string[];
  mapping: Record<string, string>;
  fieldIndexes: Record<string, number>;
  score: number;
  requiredHits: number;
};

export function detectSheetTable(input: {
  spreadsheetId: string;
  sheetName: string;
  sourceName?: string;
  values: unknown[][];
  expectedType?: SheetType;
}): SheetTableModel {
  const values = Array.isArray(input.values) ? input.values : [];
  const sourceName = input.sourceName || '';
  const expectedType = input.expectedType || inferExpectedSheetType(sourceName, input.sheetName);
  const contracts = expectedType
    ? [getSheetContract(expectedType)].filter(Boolean) as SheetSchemaContract[]
    : sheetContracts;

  const candidates: HeaderCandidate[] = [];
  const maxRowsToScan = Math.min(values.length, 12);
  for (let rowIndex = 0; rowIndex < maxRowsToScan; rowIndex++) {
    const row = values[rowIndex] || [];
    const headers = row.map((cell, index) => cleanHeader(cell, index));
    if (headers.filter(Boolean).length < 2) continue;

    for (const contract of contracts) {
      const mapped = mapHeaders(headers, contract);
      const requiredHits = contract.requiredFields.filter(field => mapped.fieldIndexes[field] !== undefined).length;
      const totalHits = Object.keys(mapped.fieldIndexes).length;
      const requiredRatio = contract.requiredFields.length > 0 ? requiredHits / contract.requiredFields.length : 1;
      const score = totalHits + requiredRatio * 4 + (expectedType === contract.sheetType ? 1.5 : 0);
      if (totalHits >= contract.minHeaderMatches || requiredHits > 0) {
        candidates.push({
          contract,
          rowIndex,
          headers,
          mapping: mapped.mapping,
          fieldIndexes: mapped.fieldIndexes,
          score,
          requiredHits
        });
      }
    }
  }

  const best = candidates.sort((a, b) => b.score - a.score)[0];
  if (!best) {
    return emptyTable(input.spreadsheetId, input.sheetName, sourceName, expectedType || 'unknown', values);
  }

  const missingRequiredFields = best.contract.requiredFields.filter(field => best.fieldIndexes[field] === undefined);
  const tableRows = materializeRows(values, best.headers, best.rowIndex + 1, best.contract);
  const unknownHeaders = best.headers.filter((header, index) => header && !Object.values(best.fieldIndexes).includes(index));
  const requiredRatio = best.contract.requiredFields.length > 0
    ? (best.contract.requiredFields.length - missingRequiredFields.length) / best.contract.requiredFields.length
    : 1;
  const confidence = Math.max(0.1, Math.min(0.99, 0.35 + requiredRatio * 0.45 + Math.min(Object.keys(best.fieldIndexes).length / 12, 0.19)));
  const warnings = missingRequiredFields.length > 0
    ? [`Missing required fields: ${missingRequiredFields.join(', ')}`]
    : [];

  return {
    spreadsheetId: input.spreadsheetId,
    sheetName: input.sheetName,
    sourceName,
    detectedType: best.contract.sheetType,
    headerRowIndex: best.rowIndex,
    headers: best.headers,
    rows: tableRows,
    mapping: best.mapping,
    fieldIndexes: best.fieldIndexes,
    unknownHeaders,
    missingRequiredFields,
    confidence,
    warnings
  };
}

function emptyTable(spreadsheetId: string, sheetName: string, sourceName: string, sheetType: SheetType | 'unknown', values: unknown[][]): SheetTableModel {
  return {
    spreadsheetId,
    sheetName,
    sourceName,
    detectedType: sheetType,
    headerRowIndex: -1,
    headers: [],
    rows: values.map((cells, index) => ({ rowIndex: index, cells: Array.isArray(cells) ? cells : [], raw: {} })),
    mapping: {},
    fieldIndexes: {},
    unknownHeaders: [],
    missingRequiredFields: [],
    confidence: 0,
    warnings: ['Could not detect a usable header row.']
  };
}

function cleanHeader(cell: unknown, index: number) {
  const text = String(cell || '').trim();
  return text || `column_${index + 1}`;
}

function mapHeaders(headers: string[], contract: SheetSchemaContract) {
  const mapping: Record<string, string> = {};
  const fieldIndexes: Record<string, number> = {};
  const aliasLookup = new Map<string, string>();

  Object.entries(contract.headerAliases).forEach(([field, aliases]) => {
    aliasLookup.set(normalizeSheetKey(field), field);
    aliases.forEach(alias => aliasLookup.set(normalizeSheetKey(alias), field));
  });

  headers.forEach((header, index) => {
    const key = normalizeSheetKey(header);
    let field = aliasLookup.get(key);
    if (!field) {
      field = findIncludesAlias(key, aliasLookup);
    }
    if (field && fieldIndexes[field] === undefined) {
      fieldIndexes[field] = index;
      mapping[field] = header;
    }
  });

  return { mapping, fieldIndexes };
}

function findIncludesAlias(headerKey: string, aliasLookup: Map<string, string>) {
  if (!headerKey) return undefined;
  for (const [alias, field] of aliasLookup.entries()) {
    if (alias && (headerKey.includes(alias) || alias.includes(headerKey))) {
      return field;
    }
  }
  return undefined;
}

function materializeRows(values: unknown[][], headers: string[], startRow: number, contract: SheetSchemaContract): SheetTableRow[] {
  const rows: SheetTableRow[] = [];
  for (let rowIndex = startRow; rowIndex < values.length; rowIndex++) {
    const cells = Array.isArray(values[rowIndex]) ? values[rowIndex] : [];
    if (isSkippableRow(cells, contract)) continue;
    const raw: Record<string, unknown> = {};
    headers.forEach((header, cellIndex) => {
      raw[header] = cells[cellIndex] ?? null;
    });
    rows.push({ rowIndex, cells, raw });
  }
  return rows;
}

function isSkippableRow(cells: unknown[], contract: SheetSchemaContract) {
  const filled = cells.filter(cell => String(cell || '').trim() !== '');
  if (filled.length === 0) return true;
  if (contract.sheetType === 'content_master' && filled.length === 1 && !/^\d+$/.test(String(filled[0]))) return true;
  if ((contract.sheetType === 'content_performance_matrix' || contract.sheetType === 'roas_summary_matrix') && filled.length <= 2) return true;
  return false;
}
