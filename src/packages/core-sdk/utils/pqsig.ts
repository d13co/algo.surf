import { indexerModels } from "algosdk";
import { A_SearchTransaction_PQSig } from "../types";

/**
 * Post-quantum (falcon) transaction signatures are not part of algosdk's
 * indexer models, so they are carried out-of-band on the Transaction
 * instance under this property. The IDB serializer (src/db/sdk-serializer.ts)
 * persists it alongside the model's encoding data.
 */
export const PQSIG_PROP = "_pqsig";

export function attachPqSig(
  txn: indexerModels.Transaction,
  pqsig: A_SearchTransaction_PQSig,
): void {
  (txn as unknown as Record<string, unknown>)[PQSIG_PROP] = pqsig;
}

export function getAttachedPqSig(
  txn: indexerModels.Transaction,
): A_SearchTransaction_PQSig | undefined {
  return (txn as unknown as Record<string, unknown>)[PQSIG_PROP] as
    | A_SearchTransaction_PQSig
    | undefined;
}

export function parsePqSig(raw: unknown): A_SearchTransaction_PQSig | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const obj = raw as Record<string, unknown>;
  const publicKey = obj["public-key"] ?? obj["publicKey"];
  const signature = obj["signature"];
  if (typeof publicKey !== "string" || typeof signature !== "string") {
    return undefined;
  }
  const scheme = obj["scheme"];
  const salt = obj["salt"];
  return {
    "public-key": publicKey,
    signature,
    scheme: typeof scheme === "string" ? scheme : undefined,
    salt:
      typeof salt === "number" || typeof salt === "string" ? salt : undefined,
  };
}

/** Printable ASCII, excluding DEL — what a scheme identifier may look like. */
function isReadable(value: string): boolean {
  return /^[\x20-\x7E]+$/.test(value);
}

/** Base64 is only plausible when the alphabet and the padded length both fit. */
function looksBase64(value: string): boolean {
  return value.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

/**
 * Read the scheme identifier (e.g. "f1"). Indexers ship it both as plain text
 * and base64-encoded ("ZjE="), so only decode when the input actually looks
 * like base64 and yields readable text — Buffer's base64 decoder never throws
 * and happily turns a plain "f1" into a DEL byte.
 */
export function decodePqSigScheme(pqsig: A_SearchTransaction_PQSig): string {
  const raw = pqsig.scheme?.trim();
  if (!raw) return "";
  if (looksBase64(raw)) {
    const decoded = Buffer.from(raw, "base64").toString("utf-8");
    if (decoded && isReadable(decoded)) return decoded;
  }
  return raw;
}

/** Human-readable scheme name; "f1" is falcon-1024. */
export function pqSigSchemeLabel(
  pqsig: A_SearchTransaction_PQSig | undefined,
): string {
  const scheme = pqsig ? decodePqSigScheme(pqsig) : "";
  if (!scheme || scheme.toLowerCase() === "f1") return "Falcon-1024";
  return scheme;
}
