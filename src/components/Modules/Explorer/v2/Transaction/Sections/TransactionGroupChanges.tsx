import React from "react";
import { useStateChangesCaps, useTxnStateChanges } from "src/hooks/useTxnStateChanges";
import { groupOfTxn } from "src/utils/txnStateChanges";
import { Pending } from "../../Versions/ObjectRoundDiff";
import Link from "../../Links/Link";
import GroupChangesView from "../../Group/GroupChangesView";

/**
 * What a top-level transaction changed besides app state (balances, account
 * fields, holdings, assets, apps, opt-ins), each before → after, from the
 * time-travel node's full deltas. For a grouped transaction, its whole
 * group's: the node applies a group as one unit, so its changes don't split
 * by transaction. Nothing where the node doesn't serve full deltas.
 */
export default function TransactionGroupChanges({ round, txId, groupId }: { round: number; txId: string; groupId?: string }): JSX.Element | null {
  const caps = useStateChangesCaps();
  // The same request as the app call's State changes card, so they share it;
  // none without full deltas, where this card shows nothing.
  const { data, error, isLoading } = useTxnStateChanges(round, [txId], { supported: caps.supported && caps.full, full: caps.full });
  if (!caps.full) return null;
  if (error) {
    return <div className="mt-6 text-xs text-muted-foreground">Changes unavailable: {(error as Error).message}</div>;
  }
  const group = data ? groupOfTxn(data, txId) : undefined;
  const count = group?.count ?? 1;

  return (
    <div className="mt-6 rounded-lg p-5 bg-background-card">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-4">
        <span className="text-muted-foreground">Changes</span>
        <span className="text-xs text-muted-foreground">
          {groupId ? (
            <>
              before → after its{" "}
              <Link href={`/group/${encodeURIComponent(groupId)}/${round}/state-changes`}>
                group{group ? ` of ${count.toLocaleString()} ${count === 1 ? "transaction" : "transactions"}` : ""}
              </Link>
              , which the node applies as one
            </>
          ) : (
            "before → after this transaction"
          )}
        </span>
      </div>
      {isLoading || !data ? (
        <Pending className="h-5 w-48" />
      ) : group ? (
        <GroupChangesView group={group} round={round} feeSink={data["fee-sink"]} />
      ) : (
        <div className="text-sm text-muted-foreground">No changes</div>
      )}
    </div>
  );
}
