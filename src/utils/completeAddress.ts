import { encodeAddress } from "algosdk";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/**
 * Validate that a string is a valid base32 prefix (1–52 chars from [A-Z2-7]).
 */
export function isValidBase32Prefix(prefix: string): boolean {
  return prefix.length >= 1 && prefix.length <= 52 && /^[A-Z2-7]+$/.test(prefix);
}

/**
 * Decode a 52-char base32 string into 32 raw bytes (the public key portion).
 * 52 base32 chars = 260 bits; we take the first 256 bits = 32 bytes.
 */
function base32DecodeToBytes(str: string): Uint8Array {
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const char of str) {
    value = (value << 5) | BASE32_ALPHABET.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >> bits) & 0xff);
    }
  }

  return new Uint8Array(bytes.slice(0, 32));
}

/**
 * Complete a base32 prefix into a valid 58-char Algorand address.
 *
 * Pads the prefix to 52 chars with 'A' (zero bits), decodes to a 32-byte
 * public key, then uses algosdk's encodeAddress to append the correct
 * SHA-512/256 checksum — producing a valid address that sorts at the
 * start of the prefix range.
 */
export function completeAddress(prefix: string): string {
  const padded = prefix + "A".repeat(52 - prefix.length);
  const publicKey = base32DecodeToBytes(padded);
  return encodeAddress(publicKey);
}
