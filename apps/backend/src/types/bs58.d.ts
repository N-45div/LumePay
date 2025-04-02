// apps/backend/src/types/bs58.d.ts

/**
 * Type definitions for bs58
 * 
 * bs58 is a base58 encoding/decoding library for Bitcoin and other cryptocurrencies
 */
declare module 'bs58' {
  /**
   * Encodes a Buffer as a base58 string
   * @param source The buffer to encode
   * @returns The encoded string
   */
  export function encode(source: Buffer | Uint8Array): string;
  
  /**
   * Decodes a base58 string into a Buffer
   * @param source The base58 string to decode
   * @returns The decoded buffer
   */
  export function decode(source: string): Buffer;
}
