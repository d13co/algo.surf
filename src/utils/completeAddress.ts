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
 * The indexer `next` token that lists accounts from the first one whose
 * address starts with `prefix` (base32, up to a full 58-char address).
 *
 * The indexer lists accounts in public key order, after the `next` address.
 * Padding the prefix's first 52 chars with 'A' (zero bits) gives the lowest
 * public key in the prefix range, so the token is the key just below it.
 * Undefined when that lowest key is all zeros: then the list starts at the
 * beginning.
 */
export function addressBefore(prefix: string): string | undefined {
  const head = prefix.slice(0, 52);
  const key = base32DecodeToBytes(head + "A".repeat(52 - head.length));
  for (let i = key.length - 1; i >= 0; i--) {
    if (key[i] > 0) {
      key[i]--;
      return encodeAddress(key);
    }
    key[i] = 0xff;
  }
  return undefined;
}
