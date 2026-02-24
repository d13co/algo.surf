import React from "react";
import { CellContext } from "@tanstack/react-table";
import { indexerModels } from "algosdk";
import { CoreTransaction } from "src/packages/core-sdk/classes/core/CoreTransaction";
import LinkToAccount from "../../../Links/LinkToAccount";
import { DisplayAccount } from "src/components/Common/DisplayAccount";
import type { TransactionTableMeta } from "../columns";

export default function FromCell({
  row,
  table,
}: CellContext<indexerModels.Transaction, unknown>) {
  const meta = table.options.meta as TransactionTableMeta;
  const txn = new CoreTransaction(row.original);
  const from = txn.getFrom();
  const showLink = !(meta.record === "account" && meta.recordId === from);
  const isHeartbeat = txn.getType() === "hb";
  const hbAddress = row.original.heartbeatTransaction?.hbAddress || "";

  return (
    <div className="flex items-center gap-1 min-w-0">
      {showLink ? (
        <>
          <LinkToAccount
            copySize="s"
            copy={isHeartbeat ? "none" : "left"}
            address={from}
            strip={isHeartbeat ? 16 : 0}
          />
          {isHeartbeat ? (
            <>
              <span className="text-muted-foreground">/</span>
              <LinkToAccount copySize="s" copy="none" address={hbAddress} />
            </>
          ) : null}
        </>
      ) : (
        <>
          <DisplayAccount address={from} />
          {isHeartbeat ? (
            <>
              <span className="text-muted-foreground">/</span>
              <LinkToAccount copySize="s" copy="none" address={hbAddress} />
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
