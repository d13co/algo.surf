import { decodeAddress, encodeUint64 } from "algosdk";
import { sha512_256 } from "js-sha512";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32NoPad(bytes: Uint8Array): string {
  let bits = 0, value = 0, out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

/**
 * ARC-81 participation key integrity hash:
 * base32_nopad(sha512_256(genesisHash|address|selKey|voteKey|spKey|first|last|dilution)[0..8])
 * Offline keyregs hash zeroed key material.
 */
export function partkeyIntegrityHash(p: {
  genesisHash: Uint8Array;
  address: string;
  selectionKey?: Uint8Array;
  voteKey?: Uint8Array;
  stateProofKey?: Uint8Array;
  voteFirstValid?: number | bigint;
  voteLastValid?: number | bigint;
  voteKeyDilution?: number | bigint;
}): string {
  const buf = new Uint8Array(216);
  let off = 0;
  const put = (b: Uint8Array | undefined, len: number) => {
    if (b && b.length) buf.set(b, off);
    off += len;
  };
  put(p.genesisHash, 32);
  put(decodeAddress(p.address).publicKey, 32);
  put(p.selectionKey, 32);
  put(p.voteKey, 32);
  put(p.stateProofKey, 64);
  put(encodeUint64(p.voteFirstValid ?? 0), 8);
  put(encodeUint64(p.voteLastValid ?? 0), 8);
  put(encodeUint64(p.voteKeyDilution ?? 0), 8);
  return base32NoPad(new Uint8Array(sha512_256.arrayBuffer(buf)).slice(0, 8));
}
