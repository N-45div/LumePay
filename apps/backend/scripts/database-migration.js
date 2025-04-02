const { spawn } = require('child_process');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const command = process.argv[2];
const validCommands = ['generate', 'run', 'revert', 'create', 'show'];
if (!command || !validCommands.includes(command)) {
  console.error(`
    Invalid command. Usage:
    npm run migration:generate -- <name>  - Generate a migration from entity changes
    npm run migration:run                 - Run all pending migrations
    npm run migration:revert              - Revert the last migration
    npm run migration:create -- <name>    - Create a new empty migration
    npm run migration:show                - Show all migrations and their status
  `);
  process.exit(1);
}
const env = {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV || 'development',
};
let typeormArgs = [];
const basePath = path.resolve(__dirname, '..');
switch (command) {
  case 'generate':
    const genName = process.argv[3];
    if (!genName) {
      console.error('Please provide a name for the migration');
      process.exit(1);
    }
    typeormArgs = ['migration:generate', '-d', path.join(basePath, 'dist/config/database.config.js'), genName];
    break;
  case 'run':
    typeormArgs = ['migration:run', '-d', path.join(basePath, 'dist/config/database.config.js')];
    break;
  case 'revert':
    typeormArgs = ['migration:revert', '-d', path.join(basePath, 'dist/config/database.config.js')];
    break;
  case 'create':
    const createName = process.argv[3];
    if (!createName) {
      console.error('Please provide a name for the migration');
      process.exit(1);
    }
    typeormArgs = ['migration:create', path.join(basePath, `src/migrations/${createName}`)];
    break;
  case 'show':
    typeormArgs = ['migration:show', '-d', path.join(basePath, 'dist/config/database.config.js')];
    break;
}
const typeorm = spawn('npx', ['typeorm', ...typeormArgs], { 
  env,
  stdio: 'inherit',
  shell: true
});
typeorm.on('close', code => {
  if (code !== 0) {
    console.error(`Migration command failed with code ${code}`);
    process.exit(code);
  }
  console.log('Migration command completed successfully');
});
