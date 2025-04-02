// apps/backend/src/utils/result.ts

/**
 * Type definitions for the Result pattern
 */

/**
 * Success variant of Result
 */
export type Success<T> = {
  success: true;
  data: T;
};

/**
 * Error variant of Result
 */
export type Failure<E> = {
  success: false;
  error: E;
};

/**
 * Result type representing either success with data or failure with an error
 */
export type Result<T, E> = Success<T> | Failure<E>;

/**
 * Type guard to check if a Result is a Success
 */
export function isSuccess<T, E>(result: Result<T, E>): result is Success<T> {
  return result.success === true;
}

/**
 * Type guard to check if a Result is a Failure
 */
export function isFailure<T, E>(result: Result<T, E>): result is Failure<E> {
  return result.success === false;
}

/**
 * Create a success result with data
 */
export const createSuccess = <T>(data: T): Success<T> => {
  return { success: true, data };
};

/**
 * Create an error result with an error object
 */
export const createError = <E>(error: E): Failure<E> => {
  return { success: false, error };
};

/**
 * Safely map a Result's data, preserving the error if present
 */
export const mapResult = <T1, E, T2>(
  result: Result<T1, E>,
  mapFunc: (data: T1) => T2
): Result<T2, E> => {
  if (isSuccess(result)) {
    return createSuccess(mapFunc(result.data));
  }
  return createError(result.error);
};

/**
 * Safely map a Result's error, preserving the data if present
 */
export const mapError = <T, E1, E2>(
  result: Result<T, E1>,
  mapFunc: (error: E1) => E2
): Result<T, E2> => {
  if (isFailure(result)) {
    return createError(mapFunc(result.error));
  }
  return createSuccess(result.data);
};

/**
 * Map both success and error cases to a new Result type
 */
export const bimap = <T1, E1, T2, E2>(
  result: Result<T1, E1>,
  mapSuccess: (data: T1) => T2, 
  mapError: (error: E1) => E2
): Result<T2, E2> => {
  if (isSuccess(result)) {
    return createSuccess(mapSuccess(result.data));
  }
  return createError(mapError(result.error));
};

/**
 * Convert a Result<T1, E1> to a Result<T2, E2> using conversion functions for both data and error types
 */
export function convertResultTypes<T1, E1, T2, E2>(
  result: Result<T1, E1>,
  dataConverter: (data: T1) => T2,
  errorConverter: (error: E1) => E2
): Result<T2, E2> {
  return bimap(result, dataConverter, errorConverter);
}

/**
 * Extract the data from a Result if it's a success, or throw the error if it's a failure
 */
export function unwrapResult<T, E extends Error>(result: Result<T, E>): T {
  if (isSuccess(result)) {
    return result.data;
  }
  throw result.error;
}

/**
 * Extract the data from a Result if it's a success, or return a default value if it's a failure
 */
export function unwrapResultOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  if (isSuccess(result)) {
    return result.data;
  }
  return defaultValue;
}

/**
 * Convert a Result<T, Error> to a Result<T, PaymentError>
 */
export const mapSolanaResult = <T>(result: Result<T, Error>): Result<T, PaymentError> => {
  if (isSuccess(result)) {
    return createSuccess(result.data);
  }
  return createError(convertError(result.error));
};

/**
 * Convert an Error to a PaymentError
 */
export const convertError = (error: Error): PaymentError => {
  if (error instanceof PaymentError) {
    return error;
  }
  return new PaymentError(
    'INTERNAL_ERROR',
    error.message,
    { originalError: error }
  );
};

// Import at the end to avoid cyclic dependencies
import { PaymentError } from '../services/core/payment/errors/PaymentErrors';