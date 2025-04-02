// apps/backend/src/diagnostics.ts
// Diagnostic tool to identify module resolution and type issues

import { TransactionStatus } from './types';
import * as fs from 'fs';
import * as path from 'path';

// 1. Log TransactionStatus type information
console.log('=== TransactionStatus Analysis ===');
console.log('TransactionStatus type:', typeof TransactionStatus);
console.log('Is TransactionStatus an enum?', TransactionStatus instanceof Object);
console.log('TransactionStatus values:', Object.values(TransactionStatus));
console.log('TransactionStatus keys:', Object.keys(TransactionStatus));

// 2. Analyze import paths for fiat-bridge.service.ts
const importPaths = [
  './services/core/payment/fiat-bridge.service',
  '../core/payment/fiat-bridge.service',
  '../../core/payment/fiat-bridge.service',
  '../../../core/payment/fiat-bridge.service'
];

console.log('\n=== Module Path Resolution Analysis ===');
importPaths.forEach(importPath => {
  try {
    // Check if the file exists by resolving the path
    const basePath = path.resolve(__dirname);
    const possiblePath = path.resolve(basePath, importPath + '.ts');
    const exists = fs.existsSync(possiblePath);
    console.log(`Path ${importPath} -> ${possiblePath} exists: ${exists}`);
  } catch (error) {
    console.log(`Error checking path ${importPath}:`, error);
  }
});

// 3. Check for potential circular dependencies
console.log('\n=== Circular Dependency Analysis ===');
// This is a simplified check - in a real app we'd use a dependency analysis tool
const moduleFiles = [
  './services/bridge/crypto-fiat-bridge.service.ts',
  './services/blockchain/solana/wallet.service.ts',
  './services/core/payment/fiat-bridge.service.ts'
];

moduleFiles.forEach(file => {
  try {
    const fullPath = path.resolve(__dirname, file);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      
      // This is a simple check for potential circular imports
      moduleFiles.forEach(otherFile => {
        if (file !== otherFile) {
          const relativePath = path.relative(
            path.dirname(fullPath),
            path.resolve(__dirname, otherFile)
          ).replace(/\\/g, '/').replace('.ts', '');
          
          if (content.includes(`from '${relativePath}'`) || 
              content.includes(`from "./${path.basename(relativePath)}"`)) {
            console.log(`${file} imports ${otherFile} - potential circular dependency`);
          }
        }
      });
    } else {
      console.log(`File not found: ${fullPath}`);
    }
  } catch (error) {
    console.log(`Error analyzing ${file}:`, error);
  }
});

// 4. Get a list of all imports of TransactionStatus to check for inconsistent usage
console.log('\n=== TransactionStatus Import Analysis ===');
function scanDirectory(dir: string) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        scanDirectory(fullPath);
      } else if (entry.name.endsWith('.ts')) {
        const content = fs.readFileSync(fullPath, 'utf8');
        
        // Check for TransactionStatus imports
        const importMatch = content.match(/import\s+[^;]+\s+TransactionStatus\s+[^;]+from\s+['"](.*?)['"]/);
        if (importMatch) {
          console.log(`${fullPath} imports TransactionStatus from ${importMatch[1]}`);
        }
      }
    }
  } catch (error) {
    console.log(`Error scanning directory ${dir}:`, error);
  }
}

scanDirectory(path.resolve(__dirname));

console.log('\n=== Diagnostic Analysis Complete ===');
