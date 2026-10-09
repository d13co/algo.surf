import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, History, Loader2 } from "lucide-react";
import { useHotkeys } from "react-hotkeys-hook";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "src/components/v2/ui/dialog";
import { Button } from "src/components/v2/ui/button";
import JsonViewer from "src/components/v2/JsonViewer";
import MultiDateViewer from "src/components/v2/MultiDateViewer";
import TabsUnderline from "src/components/v2/shadcn-studio/tabs/tabs-11";
import { toPlainJson } from "src/packages/core-sdk/utils/serialize";
import type { VersionsOrder } from "src/utils/timeTravel";
import { objKindLabel, summarizeObject, VersionRow } from "src/utils/versionDelta";
import Link from "../Links/Link";
import LinkToBlock from "../Links/LinkToBlock";
import { ObjectDiffTree, ObjectLabel, StateHref, StatusChip } from "./VersionChanges";

type View = "changes" | "full";

/**
 * One version in full: each object it touched, either as its changes or as
 * its whole state with the changes highlighted. ← / → step to the previous /
 * next version in the list, loading the next batch at the end of it.
 */
export default function VersionDetailsDialog<V>({
  rows,
  index,
  onIndexChange,
  hasMore,
  fetchMore,
  isFetchingMore,
  fetchMoreFailed,
  order,
  label,
  stateHref,
  filenamePrefix,
}: {
  rows: VersionRow<V>[];
  index: number | null;
  onIndexChange: (index: number | null) => void;
  hasMore: boolean;
  fetchMore: () => void;
  isFetchingMore: boolean;
  fetchMoreFailed: boolean;
  order: VersionsOrder;
  label: ObjectLabel;
  stateHref: StateHref;
  filenamePrefix: string;
}) {
  const [view, setView] = useState<View>("changes");
  // Stepping past the last loaded version waits for the next batch.
  const [awaitingMore, setAwaitingMore] = useState(false);
  const [prevTitle, nextTitle] = order === "desc" ? ["Newer version (←)", "Older version (→)"] : ["Older version (←)", "Newer version (→)"];

  const row = index === null ? undefined : rows[index];
  const summaries = useMemo(() => row?.objects.map(summarizeObject) ?? [], [row]);

  const canPrev = index !== null && index > 0;
  const canNext = index !== null && (index < rows.length - 1 || hasMore);
  // Stepping on again retries.
  const moreFailed = awaitingMore && fetchMoreFailed && !isFetchingMore;

  useEffect(() => {
    if (awaitingMore && index !== null && index < rows.length - 1) {
      setAwaitingMore(false);
      onIndexChange(index + 1);
    }
  }, [awaitingMore, rows.length, index, onIndexChange]);

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

  function close() {
    setAwaitingMore(false);
    onIndexChange(null);
  }

  return (
    <Dialog open={!!row} onOpenChange={(open) => !open && close()}>
      <DialogContent aria-describedby={undefined} className="max-w-4xl max-h-[90vh] flex flex-col bg-background-muted text-foreground">
        <DialogHeader>
          <DialogTitle className="text-lg font-normal">Version at round {row ? <LinkToBlock id={row.round} /> : null}</DialogTitle>
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
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="border-border text-primary hover:bg-primary/10" asChild>
                  <Link noStyle href={stateHref(row.round)} title="The page as it was at this round">
                    <History />
                    Rewind
                  </Link>
                </Button>
                <JsonViewer
                  title={`Version at round ${row.round}`}
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
              {summaries.map((s) => (
                <section key={s.key}>
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="text-muted-foreground">{label ? label(s.ref) : objKindLabel[s.ref.kind]}</span>
                    <StatusChip summary={s} />
                    {label ? (
                      <Link href={stateHref(row.round, s.ref)} className="text-xs" title="Where the page shows this, as it was at this round">
                        <History size={12} className="inline -mt-0.5 mr-1" />
                        rewind
                      </Link>
                    ) : null}
                  </div>
                  {s.status === "pending" ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : s.status === "error" ? (
                    <span className="text-red-400">Previous state unavailable: {s.error}</span>
                  ) : view === "changes" ? (
                    s.changes.length ? (
                      <ObjectDiffTree key={row.round} summary={s} collapseDepth={2} maxChildren={Infinity} truncateAt={120} />
                    ) : (
                      <span className="text-muted-foreground">No field changes</span>
                    )
                  ) : (
                    <ObjectDiffTree key={row.round} summary={s} full collapseDepth={1} maxChildren={Infinity} truncateAt={120} />
                  )}
                </section>
              ))}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
