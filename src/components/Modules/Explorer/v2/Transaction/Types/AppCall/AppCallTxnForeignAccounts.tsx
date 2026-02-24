import React from "react";
import LinkToAccount from "../../../Links/LinkToAccount";

function AppCallTxnForeignAccounts({
  accounts,
}: {
  accounts: string[];
}): JSX.Element {
  return (
    <div className="mt-6 rounded-lg p-5 bg-background-card">
      <div className="text-muted-foreground mb-4">Foreign accounts</div>
      <div className="space-y-4 text-[13px]">
        {accounts.map((account, index) => (
          <div key={account} className="flex items-center gap-2">
            <span className="shrink-0 tabular-nums">{String(index).padStart(2, '0')}.</span>
            <LinkToAccount copySize="m" address={account} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default AppCallTxnForeignAccounts;
