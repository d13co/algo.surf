import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, ChevronLeft, ChevronRight, History, Loader2 } from "lucide-react";
import { useHotkeys } from "react-hotkeys-hook";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "src/components/v2/ui/dialog";
import { Button } from "src/components/v2/ui/button";
import JsonViewer from "src/components/v2/JsonViewer";
import MultiDateViewer from "src/components/v2/MultiDateViewer";
import TabsUnderline from "src/components/v2/shadcn-studio/tabs/tabs-11";
import { useAccountVersionsAt, useObjectAt } from "src/hooks/useTimeTravel";
import { toPlainJson } from "src/packages/core-sdk/utils/serialize";
import type { VersionsOrder } from "src/utils/timeTravel";
import { BaselineContext, objKindLabel, ObjectSummary, ObjRef, summarizeOthers } from "src/utils/versionDelta";
import type { VersionFilter } from "src/utils/versionFilter";
import Link from "../Links/Link";
import LinkToBlock from "../Links/LinkToBlock";
import {
  FieldHref,
  FilterLink,
  FindTxnsLink,
  ObjectDiffTree,
  ObjectLabel,
  StateHref,
  StatusChip,
  TxnsLink,
  versionTxnsLink,
} from "./VersionChanges";
import type { SummarizedRow } from "./VersionsList";

type View = "changes" | "full";

const ACCOUNT: ObjRef = { kind: "base" };

/** One object in a version: its changes, or its whole state with them. */
function SummarySection({
  summary: s,
  round,
  view,
  label,
  stateHref,
  txnsLink,
  fieldHref,
}: {
  summary: ObjectSummary;
  round: number;
  view: View;
  label: ObjectLabel;
  stateHref: StateHref;
  txnsLink: TxnsLink;
  fieldHref?: FieldHref;
}) {
  return (
    <section>
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <span className="text-muted-foreground">{label ? label(s.ref) : objKindLabel[s.ref.kind]}</span>
        <StatusChip summary={s} />
        {label && fieldHref ? <FilterLink href={fieldHref(s.key)} title="Only the versions that changed this" /> : null}
        {label ? (
          <Link href={stateHref(round, s.ref)} className="text-xs" title="Where the page shows this, as it was at this block">
            <History size={12} className="inline -mt-0.5 mr-1" />
            rewind
          </Link>
        ) : null}
        {label ? <FindTxnsLink {...txnsLink(round, s.ref)} /> : null}
      </div>
      {s.status === "pending" ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : s.status === "error" ? (
        <span className="text-red-400">Previous state unavailable: {s.error}</span>
      ) : view === "changes" ? (
        s.changes.length ? (
          <ObjectDiffTree key={round} summary={s} fieldHref={fieldHref} collapseDepth={2} maxChildren={Infinity} truncateAt={120} />
        ) : (
          <span className="text-muted-foreground">No field changes</span>
        )
      ) : (
        <ObjectDiffTree key={round} summary={s} full fieldHref={fieldHref} collapseDepth={1} maxChildren={Infinity} truncateAt={120} />
      )}
    </section>
  );
}

/**
 * The account itself at `round`, in a version that shows no change to it:
 * the state its holdings, local states and created objects belong to. Only
 * where the version is known to have left it alone (`unchanged`) does it say
 * so: a list filtered to another object does not hold its changes.
 */
function AccountAt({
  ctx,
  round,
  unchanged,
  label,
  stateHref,
  fieldHref,
}: {
  ctx: BaselineContext;
  round: number;
  unchanged: boolean;
  label: ObjectLabel;
  stateHref: StateHref;
  fieldHref?: FieldHref;
}) {
  const { state, error } = useObjectAt(ctx, ACCOUNT, round);
  const summary = useMemo<ObjectSummary | undefined>(
    () => (state === undefined ? undefined : { key: "base", ref: ACCOUNT, status: "unchanged", changes: [], state }),
    [state],
  );
  return (
    <section>
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <span className="text-muted-foreground">{label ? label(ACCOUNT) : objKindLabel.base}</span>
        {summary && unchanged ? <StatusChip summary={summary} /> : null}
        {fieldHref ? <FilterLink href={fieldHref("base")} title="Only the versions that changed this" /> : null}
        <Link href={stateHref(round)} className="text-xs" title="The account page as it was at this block">
          <History size={12} className="inline -mt-0.5 mr-1" />
          rewind
        </Link>
      </div>
      {error ? (
        <span className="text-red-400">Account state unavailable: {error.message}</span>
      ) : !summary ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : summary.state === null ? (
        <span className="text-muted-foreground">No balance at this block</span>
      ) : (
        <ObjectDiffTree key={round} summary={summary} full fieldHref={fieldHref} collapseDepth={1} maxChildren={Infinity} truncateAt={120} />
      )}
    </section>
  );
}

/**
 * One version in full: each object it touched, either as its changes or as
 * its whole state with the changes highlighted. ← / → step to the previous /
 * next version in the list, loading the next batch at the end of it.
 */
export default function VersionDetailsDialog<V>({
  ctx,
  filter,
  showOthers,
  rows,
  index,
  onIndexChange,
  hasMore,
  fetchMore,
  searchPaused = false,
  isFetchingMore,
  fetchMoreFailed,
  order,
  label,
  stateHref,
  txnsLink,
  fieldHref,
  filenamePrefix,
}: {
  ctx: BaselineContext;
  filter?: VersionFilter;
  /** Filtered, show the rest of each version too, apart from what the filter picks. */
  showOthers: boolean;
  rows: SummarizedRow<V>[];
  index: number | null;
  onIndexChange: (index: number | null) => void;
  hasMore: boolean;
  fetchMore: () => void;
  /** Filtered, the list stopped looking for more matches until asked (fetchMore). */
  searchPaused?: boolean;
  isFetchingMore: boolean;
  fetchMoreFailed: boolean;
  order: VersionsOrder;
  label: ObjectLabel;
  stateHref: StateHref;
  txnsLink: TxnsLink;
  fieldHref?: FieldHref;
  filenamePrefix: string;
}) {
  const [view, setView] = useState<View>("changes");
  // Stepping past the last loaded version waits for the next batch.
  const [awaitingMore, setAwaitingMore] = useState(false);
  const [prevTitle, nextTitle] = order === "desc" ? ["Newer version (←)", "Older version (→)"] : ["Older version (←)", "Newer version (→)"];

  const row = index === null ? undefined : rows[index];
  const summaries = row?.summaries ?? [];

  // Filtered to an object, a version holds only its part: the rest is read whole.
  const readWhole = showOthers && !!filter?.object && ctx.kind === "account";
  const wholeRounds = useMemo(() => (readWhole && row ? [row.round] : []), [readWhole, row?.round]);
  const whole = useAccountVersionsAt(ctx, wholeRounds, filter?.object);
  const wholeObjects = row ? whole.byRound.get(row.round) : undefined;
  const wholeError = row ? whole.errors.get(row.round) : undefined;
  // What the filter leaves out: changes to other fields of its objects (their
  // full state shows them anyway), and other objects.
  const others = useMemo<ObjectSummary[]>(
    () =>
      showOthers && filter && row
        ? summarizeOthers(view === "changes" ? row.objects : [], filter.fields, wholeObjects ?? [])
        : [],
    [showOthers, filter, row, view, wholeObjects],
  );

  // Full state of an account version, the account itself is there too -
  // once the rest of the version is in, which may hold it.
  const showAccount =
    view === "full" &&
    ctx.kind === "account" &&
    !(readWhole && !wholeObjects && !wholeError) &&
    ![...summaries, ...others].some((s) => s.ref.kind === "base");
  // Filtered to an object, only the whole version tells whether it changed the account.
  const accountUnchanged = !filter?.object || !!wholeObjects;

  const canPrev = index !== null && index > 0;
  const canNext = index !== null && (index < rows.length - 1 || hasMore);
  // Stepping on again retries.
  const moreFailed = awaitingMore && fetchMoreFailed && !isFetchingMore;

  useEffect(() => {
    if (awaitingMore && index !== null && index < rows.length - 1) {
      setAwaitingMore(false);
      onIndexChange(index + 1);
    } else if (awaitingMore && (searchPaused || (!hasMore && !isFetchingMore))) {
      // Nothing more is coming: none left, or none found before the search paused.
      setAwaitingMore(false);
    }
  }, [awaitingMore, rows.length, index, onIndexChange, searchPaused, hasMore, isFetchingMore]);

  function prev() {
    if (!canPrev) return;
    setAwaitingMore(false);
    onIndexChange(index - 1);
  }

  function next() {
    if (index === null) return;
    if (index < rows.length - 1) {
      onIndexChange(index + 1);
    } else if (hasMore) {
      setAwaitingMore(true);
      if (!isFetchingMore) fetchMore();
    }
  }

  useHotkeys("left", prev, { enabled: index !== null }, [index, canPrev, onIndexChange]);
  useHotkeys("right", next, { enabled: index !== null }, [index, rows.length, hasMore, isFetchingMore, fetchMore, onIndexChange]);

  const sectionProps = { round: row?.round ?? 0, view, label, stateHref, txnsLink, fieldHref };

  function close() {
    setAwaitingMore(false);
    onIndexChange(null);
  }

  return (
    <Dialog open={!!row} onOpenChange={(open) => !open && close()}>
      <DialogContent aria-describedby={undefined} className="max-w-4xl max-h-[90vh] flex flex-col bg-background-muted text-foreground">
        <DialogHeader>
          <DialogTitle className="text-lg font-normal">Version at block {row ? <LinkToBlock id={row.round} /> : null}</DialogTitle>
        </DialogHeader>

        {row ? (
          <div className="text-[13px] flex flex-col min-h-0 gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2">
                <Button variant="muted" size="icon" className="h-8 w-8" disabled={!canPrev} onClick={prev} title={prevTitle}>
                  <ChevronLeft />
                </Button>
                <Button variant="muted" size="icon" className="h-8 w-8" disabled={!canNext} onClick={next} title={nextTitle}>
                  {awaitingMore && !moreFailed ? <Loader2 className="animate-spin" /> : <ChevronRight />}
                </Button>
                <span className="text-muted-foreground">
                  <MultiDateViewer timestamp={row.timestamp} block={row.round} variant="short" />
                </span>
                {moreFailed ? <span className="text-red-400">Could not load more versions</span> : null}
                {searchPaused && index === rows.length - 1 ? (
                  <span className="text-muted-foreground">No more matches so far: → searches on</span>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="border-border text-primary hover:bg-primary/10" asChild>
                  <Link noStyle href={stateHref(row.round)} title="The page as it was at this block">
                    <History />
                    Rewind
                  </Link>
                </Button>
                <Button variant="outline" size="sm" className="border-border text-primary hover:bg-primary/10" asChild>
                  <Link noStyle {...versionTxnsLink(txnsLink, row)}>
                    <ArrowLeftRight />
                    Find txns
                  </Link>
                </Button>
                <JsonViewer
                  title={`Version at block ${row.round}`}
                  filename={`${filenamePrefix}-version-${row.round}.json`}
                  obj={() => toPlainJson(row.version)}
                  dataKey={row.round}
                />
              </div>
            </div>

            <TabsUnderline
              value={view}
              onValueChange={(v) => setView(v as View)}
              activationMode="manual"
              tabs={[
                { name: "Changes", value: "changes" },
                { name: "Full state", value: "full" },
              ]}
            />

            <div className="overflow-y-auto min-h-0 flex flex-col gap-4">
              {showAccount ? (
                <AccountAt
                  ctx={ctx}
                  round={row.round}
                  unchanged={accountUnchanged}
                  label={label}
                  stateHref={stateHref}
                  fieldHref={fieldHref}
                />
              ) : null}
              {summaries.map((s) => (
                <SummarySection key={s.key} summary={s} {...sectionProps} />
              ))}
              {others.length || (readWhole && !wholeObjects) ? (
                <div className="flex flex-col gap-4 border-t border-border pt-3">
                  <span className="text-muted-foreground">Also in this version</span>
                  {wholeError ? (
                    <span className="text-red-400">The rest of this version is unavailable: {wholeError.message}</span>
                  ) : readWhole && !wholeObjects ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : null}
                  {others.map((s) => (
                    <SummarySection key={s.key} summary={s} {...sectionProps} />
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
