@echo off
:: Chạy file này bằng cách click chuột phải → "Run as administrator"
echo Starting PostgreSQL 17 service...
net start postgresql-x64-17
if %ERRORLEVEL% EQU 0 (
    echo PostgreSQL started successfully!
) else (
    echo Already running or error. Check status:
    sc query postgresql-x64-17
)
echo.
echo Running data import...
call "%~dp0import_postgres.bat"
