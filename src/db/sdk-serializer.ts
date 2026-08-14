import { indexerModels, modelsv2 } from "algosdk";
import {
  attachPqSig,
  getAttachedPqSig,
  parsePqSig,
} from "src/packages/core-sdk/utils/pqsig";

/**
 * Tag-and-reconstruct serializer for algosdk model instances.
 *
 * IndexedDB structured cloning preserves data (Uint8Array, BigInt, Map) but
 * strips class prototypes. We tag SDK model instances before storage and
 * reconstruct them on restore so that `instanceof` checks keep working.
 */

type EncodableClass = {
  fromEncodingData(data: unknown): unknown;
};

// instanceof → short tag
const CLASS_TO_TAG: [Function, string][] = [
  [indexerModels.Transaction, "Tx"],
  [indexerModels.Block, "Bk"],
  [indexerModels.Asset, "As"],
  [indexerModels.Application, "Ap"],
  [modelsv2.Account, "Ac"],
];

// tag → class (for reconstruction)
const TAG_TO_CLASS: Record<string, EncodableClass> = Object.fromEntries(
  CLASS_TO_TAG.map(([cls, tag]) => [tag, cls as unknown as EncodableClass]),
);

const TAG_FIELD = "_t";
const DATA_FIELD = "_d";
// Out-of-band pqsig on Transaction instances; toEncodingData() doesn't
// include it, so it rides in the wrapper.
const PQSIG_WRAPPER_FIELD = "_p";

function isTagged(
  value: unknown,
): value is {
  [TAG_FIELD]: string;
  [DATA_FIELD]: unknown;
  [PQSIG_WRAPPER_FIELD]?: unknown;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    TAG_FIELD in value &&
    DATA_FIELD in value
  );
}

/**
 * Walk a value tree and replace SDK model instances with tagged wrappers
 * whose `_d` is the Map from `toEncodingData()` (survives structured cloning).
 */
export function serializeForIDB(value: unknown): unknown {
  if (value == null || typeof value !== "object") return value;

  // Check SDK model instances first
  for (const [cls, tag] of CLASS_TO_TAG) {
    if (value instanceof cls) {
      const tagged: Record<string, unknown> = {
        [TAG_FIELD]: tag,
        [DATA_FIELD]: (value as { toEncodingData(): Map<string, unknown> }).toEncodingData(),
      };
      if (value instanceof indexerModels.Transaction) {
        const pqsig = getAttachedPqSig(value);
        if (pqsig) tagged[PQSIG_WRAPPER_FIELD] = pqsig;
      }
      return tagged;
    }
  }

  if (Array.isArray(value)) {
    return value.map(serializeForIDB);
  }

  // Only recurse into plain objects (not Map, Uint8Array, Date, etc.)
  if (value.constructor === Object) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = serializeForIDB(v);
    }
    return out;
  }

  // Pass through everything else (Map, Uint8Array, BigInt wrappers, etc.)
  return value;
}

/**
 * Walk a value tree and reconstruct SDK model instances from tagged wrappers.
 */
export function deserializeFromIDB(value: unknown): unknown {
  if (value == null || typeof value !== "object") return value;

  // Check for tagged wrapper
  if (isTagged(value)) {
    const cls = TAG_TO_CLASS[value[TAG_FIELD]];
    if (cls) {
      try {
        const restored = cls.fromEncodingData(value[DATA_FIELD]);
        const pqsig = parsePqSig(value[PQSIG_WRAPPER_FIELD]);
        if (pqsig && restored instanceof indexerModels.Transaction) {
          attachPqSig(restored, pqsig);
        }
        return restored;
      } catch (e) {
        console.warn(
          `[sdk-serializer] Failed to reconstruct ${value[TAG_FIELD]}:`,
          e,
        );
        return undefined;
      }
    }
  }

  if (Array.isArray(value)) {
    return value.map(deserializeFromIDB);
  }

  // Only recurse into plain objects
  if (value.constructor === Object) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = deserializeFromIDB(v);
    }
    return out;
  }

  return value;
}
