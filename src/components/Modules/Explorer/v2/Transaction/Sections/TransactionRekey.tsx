import React from "react";
import { CoreTransaction } from "src/packages/core-sdk/classes/core/CoreTransaction";
import LinkToAccount from "../../Links/LinkToAccount";
import { KeyRound } from "lucide-react";

function TransactionRekey({
  transaction,
}: {
  transaction: any;
}): JSX.Element | null {
  const txnInstance = new CoreTransaction(transaction);
  const rekeyTo = txnInstance.getRekeyTo();

  if (!rekeyTo) return null;

  return (
    <div className="mt-6 rounded-lg p-5 bg-background-card">
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12">
          <div className="text-muted-foreground inline-flex items-center gap-1">
            <KeyRound size={16} /> Rekey To
          </div>
          <div className="mt-2.5 text-[13px] break-words overflow-hidden">
            <LinkToAccount address={rekeyTo} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default TransactionRekey;
