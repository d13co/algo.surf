import { Address, bytesToBase64 } from "algosdk";

/**
 * A dt-algosdk response as the node's JSON: its encoding data with field names
 * as the node sends them, bytes as base64, addresses as text, and integers as
 * numbers where they fit in one (as bigint beyond 2^53). Unset fields are left
 * out, as the node leaves them out.
 *
 * The version and delta code reads the node's JSON: its field names are what
 * the version tables show and filter by. The SDK decodes and checks the
 * response; this gives the same JSON back. Not encodeJSON: that leaves out
 * zero and empty values too, which would read as removed fields.
 */
export function nodeJson<T = any>(value: unknown): T {
  return toJson(value) as T;
}

type Encodable = { toEncodingData(): unknown };

function isEncodable(v: object): v is Encodable {
  return typeof (v as Encodable).toEncodingData === "function";
}

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

function toJson(v: unknown): unknown {
  if (v === undefined || v === null || typeof v === "string" || typeof v === "boolean" || typeof v === "number") {
    return v;
  }
  if (typeof v === "bigint") return v <= MAX_SAFE && v >= -MAX_SAFE ? Number(v) : v;
  if (v instanceof Uint8Array) return bytesToBase64(v);
  if (v instanceof Address) return v.toString();
  if (Array.isArray(v)) return v.map(toJson);
  if (v instanceof Map) {
    const out: Record<string, unknown> = {};
    for (const [key, x] of v) {
      const json = toJson(x);
      if (json !== undefined) out[String(key)] = json;
    }
    return out;
  }
  if (typeof v === "object" && isEncodable(v)) return toJson(v.toEncodingData());
  throw new Error(`nodeJson: cannot convert ${Object.prototype.toString.call(v)}`);
}
