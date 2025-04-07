// Type definitions for bs58 - this will help with the TypeScript errors
declare module 'bs58' {
  export function encode(source: Uint8Array): string;
  export function decode(source: string): Uint8Array;
}
