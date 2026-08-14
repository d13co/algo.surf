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

/** Decode the base64 scheme identifier (e.g. "ZjE=" -> "f1"). */
export function decodePqSigScheme(pqsig: A_SearchTransaction_PQSig): string {
  if (!pqsig.scheme) return "";
  try {
    return Buffer.from(pqsig.scheme, "base64").toString("utf-8");
  } catch {
    return pqsig.scheme;
  }
}

/** Human-readable scheme name; "f1" is falcon-1024. */
export function pqSigSchemeLabel(
  pqsig: A_SearchTransaction_PQSig | undefined,
): string {
  const scheme = pqsig ? decodePqSigScheme(pqsig) : "";
  if (scheme === "f1" || !scheme) return "Falcon-1024";
  return scheme;
}
