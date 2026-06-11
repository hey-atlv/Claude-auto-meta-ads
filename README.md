# Auto Meta Ads

React, TypeScript, Firebase, Express app for Meta Ads reporting, Google Sheets sync, and AI-assisted data normalization.

## Main Features

- Dashboard KPI reporting for spend, messages, purchases, CPA, ROAS, and market/personnel filters.
- Google Sheets sync for ads data, account config, fanpages, content master, content performance, ROAS summary, and CLDT matrices.
- Hybrid input normalization with schema aliases, table detection, quality gate, and optional AI assist.
- Firebase Auth and Firestore-backed access control.
- Server cache support for faster local and production reads.

## Quick Start

```bash
npm install
npm run dev
```

Development URLs:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3000`

Build production bundle:

```bash
npm run build
npm start
```

## Environment

Copy `.env.example` and fill the Firebase, Google Sheets, and AI keys needed for your environment.

```bash
cp .env.example .env
```

Important variables:

- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_API_KEY`
- `GOOGLE_SHEETS_API_KEY`
- `GEMINI_API_KEY` or `GOOGLE_GENERATIVE_AI_API_KEY`
- `ETL_NORMALIZE_BEFORE_TRANSFORM`
- `ETL_AI_NORMALIZE_ENABLED`

## Data Documents Kept

- `docs/google_sheets_schema.md`: Google Sheets data model and expected tabs.
- `docs/Architecture_Auto_Meta_Ads_System.md`: Current system architecture notes.
- `.env.example`: Safe environment variable reference.

## Verification

Use these checks before packaging or deployment:

```bash
npx tsc --noEmit --noImplicitAny --pretty false
npm run lint
npm run build
```

## Notes

- Do not commit `.env`, service account JSON files, logs, `dist`, `node_modules`, or `server-cache`.
- Firestore rules are in `firestore.rules`.
- The content matching rule in `src/lib/contentMatcher.ts` should stay unchanged unless the admin explicitly approves a logic change.
