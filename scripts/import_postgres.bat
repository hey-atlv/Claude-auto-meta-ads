@echo off
:: ============================================================
:: import_postgres.bat
:: Creates database and imports all CSV files into PostgreSQL
:: Run AFTER PostgreSQL is installed
:: ============================================================

SET PGBIN=C:\Program Files\PostgreSQL\17\bin
SET PGPASSWORD=postgres
SET DBNAME=auto_meta_ads
SET CSVDIR=%~dp0output
SET SCHEMA=%~dp0schema.sql

echo.
echo [1/4] Creating database "%DBNAME%"...
"%PGBIN%\psql" -U postgres -c "DROP DATABASE IF EXISTS %DBNAME%;" 2>nul
"%PGBIN%\psql" -U postgres -c "CREATE DATABASE %DBNAME% ENCODING 'UTF8';"
if %ERRORLEVEL% NEQ 0 (echo ERROR: Cannot connect to PostgreSQL. Is the service running? & pause & exit /b 1)

echo.
echo [2/4] Running schema.sql...
"%PGBIN%\psql" -U postgres -d %DBNAME% -f "%SCHEMA%"
if %ERRORLEVEL% NEQ 0 (echo ERROR: Schema creation failed & pause & exit /b 1)

echo.
echo [3/4] Importing CSV files...

echo   dim_accounts...
"%PGBIN%\psql" -U postgres -d %DBNAME% -c "\COPY dim_accounts(account_id,account_name,status,bm_name,company,partner,runner,bank,card_last4) FROM '%CSVDIR%\dim_accounts.csv' CSV HEADER ENCODING 'UTF8';"

echo   dim_fanpages...
"%PGBIN%\psql" -U postgres -d %DBNAME% -c "\COPY dim_fanpages(page_code,page_name,page_id,runner,source_code,page_type,geography,page_link,status,pancake,add_bm,removed_pan) FROM '%CSVDIR%\dim_fanpages.csv' CSV HEADER ENCODING 'UTF8';"

echo   dim_contents...
"%PGBIN%\psql" -U postgres -d %DBNAME% -c "\COPY dim_contents(content_id,content_name,link,team,brand,editor,media_post,design_post,production_team,content_producer,media_producer,production_date,sample_code,page,cgsd_name,rejuvenation_group,format,region,age_range,model) FROM '%CSVDIR%\dim_contents.csv' CSV HEADER ENCODING 'UTF8';"

echo   fact_ads (24K rows, may take a moment)...
SET PGCLIENTENCODING=UTF8
"%PGBIN%\psql" -U postgres -d %DBNAME% -c "\COPY fact_ads(date,account_id,account_name,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,content_id,page_code,geo_code,objective,channel,spend,impressions,reach,frequency,ctr,cpm,messages,cost_per_message,purchases,cost_per_purchase) FROM '%CSVDIR%\fact_ads.csv' CSV HEADER ENCODING 'UTF8';"

echo   summary_roas_monthly...
"%PGBIN%\psql" -U postgres -d %DBNAME% -c "\COPY summary_roas_monthly(report_month,start_date,end_date,channel,classification,personnel,geography,spend,data_count,data_price,roas_month,roas_3months) FROM '%CSVDIR%\summary_roas_monthly.csv' CSV HEADER ENCODING 'UTF8';"

echo   summary_content_perf...
"%PGBIN%\psql" -U postgres -d %DBNAME% -c "\COPY summary_content_perf(content_id,content_name,channel,classification,period,geography,spend,data_count,data_price,roas_month,roas_3months) FROM '%CSVDIR%\summary_content_perf.csv' CSV HEADER ENCODING 'UTF8';"

echo.
echo [4/4] Verifying row counts...
"%PGBIN%\psql" -U postgres -d %DBNAME% -c "SELECT 'dim_accounts' as tbl, COUNT(*) FROM dim_accounts UNION ALL SELECT 'dim_fanpages', COUNT(*) FROM dim_fanpages UNION ALL SELECT 'dim_contents', COUNT(*) FROM dim_contents UNION ALL SELECT 'fact_ads', COUNT(*) FROM fact_ads UNION ALL SELECT 'summary_roas_monthly', COUNT(*) FROM summary_roas_monthly UNION ALL SELECT 'summary_content_perf', COUNT(*) FROM summary_content_perf;"

echo.
echo ============================================================
echo DONE! Database "%DBNAME%" is ready.
echo Connect: psql -U postgres -d %DBNAME%
echo ============================================================
pause
