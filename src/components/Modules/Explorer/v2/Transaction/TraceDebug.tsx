import React, { useMemo } from "react";
import { useParams } from "react-router-dom";
import { CoreTransaction } from "src/packages/core-sdk/classes/core/CoreTransaction";
import { useTransaction } from "src/hooks/useTransaction";
import { useGroup } from "src/hooks/useGroup";
import { useDevIncludes, useTxnDevInfo } from "src/hooks/useTxnDevInfo";
import useTitle from "src/components/Common/UseTitle/UseTitle";
import LoadingTile from "src/components/v2/LoadingTile";
import LinkToTransaction from "../Links/LinkToTransaction";
import LinkToBlock from "../Links/LinkToBlock";
import TraceStepper from "./Sections/TraceStepper";

function Notice({ children, error }: { children: React.ReactNode; error?: boolean }) {
  return <div className={`mt-6 rounded-lg p-5 bg-background-card text-sm ${error ? "text-red-400" : "text-muted-foreground"}`}>{children}</div>;
}

/**
 * /debug/:id: step-through debugging of a transaction's programs, and its
 * group's, from the time-travel node's opcode traces of its block. Fills the
 * window.
 */
export default function TraceDebug(): JSX.Element {
  const { id = "" } = useParams();
  useTitle(`Debug ${id}`);
  const { data: txn, isLoading: txnLoading, error: txnError } = useTransaction(id);
  const t = useMemo(() => (txn ? new CoreTransaction(txn) : null), [txn]);
  const round = t ? Number(t.getBlock()) : 0;
  const groupId = t?.getGroup() || undefined;

  const includes = useDevIncludes();
  // The budget runs, for the whole group (one pool), name each run's app and cost.
  const { data: groupInfo, isLoading: groupLoading } = useGroup(groupId ?? "", round);
  const groupTxids = (groupInfo?.transactions ?? []).map((x) => x.id ?? "").filter(Boolean);
  const txids = groupId && groupTxids.includes(id) ? groupTxids : [id];
  const { data: budget } = useTxnDevInfo(round, txids, ["budget"], !!includes?.includes("budget") && (!groupId || !groupLoading));
  const { data: dev, isLoading: traceLoading, error: traceError } = useTxnDevInfo(round, [id], ["trace"], !!includes?.includes("trace"));

  let body: React.ReactNode;
  if (txnError) body = <Notice error>{(txnError as Error).message}</Notice>;
  else if (txnLoading || !t || includes === undefined) body = <LoadingTile />;
  else if (!includes.includes("trace")) {
    body = <Notice>The time-travel node doesn't serve opcode traces: they need a dtalgod node with its developer API on.</Notice>;
  } else if (traceError) body = <Notice error>{(traceError as Error).message}</Notice>;
  else if (traceLoading || !dev) body = <LoadingTile />;
  else if (!dev.traces?.some((x) => x.txid === id && Object.keys(x["exec-trace"] ?? {}).length)) {
    body = <Notice>No program ran in this transaction.</Notice>;
  } else {
    // Keyed on the transaction: moving to another starts its position and breakpoints afresh.
    body = <TraceStepper key={id} dev={dev} budget={budget?.budget} txId={id} />;
  }

  return (
    <div className="flex flex-col gap-2 pb-3 lg:min-h-0 lg:flex-1">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 min-w-0">
        <span className="text-xl">Debugger</span>
        <span className="min-w-0 truncate text-sm">
          <LinkToTransaction id={id} />
        </span>
        {round ? (
          <span className="text-sm text-muted-foreground">
            block <LinkToBlock id={round} />
            {groupTxids.length > 1 ? ` · group of ${groupTxids.length}` : ""}
          </span>
        ) : null}
      </div>
      {body}
    </div>
  );
}
