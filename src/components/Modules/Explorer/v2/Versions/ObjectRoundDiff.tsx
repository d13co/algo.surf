import { useMemo } from "react";
import { useObjectAt } from "src/hooks/useTimeTravel";
import { BaselineContext, ObjRef, summarizeObject } from "src/utils/versionDelta";
import { cn } from "src/lib/utils";
import { Chip } from "src/components/v2/Chips";
import { ObjectDiffTree, StatusChip } from "./VersionChanges";

/** A pulsing placeholder. */
export function Pending({ className }: { className: string }) {
  return <div className={cn("rounded bg-muted animate-pulse", className)} />;
}

/**
 * What round `round` did to one object: its state at `round - 1` and at
 * `round`, read from the time-travel node and diffed (see summarizeObject).
 */
export default function ObjectRoundDiff({
  ctx,
  objRef,
  round,
  unchangedLabel,
}: {
  ctx: BaselineContext;
  objRef: ObjRef;
  round: number;
  /** What to call an object whose state is the same at both rounds (default: "no change"). */
  unchangedLabel?: string;
}) {
  const before = useObjectAt(ctx, objRef, round - 1);
  const after = useObjectAt(ctx, objRef, round);
  const error = before.error ?? after.error;
  const summary = useMemo(
    () =>
      summarizeObject({
        key: "object",
        ref: objRef,
        before: before.state,
        after: after.state ?? null,
        baselineError: error ? (error as Error).message : undefined,
      }),
    [objRef, before.state, after.state, error],
  );
  if (after.state === undefined && !error) return <Pending className="h-5 w-48" />;
  return (
    <div className="flex flex-col gap-1.5">
      <div>
        {summary.status === "pending" ? (
          <Pending className="h-5 w-24" />
        ) : summary.status === "unchanged" && unchangedLabel ? (
          <Chip className="border-muted text-muted-foreground">{unchangedLabel}</Chip>
        ) : (
          <StatusChip summary={summary} />
        )}
      </div>
      {summary.changes.length ? <ObjectDiffTree summary={summary} /> : null}
    </div>
  );
}
