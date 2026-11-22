import React, { useMemo } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, FileCode2 } from "lucide-react";
import { CoreTransaction } from "src/packages/core-sdk/classes/core/CoreTransaction";
import { useTransaction } from "src/hooks/useTransaction";
import { useGroup } from "src/hooks/useGroup";
import { useDevIncludes, useTxnDevInfo } from "src/hooks/useTxnDevInfo";
import useTitle from "src/components/Common/UseTitle/UseTitle";
import LoadingTile from "src/components/v2/LoadingTile";
import { Button } from "src/components/v2/ui/button";
import LinkToBlock from "../Links/LinkToBlock";
import Link from "../Links/Link";
import Logo from "../../Header/Logo";
import TraceStepper from "./Sections/TraceStepper";

function Notice({ children, error }: { children: React.ReactNode; error?: boolean }) {
  return <div className={`mt-6 rounded-lg p-5 bg-background-card text-sm ${error ? "text-red-400" : "text-muted-foreground"}`}>{children}</div>;
}

/**
 * /debug/:id: step-through debugging of a transaction's programs, and its
 * group's, from the time-travel node's opcode traces of its block. Fills the
 * window, under its own header in place of the site's.
 */
export default function TraceDebug(): JSX.Element {
  const { id = "" } = useParams();
  useTitle(`Debug ${id}`);
  const navigate = useNavigate();
  const { search } = useLocation();
  // Back to where the debugger was opened from: the router's own history entries count up from 0
  // in this tab. Opened directly (nothing of the site's to go back to), to its transaction instead,
  // in place of this entry so the browser's back doesn't return here.
  const back = () =>
    ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0
      ? navigate(-1)
      : navigate({ pathname: `/transaction/${id}`, search }, { replace: true });
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
      {/* The site header's size and look: its icon buttons, and the logo as its nav shows it.
          The text sits on one baseline (centered, the smaller text rides high); the button centers on its line. */}
      <header className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
        <button
          type="button"
          onClick={back}
          title="Back"
          aria-label="Back"
          className="-ml-3 inline-flex h-12 w-12 shrink-0 self-center items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring header:h-9 header:w-9"
        >
          <ArrowLeft className="h-7 w-7 header:h-6 header:w-6" strokeWidth={1.75} />
        </button>
        <Link href="/" noStyle className="-ml-3 inline-flex h-12 items-center px-3 py-2 text-base text-muted-foreground header:h-auto">
          <Logo label="debugger" />
        </Link>
        {/* Shrinks rather than wrapping, down to a few characters, cut in the middle: the head
            truncates and the tail stays. Copying it still gives the whole id. */}
        <Link href={`/transaction/${id}`} title={id} className="flex min-w-0 max-w-max grow basis-[14ch] text-sm">
          <span className="truncate">{id.slice(0, -5)}</span>
          <span className="shrink-0">{id.slice(-5)}</span>
        </Link>
        {round ? (
          <span className="whitespace-nowrap text-sm text-muted-foreground">
            block <LinkToBlock id={round} />
            {groupTxids.length > 1 ? ` · group of ${groupTxids.length}` : ""}
          </span>
        ) : null}
        <Button asChild size="sm" className="ml-auto self-center">
          <Link href="/debug/contracts" noStyle keepRound={false} target="_blank" rel="noopener" title="The contracts (ARC-56 specs, maps and source files) the debugger matches with programs (opens in a new tab)">
            <FileCode2 />
            Contracts
          </Link>
        </Button>
      </header>
      {body}
    </div>
  );
}
