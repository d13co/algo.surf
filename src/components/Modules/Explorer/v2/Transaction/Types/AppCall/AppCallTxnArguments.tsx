import React from "react";
import { CoreAppCall } from "src/packages/core-sdk/classes/core/CoreAppCall";
import { CoreTransaction } from "src/packages/core-sdk/classes/core/CoreTransaction";
import MultiFormatViewer from "src/components/v2/MultiFormatViewer";

function AppCallTxnArguments({
  transaction,
}: {
  transaction: any;
}): JSX.Element {
  const txnInstance = new CoreTransaction(transaction);
  const appCallPayload = txnInstance.getAppCallPayload();
  const callInstance = new CoreAppCall(appCallPayload);
  const args = callInstance.getAppCallArguments();

  return (
    <div className="mt-6 rounded-lg p-5 bg-background-card">
      <div className="text-muted-foreground mb-4">Application args</div>
      <div className="space-y-2">
        {args.map((arg: string, index: number) => (
          <div key={arg + index} className="flex items-center gap-2 text-[13px]">
            <span className="shrink-0 tabular-nums">{String(index).padStart(2, '0')}.</span>
            <MultiFormatViewer
              view="auto"
              includeNum={index === 0 ? undefined : "auto"}
              value={arg}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default AppCallTxnArguments;
