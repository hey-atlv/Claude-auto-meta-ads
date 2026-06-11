# setup_postgres_once.ps1
# Chạy 1 lần duy nhất với quyền Admin:
#   Right-click → "Run with PowerShell" → chọn "Yes" khi hỏi
# Sau đó PostgreSQL tự khởi động mỗi lần bật máy.

param([string]$PgPassword = "postgres")

Write-Host "=== PostgreSQL One-Time Setup ===" -ForegroundColor Cyan

# 0. Re-generate CSV files from Excel
Write-Host "`n[0/3] Re-generating CSV files from Excel..." -ForegroundColor Yellow
& "C:\Program Files\nodejs\node.exe" "$scriptDir\process_excel.cjs"
if ($LASTEXITCODE -ne 0) { Write-Host "Warning: process_excel had errors, continuing..." -ForegroundColor Yellow }

# 1. Set service to auto-start
Write-Host "`n[1/3] Setting postgresql-x64-17 to auto-start..." -ForegroundColor Yellow
Set-Service -Name "postgresql-x64-17" -StartupType Automatic
Start-Service -Name "postgresql-x64-17"
Start-Sleep 3

$svc = Get-Service "postgresql-x64-17"
if ($svc.Status -eq "Running") {
    Write-Host "     PostgreSQL is RUNNING on port 5432" -ForegroundColor Green
} else {
    Write-Host "     ERROR: Service status = $($svc.Status)" -ForegroundColor Red
    exit 1
}

# 2. Create database and import
Write-Host "`n[2/3] Creating database and importing data..." -ForegroundColor Yellow
$env:PGPASSWORD = $PgPassword
$psql    = "C:\Program Files\PostgreSQL\17\bin\psql.exe"
$scriptDir = Split-Path $MyInvocation.MyCommand.Path

# Create DB
& $psql -U postgres -c "DROP DATABASE IF EXISTS auto_meta_ads;"
& $psql -U postgres -c "CREATE DATABASE auto_meta_ads ENCODING 'UTF8';"

# Run schema with UTF8 encoding
$env:PGCLIENTENCODING = "UTF8"
& $psql -U postgres -d auto_meta_ads -f "$scriptDir\schema.sql" 2>&1 | Where-Object { $_ -notmatch "^(NOTICE|psql:|--)" }

# Import CSVs
$csvDir = "$scriptDir\output"
$tables = @(
    @{table="dim_accounts";         file="dim_accounts";         cols="account_id,account_name,status,bm_name,company,partner,runner,bank,card_last4"},
    @{table="dim_fanpages_staging"; file="dim_fanpages";         cols="page_code,page_name,page_id,runner,source_code,page_type,geography,page_link,status,pancake,add_bm,removed_pan"},
    @{table="dim_contents";         file="dim_contents";         cols="content_id,content_name,link,team,brand,editor,media_post,design_post,production_team,content_producer,media_producer,production_date,sample_code,page,cgsd_name,rejuvenation_group,format,region,age_range,model"},
    @{table="fact_ads_staging";     file="fact_ads";             cols="date,account_id,account_name,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,content_id,page_code,geo_code,objective,channel,spend,impressions,reach,frequency,ctr,cpm,messages,cost_per_message,purchases,cost_per_purchase"},
    @{table="summary_roas_monthly"; file="summary_roas_monthly"; cols="report_month,start_date,end_date,channel,classification,personnel,geography,spend,data_count,data_price,roas_month,roas_3months"},
    @{table="summary_content_perf"; file="summary_content_perf"; cols="content_id,content_name,channel,classification,period,geography,spend,data_count,data_price,roas_month,roas_3months"}
)

foreach ($t in $tables) {
    $csvPath = "$csvDir\$($t.file).csv" -replace '\\','/'
    Write-Host "     Importing $($t.table) from $($t.file).csv..."
    & $psql -U postgres -d auto_meta_ads -c "\COPY $($t.table)($($t.cols)) FROM '$csvPath' CSV HEADER ENCODING 'UTF8';"
}

# Move staging → dim_fanpages, skip null page_code rows
Write-Host "`n  Cleaning dim_fanpages..."
& $psql -U postgres -d auto_meta_ads -c "INSERT INTO dim_fanpages (page_code,page_name,page_id,runner,source_code,page_type,geography,page_link,status,pancake,add_bm,removed_pan) SELECT LEFT(NULLIF(page_code,''),50),LEFT(NULLIF(page_name,''),300),LEFT(NULLIF(page_id,''),50),LEFT(NULLIF(runner,''),100),LEFT(NULLIF(source_code,''),500),LEFT(NULLIF(page_type,''),50),LEFT(NULLIF(geography,''),50),LEFT(NULLIF(page_link,''),500),LEFT(NULLIF(status,''),50),(pancake='TRUE' OR pancake='t'),(add_bm='TRUE' OR add_bm='t'),(removed_pan='TRUE' OR removed_pan='t') FROM dim_fanpages_staging WHERE page_code IS NOT NULL AND TRIM(page_code)!=''; DROP TABLE dim_fanpages_staging;"

# Move staging → fact_ads with truncation and type casting
Write-Host "`n  Moving staging data to fact_ads with cleanup..."
& $psql -U postgres -d auto_meta_ads -c @"
INSERT INTO fact_ads (date,account_id,account_name,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,content_id,page_code,geo_code,objective,channel,spend,impressions,reach,frequency,ctr,cpm,messages,cost_per_message,purchases,cost_per_purchase)
SELECT
  NULLIF(date,'')::date,
  LEFT(NULLIF(account_id,''),60),
  LEFT(NULLIF(account_name,''),200),
  LEFT(NULLIF(campaign_id,''),60),
  NULLIF(campaign_name,''),
  LEFT(NULLIF(adset_id,''),60),
  LEFT(NULLIF(adset_name,''),200),
  LEFT(NULLIF(ad_id,''),60),
  NULLIF(ad_name,''),
  LEFT(NULLIF(content_id,''),20),
  LEFT(NULLIF(page_code,''),50),
  LEFT(NULLIF(geo_code,''),10),
  LEFT(NULLIF(objective,''),50),
  LEFT(NULLIF(channel,''),10),
  NULLIF(spend,'')::bigint,
  NULLIF(impressions,'')::integer,
  NULLIF(reach,'')::integer,
  NULLIF(frequency,'')::decimal,
  NULLIF(ctr,'')::decimal,
  NULLIF(cpm,'')::decimal,
  NULLIF(messages,'')::integer,
  NULLIF(cost_per_message,'')::decimal,
  NULLIF(purchases,'')::integer,
  NULLIF(cost_per_purchase,'')::decimal
FROM fact_ads_staging
WHERE account_id IS NOT NULL AND account_id != '' AND date IS NOT NULL AND date != '';
DROP TABLE fact_ads_staging;
"@

# 3. Verify
Write-Host "`n[3/3] Row counts:" -ForegroundColor Yellow
& $psql -U postgres -d auto_meta_ads -c "SELECT 'dim_accounts' t, COUNT(*) n FROM dim_accounts UNION ALL SELECT 'dim_fanpages', COUNT(*) FROM dim_fanpages UNION ALL SELECT 'dim_contents', COUNT(*) FROM dim_contents UNION ALL SELECT 'fact_ads', COUNT(*) FROM fact_ads UNION ALL SELECT 'summary_roas_monthly', COUNT(*) FROM summary_roas_monthly UNION ALL SELECT 'summary_content_perf', COUNT(*) FROM summary_content_perf ORDER BY n DESC;"

Write-Host "`n=== DONE ===" -ForegroundColor Green
Write-Host "Connection string: postgresql://postgres:postgres@localhost:5432/auto_meta_ads" -ForegroundColor Cyan
Write-Host "psql shortcut: psql -U postgres -d auto_meta_ads" -ForegroundColor Cyan
Read-Host "`nNhấn Enter để đóng"
