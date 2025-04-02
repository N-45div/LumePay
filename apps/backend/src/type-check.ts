// apps/backend/src/type-check.ts

import { TransactionStatus as TypesTransactionStatus } from './types';
import { TransactionStatus as CommonTransactionStatus } from './common/types';

// Log the enum values to check if they're identical
console.log('=== TransactionStatus Type Comparison ===');

console.log('From ./types:');
console.log('- Object type:', typeof TypesTransactionStatus);
console.log('- Values:', Object.values(TypesTransactionStatus));
console.log('- COMPLETED value:', TypesTransactionStatus.COMPLETED);

console.log('\nFrom ./common/types:');
console.log('- Object type:', typeof CommonTransactionStatus);
console.log('- Values:', Object.values(CommonTransactionStatus));
console.log('- COMPLETED value:', CommonTransactionStatus.COMPLETED);

// Check if these are actually the same type
const statusFromTypes: TypesTransactionStatus = TypesTransactionStatus.COMPLETED;
try {
  // If these are actually different types, this assignment should fail at runtime
  const crossAssignment: TypesTransactionStatus = CommonTransactionStatus.COMPLETED as any;
  console.log('\nCross-assignment test:', crossAssignment === statusFromTypes ? 'Values match' : 'Values differ');
  
  // Check if the actual runtime values are identical
  console.log(
    'Runtime value comparison:',
    TypesTransactionStatus.COMPLETED === CommonTransactionStatus.COMPLETED ? 'Same value' : 'Different values'
  );
} catch (e) {
  console.log('Cross-assignment failed:', e);
}

// Check instanceof behavior
console.log('\nInstance checks:');
const completedStatus1 = TypesTransactionStatus.COMPLETED;
const completedStatus2 = CommonTransactionStatus.COMPLETED;

console.log('TypesTransactionStatus instanceof Object:', TypesTransactionStatus instanceof Object);
console.log('CommonTransactionStatus instanceof Object:', CommonTransactionStatus instanceof Object);

// Compare the actual string values
console.log('\nString value comparison:');
console.log(`TypesTransactionStatus.COMPLETED = "${completedStatus1}"`);
console.log(`CommonTransactionStatus.COMPLETED = "${completedStatus2}"`);
