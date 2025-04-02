// apps/backend/test/utils/test-utils.ts

/**
 * Helper function to delay execution for a specified time
 * @param ms Milliseconds to delay
 * @returns Promise that resolves after the delay
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Helper function to generate random test data
 * @param prefix Optional prefix for the string
 * @returns Random string suitable for test data
 */
export function generateTestId(prefix = 'test'): string {
  return `${prefix}-${Math.random().toString(36).substring(2, 10)}-${Date.now()}`;
}
