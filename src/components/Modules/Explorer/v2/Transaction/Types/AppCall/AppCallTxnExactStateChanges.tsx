import React, { useMemo } from "react";
import { cn } from "src/lib/utils";
import { useStateChangesCaps, useTxnStateChanges } from "src/hooks/useTxnStateChanges";
import { usePersistenBooleanState } from "src/utils/usePersistenBooleanState";
import { attribute, changeId, childrenOf, descendantsOf, explorerInnerPath, findTxn, SCRound, SCTxn } from "src/utils/txnStateChanges";
import { Pending } from "../../../Versions/ObjectRoundDiff";
import Link from "../../../Links/Link";
import TxnStateChangesView, { Attribution } from "./TxnStateChangesView";

/** Which transaction: a top-level one, or one of its inner transactions. */
export type StateChangesTarget = {
  round: number;
  /** The top-level transaction. */
  txId: string;
  /** The explorer's 1-based inner path ("2/1"); "" or unset for `txId` itself. */
  innerPath?: string;
};

/** The href of the inner transaction at a node path, under top-level `txId`. */
export function innerHrefOf(txId: string): (path: number[]) => string {
  return (path) => `/transaction/${txId}/inner/${explorerInnerPath(path)}`;
}

/** Who made each of `entry`'s changes, where it has inner transactions that changed state. */
export function attributionOf(answer: SCRound, entry: SCTxn, txId: string): Attribution | undefined {
  const descendants = descendantsOf(answer, entry.path);
  if (!descendants.length) return undefined;
  return { of: attribute(entry, descendants), innerHref: innerHrefOf(txId) };
}

/**
 * A transaction's changes by who made them: those of its own code alone
 * (exact), then each direct inner transaction's, its own inner transactions'
 * included.
 */
function ByTransaction({ answer, entry, txId, round }: { answer: SCRound; entry: SCTxn; txId: string; round: number }) {
  const { own, mixed, children } = useMemo(() => {
    const descendants = descendantsOf(answer, entry.path);
    const of = attribute(entry, descendants);
    const own = entry.changes.filter((c) => !of.get(changeId(c))!.via.length);
    const mixed = entry.changes.filter((c) => { const a = of.get(changeId(c))!; return a.own && a.via.length; }).length;
    const children = childrenOf(descendants, entry.path).map((child) => ({
      child,
      nested: descendantsOf(answer, child.path).length > 0,
      attribution: attributionOf(answer, child, txId),
    }));
    return { own, mixed, children };
  }, [answer, entry, txId]);
  const innerHref = innerHrefOf(txId);

  return (
    <div className="space-y-5">
      <div>
        <div className="text-sm text-muted-foreground mb-2">This call</div>
        <TxnStateChangesView changes={own} round={round} empty="No changes of its own outside its inner transactions" />
        {mixed ? (
          <div className="mt-2 text-xs text-muted-foreground">
            It also changed {mixed.toLocaleString()} {mixed === 1 ? "key" : "keys"} its inner transactions changed too, shown under Net.
          </div>
        ) : null}
      </div>
      {children.map(({ child, nested, attribution }) => {
        const label = explorerInnerPath(child.path);
        return (
          <div key={label} className="border-l-2 border-border pl-4">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2 text-sm">
              <Link href={innerHref(child.path)}>Inner transaction {label}</Link>
              {nested ? <span className="text-xs text-muted-foreground">including its inner transactions</span> : null}
            </div>
            <TxnStateChangesView changes={child.changes} round={round} attribution={attribution} />
          </div>
        );
      })}
    </div>
  );
}

function ViewSwitch({ byTxn, setByTxn }: { byTxn: boolean; setByTxn: (v: boolean) => void }) {
  const option = (active: boolean, label: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className={cn("px-2.5 py-0.5 cursor-pointer", active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground")}
    >
      {label}
    </button>
  );
  return (
    <span className="ml-auto inline-flex text-xs border border-border rounded overflow-hidden">
      {option(!byTxn, "Net", () => setByTxn(false))}
      {option(byTxn, "By transaction", () => setByTxn(true))}
    </span>
  );
}

/**
 * An app call's exact effect on app state, from the time-travel node's
 * per-transaction state changes: each global key, local key and box it
 * changed, before → after this transaction. With inner transactions that
 * changed state, each change says who made it, and a switch splits them by
 * transaction. Where the node doesn't serve them, or fails to, `fallback`
 * (the apply data's deltas and the round's net change) shows instead.
 */
export default function AppCallTxnExactStateChanges({
  target,
  hasInnerTxns,
  fallback,
  embedded = false,
}: {
  target: StateChangesTarget;
  hasInnerTxns: boolean;
  fallback: React.ReactNode;
  /** In a tab that names it: no card, no title. */
  embedded?: boolean;
}): JSX.Element | null {
  const caps = useStateChangesCaps();
  const { supported } = caps;
  // The same request as the page's Changes card, so they share it.
  const { data, error, isLoading } = useTxnStateChanges(target.round, [target.txId], caps);
  const [byTxn, setByTxn] = usePersistenBooleanState("txn-state-changes-by-txn", false);

  const txn = useMemo(() => (data ? findTxn(data, target.txId, target.innerPath) : undefined), [data, target.txId, target.innerPath]);
  const attribution = useMemo(() => (data && txn ? attributionOf(data, txn, target.txId) : undefined), [data, txn, target.txId]);

  // While the node's support is being checked, the apply data's deltas.
  if (!supported) return <>{fallback}</>;
  if (error) {
    return (
      <>
        <div className={cn("text-xs text-muted-foreground", !embedded && "mt-6")} title={(error as Error).message}>
          Exact state changes unavailable: {(error as Error).message}
        </div>
        {fallback}
      </>
    );
  }

  return (
    <div className={embedded ? undefined : "mt-6 rounded-lg p-5 bg-background-card"}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2 mb-4">
        {embedded ? null : <span className="text-muted-foreground">State changes</span>}
        <span className="text-xs text-muted-foreground">
          before → after this transaction{hasInnerTxns ? ", including any inner transactions" : ""}
        </span>
        {attribution ? <ViewSwitch byTxn={byTxn} setByTxn={setByTxn} /> : null}
      </div>
      {isLoading || !data ? (
        <Pending className="h-5 w-48" />
      ) : !txn ? (
        <div className="text-sm text-muted-foreground">Unknown: the node's answer doesn't say where this transaction is in the block.</div>
      ) : attribution && byTxn ? (
        <ByTransaction answer={data} entry={txn} txId={target.txId} round={target.round} />
      ) : (
        <TxnStateChangesView changes={txn.changes} round={target.round} attribution={attribution} />
      )}
    </div>
  );
}
