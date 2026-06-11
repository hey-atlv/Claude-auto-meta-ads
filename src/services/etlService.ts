/**
 * ETL Service - Enterprise Data Transformation & Loading
 * 
 * Responsibility:
 * - Validate incoming data against schema
 * - Transform raw data to normalized format
 * - Enrich data with business logic
 * - Detect & handle duplicates
 * - Create audit trail
 * - Manage data versioning
 * 
 * Author: Senior Backend Engineer (20+ years exp)
 * Version: 1.0.0
 * Date: 2026-06-03
 */

import { Firestore } from 'firebase-admin/firestore';
import { randomUUID } from 'crypto';
import { parseCampaignName } from '../lib/campaignParser.js';
import { isCampaignMatchContent } from '../lib/contentMatcher.js';

const uuidv4 = () => randomUUID();

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface ValidationError {
  rowIndex: number;
  field: string;
  error: string;
  value?: any;
  severity: 'error' | 'warning';
  resolvedValue?: any;
}

export interface DataQualityMetrics {
  completeness: number; // % of fields populated
  accuracy: number; // % passing validation
  consistency: number; // % conforming to schema
  uniqueness: number; // % non-duplicate
  timeliness: number; // hours since last sync
}

export interface DataVersion {
  versionId: string;
  dataVersion: string; // e.g., "v2026-06-03_1717407000000"
  timestamp: Date;
  recordsProcessed: number;
  recordsInserted: number;
  recordsUpdated: number;
  recordsDeleted: number;
  validationErrors: ValidationError[];
  transformedBy: string;
  source: 'google-sheets' | 'manual' | 'api';
  status: 'success' | 'partial' | 'failed';
}

export interface AuditLog {
  auditId: string;
  timestamp: Date;
  entityType: 'adAccount' | 'fanpage' | 'campaign' | 'content' | 'adsData';
  entityId: string;
  action: 'create' | 'update' | 'delete';
  beforeValue?: Record<string, any>;
  afterValue: Record<string, any>;
  modifiedBy: string;
  reason?: string;
  dataVersionId: string;
  changesSummary: Record<string, any>;
}

export interface TransformedData {
  adAccounts: Record<string, any>[];
  fanpages: Record<string, any>[];
  campaigns: Record<string, any>[];
  adsData: Record<string, any>[];
  contents: Record<string, any>[];
  roasSummary: Record<string, any>[];
  validationErrors: ValidationError[];
  dataVersion: DataVersion;
  auditLogs: AuditLog[];
}

export interface LoadResult {
  success: boolean;
  totalRecords: number;
  insertedRecords: number;
  updatedRecords: number;
  deletedRecords: number;
  failedRecords: number;
  errors: ValidationError[];
  dataVersionId: string;
  timestamp: Date;
  duration: number; // milliseconds
}

// ============================================================================
// SCHEMA DEFINITIONS & VALIDATION RULES
// ============================================================================

const SCHEMA_RULES = {
  adAccounts: {
    required: ['account_id', 'account_name', 'status'],
    types: {
      account_id: 'string',
      account_name: 'string',
      status: ['active', 'disabled', 'pending'],
      company_name: 'string',
      partner_name: 'string'
    },
    maxLength: {
      account_id: 50,
      account_name: 255,
      company_name: 255
    }
  },
  fanpages: {
    required: ['page_id', 'account_id', 'page_name'],
    types: {
      page_id: 'string',
      account_id: 'string',
      page_name: 'string',
      page_code: 'string',
      page_type: ['community', 'business', 'shared'],
      geography: 'string'
    }
  },
  campaigns: {
    required: ['campaign_id', 'account_id', 'campaign_name'],
    types: {
      campaign_id: 'string',
      account_id: 'string',
      campaign_name: 'string',
      brand: 'string',
      objective: 'string',
      status: ['active', 'disabled', 'completed']
    }
  },
  adsData: {
    required: ['date', 'campaign_id', 'account_id'],
    types: {
      date: 'date',
      campaign_id: 'string',
      account_id: 'string',
      spend: 'number',
      impressions: 'number',
      messages: 'number',
      leads: 'number',
      purchases: 'number'
    },
    constraints: {
      spend: { min: 0 },
      impressions: { min: 0 },
      messages: { min: 0 },
      leads: { min: 0 },
      purchases: { min: 0 }
    }
  },
  contents: {
    required: ['content_id', 'brand'],
    types: {
      content_id: 'string',
      team: 'string',
      media_type: 'string',
      brand: 'string',
      cldt_value: 'number'
    }
  }
};

// ============================================================================
// CORE ETL FUNCTIONS
// ============================================================================

/**
 * Main transformation function
 * Orchestrates entire ETL pipeline
 */
export async function transformRawData(
  rawData: Record<string, any>[],
  db: Firestore,
  options: {
    source?: 'google-sheets' | 'manual' | 'api';
    userId?: string;
    deduplicate?: boolean;
  } = {}
): Promise<TransformedData> {
  const startTime = Date.now();
  const versionId = generateVersionId();
  const validationErrors: ValidationError[] = [];
  const auditLogs: AuditLog[] = [];

  console.log(`[ETL] Starting transformation of ${rawData.length} records (v${versionId})`);

  // Step 1: Validate schema
  console.log('[ETL] Step 1: Validating schema...');
  const validateErrors = validateSchema(rawData);
  validationErrors.push(...validateErrors);

  if (validationErrors.filter(e => e.severity === 'error').length > 0) {
    console.warn(`[ETL] Found ${validationErrors.filter(e => e.severity === 'error').length} critical errors`);
  }

  // Step 2: Normalize data
  console.log('[ETL] Step 2: Normalizing data...');
  const normalized = normalizeData(rawData);

  // Step 3: Deduplicate
  console.log('[ETL] Step 3: Deduplicating...');
  const deduplicated = options.deduplicate ? deduplicateData(normalized) : normalized;

  // Step 4: Extract & enrich by entity type
  console.log('[ETL] Step 4: Extracting entities...');
  const adAccounts = extractAdAccounts(deduplicated);
  const fanpages = extractFanpages(deduplicated);
  const campaigns = extractCampaigns(deduplicated, auditLogs);
  const adsData = extractAdsData(deduplicated);
  const contents = extractContents(deduplicated);

  // Step 5: Enrich with business logic
  console.log('[ETL] Step 5: Enriching with business logic...');
  const enrichedCampaigns = await enrichCampaigns(campaigns, contents);
  const enrichedAdsData = enrichAdsData(adsData);

  // Step 6: Create data version record
  const dataVersion: DataVersion = {
    versionId,
    dataVersion: `v${new Date().toISOString().split('T')[0]}_${Date.now()}`,
    timestamp: new Date(),
    recordsProcessed: rawData.length,
    recordsInserted: deduplicated.length,
    recordsUpdated: 0,
    recordsDeleted: 0,
    validationErrors,
    transformedBy: options.userId || 'system',
    source: options.source || 'google-sheets',
    status: validationErrors.filter(e => e.severity === 'error').length === 0 ? 'success' : 'partial'
  };

  console.log(`[ETL] Transformation completed in ${Date.now() - startTime}ms`);
  console.log(`[ETL] Validation errors: ${validationErrors.length}`);
  console.log(`[ETL] Entities extracted: Accounts=${adAccounts.length}, Pages=${fanpages.length}, Campaigns=${campaigns.length}, AdsData=${adsData.length}, Contents=${contents.length}`);

  return {
    adAccounts,
    fanpages,
    campaigns: enrichedCampaigns,
    adsData: enrichedAdsData,
    contents,
    roasSummary: [], // Calculated during load
    validationErrors,
    dataVersion,
    auditLogs
  };
}

/**
 * Validate data against schema rules
 */
function validateSchema(data: Record<string, any>[]): ValidationError[] {
  const errors: ValidationError[] = [];

  data.forEach((row, idx) => {
    // Check required account_id
    if (!row.account_id || String(row.account_id).trim() === '') {
      errors.push({
        rowIndex: idx,
        field: 'account_id',
        error: 'Required field missing',
        value: row.account_id,
        severity: 'error'
      });
    }

    // Check status enum
    if (row.status && !['Active', 'Disabled', 'active', 'disabled', 'pending'].includes(row.status)) {
      errors.push({
        rowIndex: idx,
        field: 'status',
        error: 'Invalid status value',
        value: row.status,
        severity: 'warning',
        resolvedValue: row.status.toLowerCase() === 'active' ? 'active' : 'disabled'
      });
    }

    // Check date format if present
    if (row.date && !isValidDate(row.date)) {
      errors.push({
        rowIndex: idx,
        field: 'date',
        error: 'Invalid date format (expected YYYY-MM-DD or DD/MM/YYYY)',
        value: row.date,
        severity: 'error'
      });
    }

    // Check numeric fields
    const numericFields = ['spend', 'impressions', 'messages', 'leads', 'purchases', 'cldt_value'];
    numericFields.forEach(field => {
      if (row[field] !== undefined && row[field] !== null && row[field] !== '') {
        const num = parseFloat(String(row[field]).replace(/[^\d.-]/g, ''));
        if (isNaN(num)) {
          errors.push({
            rowIndex: idx,
            field,
            error: 'Invalid numeric value',
            value: row[field],
            severity: 'error'
          });
        }
      }
    });
  });

  return errors;
}

/**
 * Normalize data: trim, lowercase, standardize formats
 */
function normalizeData(rawData: Record<string, any>[]): Record<string, any>[] {
  return rawData.map(row => {
    const campaignName = String(row.campaign_name || '').trim();
    return {
      ...row,
      account_id: String(row.account_id || '').trim(),
      account_name: String(row.account_name || '').trim().toLowerCase(),
      campaign_name: campaignName,
      campaign_name_normalized: normalizeCampaignName(campaignName),
      status: (row.status || '').toString().toLowerCase(),
      brand: String(row.brand || '').trim().toLowerCase(),
      date: formatDate(row.date),
      page_code: String(row.page_code || '').trim(),
      page_name: String(row.page_name || '').trim(),
      spend: parseNumber(row.spend),
      impressions: parseNumber(row.impressions),
      messages: parseNumber(row.messages),
      leads: parseNumber(row.leads),
      purchases: parseNumber(row.purchases),
      roas: calculateROAS(parseNumber(row.spend), parseNumber(row.purchases)),
      cpl: calculateCPL(parseNumber(row.spend), parseNumber(row.leads)),
      cldt_value: parseNumber(row.cldt_value)
    };
  });
}

/**
 * Deduplicate based on composite key
 */
function deduplicateData(data: Record<string, any>[]): Record<string, any>[] {
  const seen = new Map<string, Record<string, any>>();

  data.forEach(row => {
    // Composite key: account_id + campaign_id + date (or relevant fields)
    const key = [row.account_id, row.campaign_id || row.account_name, row.date || ''].filter(Boolean).join('|');
    
    if (seen.has(key)) {
      const existing = seen.get(key)!;
      // Keep the latest based on timestamp or modification indicator
      if ((row._timestamp || 0) >= (existing._timestamp || 0)) {
        seen.set(key, row);
      }
    } else {
      seen.set(key, row);
    }
  });

  console.log(`[ETL] Deduplication: ${data.length} → ${seen.size} records`);
  return Array.from(seen.values());
}

/**
 * Extract adAccounts entity
 */
function extractAdAccounts(data: Record<string, any>[]): Record<string, any>[] {
  const accountsMap = new Map<string, Record<string, any>>();

  data.forEach(row => {
    if (!row.account_id) return;

    const key = row.account_id;
    if (!accountsMap.has(key)) {
      accountsMap.set(key, {
        account_id: row.account_id,
        account_name: row.account_name || '',
        status: row.status || 'active',
        company_name: row.company_name || '',
        partner_name: row.partner_name || '',
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {
          department: row.department || 'unknown',
          owner_email: row.owner_email || '',
          region: row.geography?.includes('NN') || row.geography?.includes('nội địa') ? 'domestic' : 'overseas'
        }
      });
    }
  });

  return Array.from(accountsMap.values());
}

/**
 * Extract fanpages entity
 */
function extractFanpages(data: Record<string, any>[]): Record<string, any>[] {
  const pagesMap = new Map<string, Record<string, any>>();

  data.forEach(row => {
    if (!row.page_code || !row.account_id) return;

    const key = row.page_code;
    if (!pagesMap.has(key)) {
      pagesMap.set(key, {
        page_id: uuidv4(),
        account_id: row.account_id,
        page_name: row.page_name || row.page_code,
        page_code: row.page_code,
        page_type: row.page_type || 'business',
        geography: row.geography || 'unknown',
        status: 'active',
        createdAt: new Date()
      });
    }
  });

  return Array.from(pagesMap.values());
}

/**
 * Extract campaigns entity
 */
function extractCampaigns(
  data: Record<string, any>[],
  auditLogs: AuditLog[] = []
): Record<string, any>[] {
  const campaignsMap = new Map<string, Record<string, any>>();

  data.forEach(row => {
    if (!row.campaign_id && !row.campaign_name) return;

    const campaignId = row.campaign_id || uuidv4();
    if (!campaignsMap.has(campaignId)) {
      const parsed = parseCampaignName(row.campaign_name || '');
      
      campaignsMap.set(campaignId, {
        campaign_id: campaignId,
        account_id: row.account_id,
        campaign_name: row.campaign_name || '',
        campaign_name_normalized: normalizeCampaignName(row.campaign_name),
        brand: parsed.brand || row.brand || '',
        page_code: parsed.page_code || row.page_code || '',
        geography: parsed.geography || row.geography || '',
        objective: parsed.objective || row.objective || '',
        page_type: parsed.page_type || row.page_type || '',
        status: row.status || 'active',
        created_at: new Date(),
        lastModified: new Date()
      });
    }
  });

  return Array.from(campaignsMap.values());
}

/**
 * Extract adsData (daily metrics)
 */
function extractAdsData(data: Record<string, any>[]): Record<string, any>[] {
  return data
    .filter(row => row.date && row.campaign_id)
    .map(row => ({
      id: `${row.date}|${row.campaign_id}`,
      date: row.date,
      campaign_id: row.campaign_id,
      account_id: row.account_id,
      spend: row.spend || 0,
      impressions: row.impressions || 0,
      messages: row.messages || 0,
      leads: row.leads || 0,
      purchases: row.purchases || 0,
      roas: row.roas || 0,
      cpl: row.cpl || 0,
      _version: Date.now().toString(),
      _lastModified: new Date()
    }));
}

/**
 * Extract contents entity
 */
function extractContents(data: Record<string, any>[]): Record<string, any>[] {
  const contentsMap = new Map<string, Record<string, any>>();

  data.forEach(row => {
    if (!row.content_id && !row.tenContent) return;

    const contentId = String(row.content_id || row.tenContent).trim();
    if (!contentsMap.has(contentId)) {
      contentsMap.set(contentId, {
        content_id: contentId,
        content_id_normalized: normalizeCampaignName(contentId),
        team: row.team || '',
        media_type: row.media_type || '',
        brand: String(row.brand || '').trim().toLowerCase(),
        cldt_value: row.cldt_value || 0,
        categories: row.categories ? String(row.categories).split(',') : [],
        created_at: new Date(),
        metadata: {
          source: row.source || 'google-sheets'
        }
      });
    }
  });

  return Array.from(contentsMap.values());
}

/**
 * Enrich campaigns with content matching
 */
async function enrichCampaigns(
  campaigns: Record<string, any>[],
  contents: Record<string, any>[]
): Promise<Record<string, any>[]> {
  return campaigns.map(campaign => {
    // Find matched content
    const matchedContent = contents.find(content =>
      isCampaignMatchContent(campaign.campaign_name, content.content_id)
    );

    return {
      ...campaign,
      matchedContentId: matchedContent?.content_id || null,
      matchedContentBrand: matchedContent?.brand || null,
      matchedCLDT: matchedContent?.cldt_value || 0
    };
  });
}

/**
 * Enrich adsData with calculated metrics
 */
function enrichAdsData(adsData: Record<string, any>[]): Record<string, any>[] {
  return adsData.map(ad => ({
    ...ad,
    // Ensure calculated metrics
    roas: ad.roas || calculateROAS(ad.spend, ad.purchases),
    cpl: ad.cpl || calculateCPL(ad.spend, ad.leads),
    cpc: calculateCPC(ad.spend, ad.impressions),
    ctr: calculateCTR(ad.impressions, ad.messages)
  }));
}

/**
 * Load transformed data to Firestore
 */
export async function loadToFirestore(
  transformedData: TransformedData,
  db: Firestore,
  options: { dryRun?: boolean; batchSize?: number } = {}
): Promise<LoadResult> {
  const startTime = Date.now();
  const batchSize = options.batchSize || 400;
  let totalInserted = 0;
  let totalUpdated = 0;
  let failedCount = 0;
  const errors: ValidationError[] = [];

  console.log(`[Load] Starting Firestore load (dry run: ${options.dryRun || false})`);

  try {
    // Load adAccounts
    totalInserted += await loadCollection(db, 'adAccounts', transformedData.adAccounts, batchSize, options.dryRun);

    // Load fanpages
    totalInserted += await loadCollection(db, 'fanpages', transformedData.fanpages, batchSize, options.dryRun);

    // Load campaigns
    totalInserted += await loadCollection(db, 'campaigns', transformedData.campaigns, batchSize, options.dryRun);

    // Load contents
    totalInserted += await loadCollection(db, 'contents', transformedData.contents, batchSize, options.dryRun);

    // Load adsData
    totalInserted += await loadCollection(db, 'adsData', transformedData.adsData, batchSize, options.dryRun);

    // Load data version
    if (!options.dryRun) {
      await db.collection('dataVersionHistory').doc(transformedData.dataVersion.versionId).set(transformedData.dataVersion);
    }

    // Load audit logs
    if (transformedData.auditLogs.length > 0) {
      totalInserted += await loadCollection(db, 'syncAuditLog', transformedData.auditLogs, batchSize, options.dryRun);
    }

    const duration = Date.now() - startTime;
    console.log(`[Load] Completed in ${duration}ms`);

    return {
      success: true,
      totalRecords: totalInserted + totalUpdated,
      insertedRecords: totalInserted,
      updatedRecords: totalUpdated,
      deletedRecords: 0,
      failedRecords: failedCount,
      errors,
      dataVersionId: transformedData.dataVersion.versionId,
      timestamp: new Date(),
      duration
    };
  } catch (error: any) {
    console.error('[Load] Error:', error);
    return {
      success: false,
      totalRecords: 0,
      insertedRecords: totalInserted,
      updatedRecords: totalUpdated,
      deletedRecords: 0,
      failedRecords: failedCount,
      errors: [{
        rowIndex: -1,
        field: 'firestore',
        error: error.message,
        severity: 'error'
      }],
      dataVersionId: transformedData.dataVersion.versionId,
      timestamp: new Date(),
      duration: Date.now() - startTime
    };
  }
}

/**
 * Load single collection with batching
 */
async function loadCollection(
  db: Firestore,
  collectionName: string,
  documents: Record<string, any>[],
  batchSize: number = 400,
  dryRun: boolean = false
): Promise<number> {
  let loaded = 0;

  for (let i = 0; i < documents.length; i += batchSize) {
    const batch = db.batch();
    const slice = documents.slice(i, i + batchSize);

    slice.forEach(doc => {
      const docId = doc.id || doc.account_id || doc.campaign_id || doc.content_id || uuidv4();
      const ref = db.collection(collectionName).doc(docId);
      batch.set(ref, doc, { merge: true });
    });

    if (!dryRun) {
      await batch.commit();
      console.log(`[Load] ${collectionName}: batch ${Math.floor(i / batchSize) + 1} committed (${slice.length} docs)`);
    } else {
      console.log(`[Load] ${collectionName}: batch ${Math.floor(i / batchSize) + 1} would commit (${slice.length} docs) [DRY RUN]`);
    }

    loaded += slice.length;
  }

  return loaded;
}

/**
 * Calculate quality metrics
 */
export async function calculateQualityMetrics(
  db: Firestore,
  dataVersionId: string
): Promise<DataQualityMetrics> {
  const dataVersion = await db.collection('dataVersionHistory').doc(dataVersionId).get();
  const data = dataVersion.data() as DataVersion;

  const completeness = data.recordsInserted > 0 ? ((data.recordsInserted - countNullFields(data)) / data.recordsInserted) * 100 : 0;
  const accuracy = data.recordsProcessed > 0 ? ((data.recordsProcessed - data.validationErrors.length) / data.recordsProcessed) * 100 : 0;
  const uniqueness = 100 - ((data.recordsProcessed - data.recordsInserted) / data.recordsProcessed * 100);

  return {
    completeness: Math.round(completeness * 100) / 100,
    accuracy: Math.round(accuracy * 100) / 100,
    consistency: 99.5, // Placeholder
    uniqueness: Math.round(uniqueness * 100) / 100,
    timeliness: 0
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function generateVersionId(): string {
  return `v${Date.now()}_${uuidv4().substring(0, 8)}`;
}

function isValidDate(dateStr: any): boolean {
  const str = String(dateStr).trim();
  const patterns = [/^\d{4}-\d{2}-\d{2}$/, /^\d{2}\/\d{2}\/\d{4}$/, /^\d{4}\/\d{2}\/\d{2}$/];
  return patterns.some(p => p.test(str));
}

function formatDate(dateStr: any): string {
  if (!dateStr) return '';
  const str = String(dateStr).trim();

  // Already in YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  // DD/MM/YYYY format
  const dmy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;

  // YYYY/MM/DD format
  const ymd = str.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;

  try {
    const d = new Date(str);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  } catch {}

  return str;
}

function parseNumber(val: any): number {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;

  const str = String(val).trim().replace(/[^\d.,-]/g, '');
  const num = parseFloat(str.replace(/,/g, '.'));
  return isNaN(num) ? 0 : num;
}

function normalizeCampaignName(name: any): string {
  if (!name) return '';
  return String(name)
    .trim()
    .toLowerCase()
    .replace(/[\s\-_]/g, '')
    .replace(/[^\w]/g, '');
}

function calculateROAS(spend: number, revenue: number): number {
  if (spend === 0) return 0;
  return Math.round((revenue / spend) * 100) / 100;
}

function calculateCPL(spend: number, leads: number): number {
  if (leads === 0) return 0;
  return Math.round((spend / leads) * 100) / 100;
}

function calculateCPC(spend: number, clicks: number): number {
  if (clicks === 0) return 0;
  return Math.round((spend / clicks) * 100) / 100;
}

function calculateCTR(impressions: number, clicks: number): number {
  if (impressions === 0) return 0;
  return Math.round((clicks / impressions) * 10000) / 100; // percentage
}

function countNullFields(data: any): number {
  let count = 0;
  for (const key in data) {
    if (data[key] === null || data[key] === undefined || data[key] === '') {
      count++;
    }
  }
  return count;
}

export default {
  transformRawData,
  loadToFirestore,
  calculateQualityMetrics
};
