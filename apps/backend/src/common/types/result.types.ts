export interface ErrorInfo {
  code: string;
  message: string;
  details?: Record<string, any>;
}
export interface Result<T = any> {
  success: boolean;
  data?: T;
  error?: ErrorInfo;
}
export function createSuccessResult<T>(data: T): Result<T> {
  return {
    success: true,
    data
  };
}
export function createErrorResult<T>(
  code: string,
  message: string,
  details?: Record<string, any>
): Result<T> {
  return {
    success: false,
    error: {
      code,
      message,
      details
    }
  };
}
