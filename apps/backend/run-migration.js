// apps/backend/run-migration.js
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

// Generate log filename with timestamp
const timestamp = new Date().toISOString().replace(/:/g, '-');
const logFile = path.join(logsDir, `migration-${timestamp}.log`);

// Open log file stream
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

// Log header
logStream.write(`==== MIGRATION RUN ${timestamp} ====\n\n`);
logStream.write(`Database: ${process.env.DB_DATABASE || 'solanahack'}\n`);
logStream.write(`Host: ${process.env.DB_HOST || 'localhost'}\n`);
logStream.write(`User: ${process.env.DB_USERNAME || 'postgres'}\n\n`);

// Run the migration command
console.log(`Running migration and logging to ${logFile}...`);
const command = spawn('npx', ['typeorm-ts-node-commonjs', 'migration:run', '-d', 'src/db/datasource.ts']);

// Log all output
command.stdout.on('data', (data) => {
  const output = data.toString();
  logStream.write(output);
  console.log(output);
});

command.stderr.on('data', (data) => {
  const output = data.toString();
  logStream.write(`ERROR: ${output}`);
  console.error(`ERROR: ${output}`);
});

command.on('close', (code) => {
  const message = `\nMigration completed with exit code: ${code}\n`;
  logStream.write(message);
  logStream.end();
  console.log(message);
  
  if (code === 0) {
    console.log(`✅ Migration successful. Log saved to ${logFile}`);
  } else {
    console.error(`❌ Migration failed with code ${code}. Check log at ${logFile} for details`);
  }
});
