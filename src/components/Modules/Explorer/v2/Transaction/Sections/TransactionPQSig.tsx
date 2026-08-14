import React from "react";
import { CoreTransaction } from "src/packages/core-sdk/classes/core/CoreTransaction";
import {
  decodePqSigScheme,
  pqSigSchemeLabel,
} from "src/packages/core-sdk/utils/pqsig";
import Copyable from "src/components/v2/Copyable";

function b64ByteLength(value: string): number {
  try {
    return Buffer.from(value, "base64").length;
  } catch {
    return 0;
  }
}

function TransactionPQSig({
  transaction,
}: {
  transaction: any;
}): JSX.Element | null {
  const txnInstance = new CoreTransaction(transaction);
  const pqsig = txnInstance.getPqSig();

  if (!pqsig) return null;

  const publicKey = pqsig["public-key"];
  const signature = pqsig.signature;
  const scheme = decodePqSigScheme(pqsig);
  const schemeLabel = pqSigSchemeLabel(pqsig);
  const publicKeyBytes = b64ByteLength(publicKey);
  const signatureBytes = b64ByteLength(signature);

  return (
    <div className="mt-7" id="pqsig">
      <div className="text-xl font-bold mb-4">Post-Quantum Signature</div>
      <div className="rounded-lg p-5 bg-background-card">
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 sm:col-span-6">
            <div className="text-muted-foreground">Scheme</div>
            <div className="mt-2.5">
              {schemeLabel}
              {scheme ? (
                <span className="text-muted-foreground text-xs ml-1.5">
                  ({scheme})
                </span>
              ) : null}
            </div>
          </div>

          {pqsig.salt !== undefined ? (
            <div className="col-span-12 sm:col-span-6">
              <div className="text-muted-foreground">Salt</div>
              <div className="mt-2.5">{String(pqsig.salt)}</div>
            </div>
          ) : null}

          <div className="col-span-12">
            <div className="text-muted-foreground">
              Public key
              {publicKeyBytes ? (
                <span className="text-xs ml-1.5">
                  ({publicKeyBytes.toLocaleString()} bytes)
                </span>
              ) : null}
            </div>
            <div className="mt-2.5 text-[13px] break-all group">
              {publicKey}
              <Copyable
                className="opacity-60 group-hover:opacity-100"
                value={publicKey}
              />
            </div>
          </div>

          <div className="col-span-12">
            <div className="text-muted-foreground">
              Signature
              {signatureBytes ? (
                <span className="text-xs ml-1.5">
                  ({signatureBytes.toLocaleString()} bytes)
                </span>
              ) : null}
            </div>
            <div className="mt-2.5 text-[13px] break-all group">
              {signature}
              <Copyable
                className="opacity-60 group-hover:opacity-100"
                value={signature}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TransactionPQSig;
