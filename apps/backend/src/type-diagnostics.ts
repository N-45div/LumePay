// apps/backend/src/type-diagnostics.ts

import { BridgeError, PaymentError } from './common/types/transaction.types';
import { Result, createSuccess, createError } from './utils/result';

// 1. Examine the Result type structure
type ResultSuccess<T> = {
  success: true;
  data: T;
};

type ResultError<E> = {
  success: false;
  error: E;
};

type ResultType<T, E> = ResultSuccess<T> | ResultError<E>;

// Create sample objects for testing
const bridgeError = new BridgeError('PROCESSING_ERROR', 'Test bridge error');
const paymentError = new PaymentError('PAYMENT_FAILED', 'Test payment error');

// 2. Examine error types
console.log('\n=== Error Object Structure Analysis ===');
console.log('BridgeError object:', bridgeError);
console.log('PaymentError object:', paymentError);
console.log('BridgeError properties:', Object.getOwnPropertyNames(bridgeError));
console.log('PaymentError properties:', Object.getOwnPropertyNames(paymentError));
console.log('BridgeError.code type:', typeof bridgeError.code);
console.log('PaymentError.code type:', typeof paymentError.code);

// 3. Test type compatibility at runtime
console.log('\n=== Type Compatibility Testing ===');

// Create Result objects
const successResult: Result<string, BridgeError> = createSuccess('test data');
const bridgeErrorResult: Result<string, BridgeError> = createError(bridgeError);
const paymentErrorResult: Result<string, PaymentError> = createError(paymentError);

// Try to convert types at runtime
try {
  console.log('Can assign BridgeError to PaymentError?', 
    Object.assign({}, paymentError, bridgeError) instanceof PaymentError);
  console.log('Can assign PaymentError to BridgeError?', 
    Object.assign({}, bridgeError, paymentError) instanceof BridgeError);
} catch (e) {
  console.log('Error during assignment test:', e);
}

// 4. Analyze the Result type variance
function acceptBridgeErrorResult(result: Result<string, BridgeError>) {
  console.log('BridgeErrorResult accepted:', result.success ? 'Success' : 'Error');
}

try {
  console.log('\nTrying to pass success result to function expecting BridgeError result:');
  acceptBridgeErrorResult(successResult);
  
  console.log('\nTrying to pass PaymentError result to function expecting BridgeError result:');
  // This would fail at compile time, but let's try at runtime
  // @ts-ignore - Intentionally breaking type safety for diagnostic purposes
  acceptBridgeErrorResult(paymentErrorResult);
} catch (e) {
  console.log('Runtime error during function call:', e);
}

// 5. Define a conversion function
function convertErrorType<T>(
  result: Result<T, PaymentError>
): Result<T, BridgeError> {
  if (result.success) {
    return result; // Success case is fine
  } else {
    // Need to convert the error
    const bridgeError = new BridgeError(
      result.error.code as any, // Type assertion here is the key issue
      result.error.message
    );
    return createError(bridgeError);
  }
}

// Test the conversion function
try {
  console.log('\n=== Testing Error Conversion ===');
  const converted = convertErrorType(paymentErrorResult);
  console.log('Converted result:', converted);
  console.log('Original error code:', paymentErrorResult.success ? '' : paymentErrorResult.error.code);
  console.log('Converted error code:', converted.success ? '' : converted.error.code);
  
  // Now try passing it to the function that expects BridgeError
  console.log('\nPassing converted result to function:');
  // Apply type assertion since we know the types are compatible
  acceptBridgeErrorResult(converted as Result<string, BridgeError>);
} catch (e) {
  console.log('Error during conversion:', e);
}

console.log('\n=== Diagnostic Analysis Complete ===');
