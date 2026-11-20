import React from "react";
import { useParams } from "react-router-dom";
import { useGroup } from "src/hooks/useGroup";
import { useStateChangesCaps, useTxnStateChanges } from "src/hooks/useTxnStateChanges";
import { groupOfTxn } from "src/utils/txnStateChanges";
import LoadingTile from "src/components/v2/LoadingTile";
import { Pending } from "../Versions/ObjectRoundDiff";
import LinkToTransaction from "../Links/LinkToTransaction";
import TxnStateChangesView from "../Transaction/Types/AppCall/TxnStateChangesView";
import { attributionOf } from "../Transaction/Types/AppCall/AppCallTxnExactStateChanges";
import GroupChangesView from "./GroupChangesView";

/**
 * What a group changed, from the time-travel node's state changes: with full
 * deltas, the group's balances, account fields, holdings, assets, apps and
 * opt-ins, before → after the group; then what each transaction did to app
 * state, each key and box before → after that transaction (its inner
 * transactions' changes included), in the order the group ran.
 */
function GroupStateChanges(): JSX.Element {
  const { id, blockId } = useParams();
  const round = Number(blockId);
  const { data: groupInfo, isLoading: groupLoading } = useGroup(id!, round);
  const txns = groupInfo?.transactions ?? [];
  const caps = useStateChangesCaps();
  const { supported, full } = caps;
  // Only app calls (with their inner txns) change app state: an account can't
  // close with local state, boxes or apps, so no other txn type touches it.
  // Full deltas need any one txid of the group, but take them all, as they
  // narrow the per-txn app state as well.
  const txids = txns.filter((t) => full || t.txType === "appl").map((t) => t.id ?? "").filter(Boolean);
  const { data, error, isLoading } = useTxnStateChanges(round, txids, caps);

  if (groupLoading || supported === undefined || (supported && full === undefined)) return <LoadingTile />;
  if (!supported) {
    return (
      <div className="mt-6 rounded-lg p-5 bg-background-card text-sm text-muted-foreground">
        Per-transaction state changes need a time-travel node that serves them.
      </div>
    );
  }
  if (error) {
    return <div className="mt-6 rounded-lg p-5 bg-background-card text-sm text-red-400">{(error as Error).message}</div>;
  }
  if (!txids.length) {
    return <div className="mt-6 rounded-lg p-5 bg-background-card text-sm text-muted-foreground">{full ? "No transactions" : "No app calls, so no app state changes"}</div>;
  }
  if (isLoading || !data) return <Pending className="mt-6 h-5 w-48" />;

  // Top-level entries only: each one's changes are net over its inner txns.
  const byTxid = new Map(data.txns.filter((t) => t.path.length === 1 && t.txid).map((t) => [t.txid!, t]));
  const changed = txns.flatMap((t, i) => {
    const entry = byTxid.get(t.id ?? "");
    return entry?.changes.length ? [{ index: i, txid: t.id!, entry }] : [];
  });
  const unchanged = txns.length - changed.length;
  const group = full && txids.length ? groupOfTxn(data, txids[0]) : undefined;
  const hasAppCalls = txns.some((t) => t.txType === "appl");

  return (
    <div className="mt-6 space-y-6">
      {full ? (
        <div className="rounded-lg p-5 bg-background-card">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-4">
            <span className="text-muted-foreground">Changes</span>
            <span className="text-xs text-muted-foreground">before → after the group, which the node applies as one</span>
          </div>
          {group ? (
            <GroupChangesView group={group} round={round} feeSink={data["fee-sink"]} />
          ) : (
            <div className="text-sm text-muted-foreground">No changes</div>
          )}
        </div>
      ) : null}
      {full && !hasAppCalls ? null : (
        <section>
          {full ? <div className="text-muted-foreground mb-3">App state, by transaction</div> : null}
          <div className="space-y-6">
            {changed.length ? (
              changed.map(({ index, txid, entry }) => (
                <div key={txid} className="rounded-lg p-5 bg-background-card">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-4 min-w-0">
                    <span className="text-muted-foreground shrink-0">
                      Transaction {index + 1} of {txns.length}
                    </span>
                    <span className="min-w-0 text-sm truncate">
                      <LinkToTransaction id={txid} />
                    </span>
                  </div>
                  <TxnStateChangesView changes={entry.changes} round={round} attribution={attributionOf(data, entry, txid)} />
                </div>
              ))
            ) : (
              <div className="rounded-lg p-5 bg-background-card text-sm text-muted-foreground">No app state changes</div>
            )}
          </div>
          {changed.length && unchanged ? (
            <div className="mt-3 text-xs text-muted-foreground">
              {unchanged.toLocaleString()} other {unchanged === 1 ? "transaction" : "transactions"} in the group changed no app state.
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}

export default GroupStateChanges;
