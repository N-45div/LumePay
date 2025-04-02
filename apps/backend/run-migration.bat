@echo off
echo Running migration for scheduled_payments table...
echo Timestamp: %date% %time%

if not exist "logs" mkdir logs
set LOG_FILE=logs\migration-%date:~-4,4%%date:~-7,2%%date:~-10,2%-%time:~0,2%%time:~3,2%%time:~6,2%.log
set LOG_FILE=%LOG_FILE: =0%

echo Migration started at %date% %time% > %LOG_FILE%
echo. >> %LOG_FILE%

npx typeorm-ts-node-commonjs migration:run -d src/db/datasource.ts >> %LOG_FILE% 2>&1

echo. >> %LOG_FILE%
echo Migration completed at %date% %time% >> %LOG_FILE%

type %LOG_FILE%
echo.
echo Log saved to %LOG_FILE%
