@echo off
echo Running Failure Tracking Migration...

set PGPASSWORD=%DB_PASSWORD%
if "%PGPASSWORD%"=="" set PGPASSWORD=.Joseph23

psql -h %DB_HOST% -U %DB_USERNAME% -d %DB_DATABASE% -f run-failure-tracking-migration.sql > logs\failure-tracking-migration-%date:~-4,4%%date:~-7,2%%date:~-10,2%-%time:~0,2%%time:~3,2%%time:~6,2%.log 2>&1

if %ERRORLEVEL% NEQ 0 (
  echo Migration failed with error code %ERRORLEVEL%. See logs for details.
  exit /b %ERRORLEVEL%
)

echo Migration completed successfully.
echo Results logged to logs directory.
