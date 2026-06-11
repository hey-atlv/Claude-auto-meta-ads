# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Auto-Meta-Ads is a Meta (Facebook) Ads analytics dashboard for a Vietnamese marketing team. It tracks ad spend, ROAS, KPIs, and content performance across domestic (Nội Địa) and overseas Vietnamese (Việt Kiều) markets.

## Commands

```bash
# Development (runs Express + Vite in one process via tsx)
npm run dev

# Production build (Vite for frontend, esbuild for server)
npm run build

# Run production build
npm start

# Type check (no transpilation, just tsc --noEmit)
npm run lint

# Data pipeline (process Excel exports → inject into server cache)
npm run data:process   # scripts/process_excel.cjs
npm run data:inject    # scripts/inject_cache.cjs
npm run data:update    # both above in sequence
npm run data:watch     # watch mode for auto re-process
```

There are no automated tests. `npm run lint` (TypeScript check) is the only static validation step.

## Architecture

### Server (`server.ts`)
Express server that serves both the Vite-built frontend and API routes. In dev mode it spawns a Vite dev server internally. Key responsibilities:
- Proxies Google Sheets API calls to avoid exposing API keys in the browser (`/api/proxy-sheets`)
- Serves `server-cache/` JSON files as `/api/cached-data`
- Exposes PostgreSQL analytics endpoints under `/api/pg/*` (daily-summaries, roas-summary, content-performance, ads-data)
- Saves Google Sheets configs from client to server cache (`/api/save-configs`)
- Runs server-side sync jobs that pull from Google Sheets and write to Firestore + server-cache

### Data Flow

```
Google Sheets (source of truth)
    ↓ (via /api/proxy-sheets on the server)
Firestore (adsData, adAccounts, fanpages, roasSummary, kpiMonths, partners)
    ↓ (also written to)
server-cache/*.json  (flat JSON files for fast reads at startup)
    ↓
PostgreSQL fact_ads table  (optional, faster analytics layer)
    ↓
Express API (/api/cached-data, /api/pg/*)
    ↓
SheetsDataContext (React context — central data store for the UI)
    ↓
Pages and components
```

When PostgreSQL is available (`/api/pg/health` returns `ok: true`), the frontend prefers PG for analytics data. It falls back to server-cache JSON when PG is unavailable.

### Key Source Directories

| Path | Purpose |
|------|---------|
| `src/contexts/AuthContext.tsx` | Firebase Google Auth, role management (admin/user) |
| `src/contexts/SheetsDataContext.tsx` | Central data store — loads, filters, and deduplicates all ad rows |
| `src/lib/syncService.ts` | Client-side sync: reads Google Sheets via proxy, writes to Firestore in batches |
| `src/lib/serverSyncService.ts` | Server-side sync: reads Firestore, writes to server-cache JSON |
| `src/lib/campaignParser.ts` | Parses campaign name convention into structured fields |
| `src/lib/dateUtils.ts` | Date filtering utilities (all dates stored as `YYYY-MM-DD` strings) |
| `src/services/kpiService.ts` | CRUD for KPI month targets in Firestore |
| `src/services/etlService.ts` | ETL pipeline: transform raw sheet data → canonical format → Firestore/PG |

### Firestore Collections

| Collection | Contents |
|-----------|---------|
| `adsData` | Individual ad rows keyed by `{date}_{account_id}_{campaign_id}_{ad_id}` |
| `adAccounts` | Account metadata (partner name, ads operator, bank info) |
| `fanpages` | Facebook fanpage metadata |
| `roasSummary` | Monthly ROAS summaries by channel/classification/personnel |
| `kpiMonths` | Monthly KPI targets (budget, data count, bonus thresholds) |
| `partners` | Partner agencies with per-date fee rate history |
| `sheetsConfigs` | Google Sheets connection configs (spreadsheet IDs, API keys) |
| `users` | User profiles with `role: 'admin' | 'user'` |
| `system/sync_meta` | Sync status document — clients watch this to trigger data refresh |

## Project-Specific Conventions

### Campaign Name Format
Campaign names encode structured data:
```
{Brand} - {PageCode} - {Geography} - {PageType} - {ContentId} - {Objective}
```
Geography codes: `NN` = Việt Kiều (overseas), `TQ`/`MB`/`MN`/`MT` = Nội Địa (domestic). The parser at `src/lib/campaignParser.ts` extracts these; when geography is ambiguous it defaults to Nội Địa. When adding new geography codes, update `campaignParser.ts`.

### Personnel Name Normalization
`normalizePersonnelName()` in `SheetsDataContext.tsx` maps fuzzy account names to canonical Vietnamese staff names (e.g., anything containing "hiếu" → "Vũ Minh Hiếu"). When onboarding a new staff member, add a matching rule to this function.

### Actual Spend Calculation
Raw Meta spend is always adjusted before display:
```ts
actualSpend = Math.round(spend * (1 + VAT_FEE + partnerFeeRate + BANK_FEE))
// VAT_FEE = 0.10, BANK_FEE = 0.011, partnerFeeRate from Firestore partners collection
```
Partner fee rates are date-based — use `getFeeForDate()` to look up the correct rate for a given date.

### Date Handling — Critical
All dates are stored and compared as plain `YYYY-MM-DD` strings. String comparison (`>`, `<`) is used directly for filtering — this is intentional and correct. **Never use `toISOString()` for local date operations** — it converts to UTC and shifts dates in Vietnam's UTC+7 timezone. All incoming date formats (DD/MM/YYYY, YYYY.MM.DD, etc.) are normalized to `YYYY-MM-DD` on ingest.

### Firestore Quota Management
The sync code aggressively avoids unnecessary writes:
- Before writing, it fetches existing records and compares using `deterministicStringify` (JSON with sorted keys)
- Firestore batches are capped at 400 operations (`BATCH_SIZE = 400`)
- A 5-second cooldown (`SYNC_COOLDOWN`) prevents double-syncs
- After first full historical sync, `hasSyncedHistorical: true` is set on the sheet config so future syncs only process the last 40 days
- Firestore Quota errors must surface to the user with a clear message — never silently swallowed or retried

### Data Deduplication
In `SheetsDataContext`, rows are deduplicated by the key `{date}_{account_id}_{campaign_id}_{ad_id}`. When duplicates exist, the row with the higher `spend` value is kept.

### Sync Trigger Pattern
When a server-side sync completes, it updates `system/sync_meta.lastSyncedAt` in Firestore. All connected browser clients subscribe to this document via `onSnapshot` and automatically call `refreshData()` when it changes.

### Role-Based Access
- `lvahust@gmail.com` is hardcoded as always-admin in `AuthContext.tsx`
- Routes `kpi-management`, `usage`, and `settings` require `role === 'admin'`
- `ProtectedRoute` accepts a `requireAdmin` prop to enforce this

### AI Integration (Gemini)
`GeminiAdvisor.tsx` and ETL AI normalization use Google Gemini via `GEMINI_API_KEY`. The key is surfaced to the frontend via Vite's `define` block in `vite.config.ts`. Heavy AI calls (ETL normalization) should run server-side only.

## Environment Variables

The server reads from `.env`:
```
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
GEMINI_API_KEY=
PG_HOST=
PG_PORT=
PG_DATABASE=
PG_USER=
PG_PASSWORD=
```

Firebase client config is also read from `firebase-applet-config.json` at project root (required by Firebase Admin on the server).

## Iron Laws

1. **Never call Google Sheets API directly from the frontend.** All Sheets requests must route through `/api/proxy-sheets` so API keys stay server-side.

2. **Date strings only — no Date objects for storage or comparison.** Store and compare dates as `YYYY-MM-DD` strings. Never use `toISOString()` for local date operations.

3. **`actualSpend` is not `spend`.** Raw Meta spend must always be multiplied by `(1 + VAT + partnerFee + bankFee)` before showing to users. Use `getFeeForDate()` to resolve the partner fee for the correct date.

4. **Firestore writes are expensive — diff before writing.** Always compare deterministic JSON before deciding to write. Respect batch limits and cooldowns. When Firestore quota errors occur, propagate them to the user — do not retry silently.

5. **`system/sync_meta` is the sync trigger.** Updating `lastSyncedAt` on this document causes all connected clients to refresh their data. Any server-side sync job must write to this document when complete.
