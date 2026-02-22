import React from "react";
import { CellContext } from "@tanstack/react-table";
import { A_SearchTransaction } from "src/packages/core-sdk/types";
import { CoreTransaction } from "src/packages/core-sdk/classes/core/CoreTransaction";
import Copyable from "src/components/v2/Copyable";
import LinkToTransaction from "../../../Links/LinkToTransaction";
import LinkToGroup from "../../../Links/LinkToGroup";
import RekeyIcon from "../RekeyIcon";
import type { TransactionTableMeta, GroupPosition } from "../columns";

export default function TxnIdCell({
  row,
  table,
}: CellContext<A_SearchTransaction, unknown>) {
  const meta = table.options.meta as TransactionTableMeta;
  const txn = new CoreTransaction(row.original);
  const txnId = txn.getId();
  const groupId = txn.getGroup();
  const rekey = !!txn.getRekeyTo();
  const showGroupIcon = groupId && meta.record !== "group";
  const groupPos: GroupPosition = meta.groupPositions?.get(row.index) ?? "none";
  const showLine = groupPos === "first" || groupPos === "middle" || groupPos === "last";

  return (
    <div className="flex items-center gap-1 min-w-0">
      <Copyable size="s" value={txnId} />
      {rekey ? <RekeyIcon /> : null}
      {showGroupIcon ? (
        <div className="relative shrink-0">
          {showLine && (groupPos === "middle" || groupPos === "last") && (
            <div className="absolute left-1/2 -translate-x-1/2 bottom-1/2 -top-4 w-0 border-l border-dashed border-muted/70" />
          )}
          {showLine && (groupPos === "middle" || groupPos === "first") && (
            <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -bottom-4 w-0 border-l border-dashed border-muted/70" />
          )}
          <div className="relative z-10">
            <LinkToGroup id={groupId} blockId={txn.getBlock()} icon />
          </div>
        </div>
      ) : null}
      <LinkToTransaction id={txnId} />
    </div>
  );
}
