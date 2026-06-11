-- Auto Meta Ads Analytics - PostgreSQL Schema

-- Drop tables in reverse dependency order
DROP VIEW IF EXISTS v_daily_kpis CASCADE;
DROP VIEW IF EXISTS v_content_performance CASCADE;
DROP VIEW IF EXISTS v_personnel_roas CASCADE;
DROP TABLE IF EXISTS fact_ads CASCADE;
DROP TABLE IF EXISTS fact_ads_staging CASCADE;
DROP TABLE IF EXISTS summary_content_perf CASCADE;
DROP TABLE IF EXISTS summary_roas_monthly CASCADE;
DROP TABLE IF EXISTS dim_contents CASCADE;
DROP TABLE IF EXISTS dim_fanpages CASCADE;
DROP TABLE IF EXISTS dim_accounts CASCADE;

CREATE TABLE dim_accounts (
  account_id    VARCHAR(60)  PRIMARY KEY,
  account_name  VARCHAR(200),
  status        VARCHAR(50),
  bm_name       VARCHAR(200),
  company       VARCHAR(100),
  partner       VARCHAR(100),
  runner        VARCHAR(100),
  bank          VARCHAR(50),
  card_last4    VARCHAR(10),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE dim_fanpages (
  page_code     VARCHAR(50)  PRIMARY KEY,
  page_name     VARCHAR(300),
  page_id       VARCHAR(50),
  runner        VARCHAR(100),
  source_code   VARCHAR(500),
  page_type     VARCHAR(50),
  geography     VARCHAR(50),
  page_link     VARCHAR(500),
  status        VARCHAR(50),
  pancake       BOOLEAN DEFAULT false,
  add_bm        BOOLEAN DEFAULT false,
  removed_pan   BOOLEAN DEFAULT false,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE dim_contents (
  content_id          VARCHAR(20)  PRIMARY KEY,
  content_name        TEXT,
  production_date     DATE,
  team                VARCHAR(100),
  brand               VARCHAR(20),
  editor              VARCHAR(100),
  media_post          VARCHAR(100),
  design_post         VARCHAR(100),
  production_team     VARCHAR(100),
  content_producer    VARCHAR(100),
  media_producer      VARCHAR(100),
  sample_code         VARCHAR(100),
  page                VARCHAR(100),
  cgsd_name           VARCHAR(100),
  rejuvenation_group  VARCHAR(100),
  format              VARCHAR(50),
  region              VARCHAR(50),
  age_range           VARCHAR(50),
  model               VARCHAR(100),
  link                TEXT,
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE fact_ads (
  id                  BIGSERIAL    PRIMARY KEY,
  date                DATE         NOT NULL,
  account_id          VARCHAR(60),
  account_name        VARCHAR(200),
  campaign_id         VARCHAR(60)  NOT NULL,
  campaign_name       TEXT,
  adset_id            VARCHAR(60),
  adset_name          VARCHAR(200),
  ad_id               VARCHAR(60),
  ad_name             TEXT,
  content_id          VARCHAR(20),
  page_code           TEXT,
  geo_code            TEXT,
  objective           TEXT,
  channel             TEXT,
  spend               BIGINT,
  impressions         INTEGER,
  reach               INTEGER,
  frequency           DECIMAL(10,4),
  ctr                 DECIMAL(10,6),
  cpm                 DECIMAL(15,2),
  messages            INTEGER,
  cost_per_message    DECIMAL(15,2),
  purchases           INTEGER,
  cost_per_purchase   DECIMAL(15,2),
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Staging table for dim_fanpages
CREATE TABLE dim_fanpages_staging (
  page_code TEXT, page_name TEXT, page_id TEXT, runner TEXT, source_code TEXT,
  page_type TEXT, geography TEXT, page_link TEXT, status TEXT,
  pancake TEXT, add_bm TEXT, removed_pan TEXT
);

-- Staging table for bulk load (all TEXT, no constraints)
CREATE TABLE fact_ads_staging (
  date TEXT, account_id TEXT, account_name TEXT, campaign_id TEXT,
  campaign_name TEXT, adset_id TEXT, adset_name TEXT, ad_id TEXT, ad_name TEXT,
  content_id TEXT, page_code TEXT, geo_code TEXT, objective TEXT, channel TEXT,
  spend TEXT, impressions TEXT, reach TEXT, frequency TEXT, ctr TEXT, cpm TEXT,
  messages TEXT, cost_per_message TEXT, purchases TEXT, cost_per_purchase TEXT
);

CREATE INDEX idx_fact_ads_date         ON fact_ads(date);
CREATE INDEX idx_fact_ads_account      ON fact_ads(account_id);
CREATE INDEX idx_fact_ads_content      ON fact_ads(content_id);
CREATE INDEX idx_fact_ads_page_code    ON fact_ads(page_code);
CREATE INDEX idx_fact_ads_geo          ON fact_ads(geo_code);
CREATE INDEX idx_fact_ads_date_account ON fact_ads(date, account_id);

CREATE TABLE summary_roas_monthly (
  id              SERIAL PRIMARY KEY,
  report_month    VARCHAR(50),
  start_date      DATE,
  end_date        DATE,
  channel         VARCHAR(50),
  classification  VARCHAR(100),
  personnel       VARCHAR(100),
  geography       VARCHAR(20),
  spend           NUMERIC(20,2),
  data_count      INTEGER,
  data_price      NUMERIC(15,2),
  roas_month      DECIMAL(10,6),
  roas_3months    DECIMAL(10,6),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (report_month, channel, classification, personnel, geography)
);

CREATE TABLE summary_content_perf (
  id              SERIAL PRIMARY KEY,
  content_id      VARCHAR(20),
  content_name    TEXT,
  channel         VARCHAR(50),
  classification  VARCHAR(100),
  period          VARCHAR(20),
  geography       VARCHAR(20),
  spend           NUMERIC(20,2),
  data_count      INTEGER,
  data_price      NUMERIC(15,2),
  roas_month      DECIMAL(10,6),
  roas_3months    DECIMAL(10,6),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (content_id, channel, classification, period, geography)
);

CREATE INDEX idx_roas_monthly_personnel ON summary_roas_monthly(personnel);
CREATE INDEX idx_content_perf_id        ON summary_content_perf(content_id);
CREATE INDEX idx_content_perf_period    ON summary_content_perf(period);

CREATE VIEW v_daily_kpis AS
SELECT
  date,
  geo_code,
  SUM(spend)      AS total_spend,
  SUM(messages)   AS total_messages,
  SUM(purchases)  AS total_purchases,
  ROUND(SUM(spend)::numeric / NULLIF(SUM(messages),0), 0) AS avg_cost_per_message,
  ROUND(SUM(spend)::numeric / NULLIF(SUM(purchases),0), 0) AS avg_cpa,
  COUNT(DISTINCT account_id) AS active_accounts
FROM fact_ads
GROUP BY date, geo_code;

CREATE VIEW v_content_performance AS
SELECT
  cp.content_id,
  cp.content_name,
  dc.cgsd_name,
  dc.format,
  dc.brand,
  dc.production_date,
  cp.period,
  cp.geography,
  cp.spend,
  cp.data_count,
  cp.data_price,
  cp.roas_month,
  cp.roas_3months
FROM summary_content_perf cp
LEFT JOIN dim_contents dc ON dc.content_id = cp.content_id;

CREATE VIEW v_personnel_roas AS
SELECT
  report_month,
  personnel,
  channel,
  geography,
  spend,
  data_count,
  roas_month,
  roas_3months
FROM summary_roas_monthly
ORDER BY report_month DESC, personnel;
