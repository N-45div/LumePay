// Type diagnostic script to find our error

import { BridgeError, PaymentError } from './common/types/transaction.types';
import { Result, createError, createSuccess } from './utils/result';

// Create a minimal reproduction of our issue
interface ExchangeResult {
  id: string;
}

interface Transaction {
  id: string;
}

function main() {
  // Note line numbers in output to help locate the error
  console.log('Line 15: Starting type error diagnosis');
  
  // Create sample errors and results
  const bridgeError = new BridgeError('PROCESSING_ERROR', 'Bridge error');
  const paymentError = new PaymentError('PAYMENT_FAILED', 'Payment error');
  
  console.log('Line 20: Error instances created');
  console.log(`BridgeError type: ${typeof bridgeError}`);
  console.log(`BridgeError code: ${bridgeError.code}`);
  console.log(`PaymentError type: ${typeof paymentError}`);
  console.log(`PaymentError code: ${paymentError.code}`);
  
  // Test result creation
  const successBridge: Result<ExchangeResult, BridgeError> = createSuccess({ id: '123' });
  const errorBridge: Result<ExchangeResult, BridgeError> = createError(bridgeError);
  
  console.log('Line 30: Bridge result types created');
  
  const successPayment: Result<Transaction, PaymentError> = createSuccess({ id: '456' });
  const errorPayment: Result<Transaction, PaymentError> = createError(paymentError);
  
  console.log('Line 35: Payment result types created');
  
  // This typecasts directly - for diagnostic purposes only
  // @ts-ignore - This simulates what we're trying to do in our service
  const invalidTryCast1: Result<ExchangeResult, BridgeError> = errorPayment;
  console.log('Line 40: Direct typecast attempted');
  
  // This is a safer approach - manually unwrap and convert
  function convertPaymentToBridgeResult(
    result: Result<Transaction, PaymentError>
  ): Result<ExchangeResult, BridgeError> {
    if (result.success) {
      // We create a new ExchangeResult from the Transaction
      return createSuccess({ id: result.data.id });
    } else {
      // We convert PaymentError to BridgeError
      return createError(new BridgeError('PROCESSING_ERROR', result.error.message));
    }
  }
  
  console.log('Line 53: Created a proper conversion function');
  const validConversion = convertPaymentToBridgeResult(errorPayment);
  console.log('Line 55: Conversion function called successfully');
  
  // Check the types at runtime
  console.log('Converted result success:', validConversion.success);
  if (!validConversion.success) {
    console.log('Converted error code:', validConversion.error.code);
    console.log('Converted error message:', validConversion.error.message);
  }
  
  console.log('Line 63: Type error diagnosis complete');
}

main();
