import React from "react";
import { cn } from "src/lib/utils";

/**
 * An upgrade vote over its window of rounds: yes from the left, no from the right, and a tick at the
 * threshold. The unvoted gap between them is the runway the yes tally has left to reach the tick.
 * Renders nothing without the window size.
 */
export default function VoteBar({
  approvals,
  noVotes,
  voteRounds,
  threshold,
  className,
}: {
  approvals: number;
  noVotes: number | null;
  voteRounds: number | null;
  threshold: number | null;
  className?: string;
}): JSX.Element | null {
  if (!voteRounds) return null;
  const yesPct = Math.min(100, (approvals / voteRounds) * 100);
  const noPct = noVotes != null ? Math.min(100 - yesPct, (noVotes / voteRounds) * 100) : null;
  const thresholdPct = threshold ? Math.min(100, (threshold / voteRounds) * 100) : null;

  return (
    <div className={cn("relative h-1.5 w-full rounded bg-background-muted overflow-hidden", className)}>
      <div className="absolute inset-y-0 left-0 bg-primary" style={{ width: `${yesPct}%` }} />
      {noPct ? <div className="absolute inset-y-0 right-0 bg-secondary" style={{ width: `${noPct}%` }} /> : null}
      {thresholdPct != null ? (
        <div
          className="absolute inset-y-0 w-px bg-foreground/60"
          style={{ left: `${thresholdPct}%` }}
          title={`${threshold?.toLocaleString()} votes needed`}
        />
      ) : null}
    </div>
  );
}
