import React from "react";
import { CellContext } from "@tanstack/react-table";
import { A_SearchTransaction } from "src/packages/core-sdk/types";
import { CoreTransaction } from "src/packages/core-sdk/classes/core/CoreTransaction";
import { TXN_TYPES } from "src/packages/core-sdk/constants";
import LinkToAccount from "../../../Links/LinkToAccount";
import LinkToApplication from "../../../Links/LinkToApplication";
import { DisplayAccount } from "src/components/Common/DisplayAccount";
import type { TransactionTableMeta } from "../columns";

export default function ToCell({
  row,
  table,
}: CellContext<A_SearchTransaction, unknown>) {
  const meta = table.options.meta as TransactionTableMeta;
  const txn = new CoreTransaction(row.original);
  const to = txn.getTo();
  const closeTo = txn.getCloseTo();
  const type = txn.getType();
  const appId = txn.getAppId();

  const showLink = !(meta.record === "account" && meta.recordId === to);
  const showCloseLink = !(meta.record === "account" && meta.recordId === closeTo);

  if (type === TXN_TYPES.PAYMENT || type === TXN_TYPES.ASSET_TRANSFER) {
    return (
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="truncate">
          {showLink ? (
            <LinkToAccount copySize="s" address={to} />
          ) : (
            <DisplayAccount address={to} />
          )}
        </span>
        {closeTo ? (
          <span className="truncate">
            {showCloseLink ? (
              <LinkToAccount copySize="s" address={closeTo} />
            ) : (
              <DisplayAccount address={closeTo} />
            )}
          </span>
        ) : null}
      </div>
    );
  }

  if (type === TXN_TYPES.APP_CALL) {
    return <LinkToApplication id={appId} name={"App " + appId} copySize="m" />;
  }

  return null;
}
