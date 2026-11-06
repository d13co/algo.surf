import { useEffect, useMemo, useState } from "react";
import type { RetryWaitReason } from "algosdk";
import {
  getRetryWaits,
  subscribeRetryWaits,
  type RetrySource,
  type SourcedRetryWait,
} from "../../utils/retryWaits";

const SOURCE_LABEL: Record<RetrySource, string> = {
  "time-travel": "The time-travel node",
  algod: "The algod node",
  indexer: "The indexer",
};

const REASON_TEXT: Record<RetryWaitReason, string> = {
  "rate-limited": "is rate limiting requests",
  "node-busy": "is busy",
  "server-error": "returned an error",
  network: "can't be reached",
};

/** How long the toast stays up after the last wait ends. */
const LINGER_MS = 2000;

/** The waits now, re-rendering as they start and end. */
function useRetryWaits(): readonly SourcedRetryWait[] {
  const [waits, setWaits] = useState(getRetryWaits);
  useEffect(() => {
    setWaits(getRetryWaits());
    return subscribeRetryWaits(() => setWaits(getRetryWaits()));
  }, []);
  return waits;
}

/** The waits of one client for one reason, shown as one line. */
type Line = { key: string; text: string; until: number; count: number; detail: string };

function toLines(waits: readonly SourcedRetryWait[]): Line[] {
  const groups = new Map<string, { line: Line; latest: SourcedRetryWait }>();
  for (const wait of waits) {
    const key = `${wait.source}:${wait.reason}`;
    const group = groups.get(key);
    if (!group) {
      const text = `${SOURCE_LABEL[wait.source]} ${REASON_TEXT[wait.reason]}`;
      groups.set(key, { line: { key, text, until: wait.until, count: 1, detail: "" }, latest: wait });
    } else {
      group.line.count++;
      if (wait.until > group.line.until) {
        group.line.until = wait.until;
        group.latest = wait;
      }
    }
  }
  return [...groups.values()].map(({ line, latest }) => ({
    ...line,
    detail: `Retry ${latest.retry} of ${latest.maxRetries}: ${latest.method.toUpperCase()} ${latest.path}${latest.status ? ` (${latest.status})` : ""}`,
  }));
}

/**
 * One warning toast for requests that wait to be retried: rate limited, a busy
 * node, server or network errors (see retryWaits). Separate from AppSnackbar,
 * so neither hides the other. Dismissing it hides it until the waits are over.
 */
function RetryWaitToast(): JSX.Element | null {
  const waits = useRetryWaits();
  const lines = useMemo(() => toLines(waits), [waits]);
  const active = lines.length > 0;
  const [now, setNow] = useState(Date.now);
  const [lingering, setLingering] = useState<Line[]>([]);
  const [muted, setMuted] = useState(false);

  // a 1 s tick for the countdowns, while anything waits
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);

  // after the last wait, keep the lines up briefly, then unmute for the next burst
  useEffect(() => {
    if (active) {
      setLingering(lines);
      return;
    }
    const timer = setTimeout(() => {
      setLingering([]);
      setMuted(false);
    }, LINGER_MS);
    return () => clearTimeout(timer);
  }, [active, lines]);

  const shown = active ? lines : lingering;
  if (muted || shown.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-[10px] py-4 px-5 sm:min-w-[400px] max-w-[90vw] border border-border border-l-warning border-l-[5px] bg-background-card flex items-start gap-3"
    >
      <div className="grow text-sm flex flex-col gap-1">
        {shown.map((line) => {
          const seconds = active ? Math.ceil((line.until - now) / 1000) : 0;
          return (
            <div key={line.key} title={line.detail}>
              {line.text}: retrying
              {/* hidden from screen readers, which would read it out every second */}
              {seconds > 0 && <span aria-hidden="true"> in {seconds} s</span>}
              {line.count > 1 && <span className="text-muted-foreground"> · {line.count} requests waiting</span>}
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground text-lg leading-none ml-1"
        onClick={() => setMuted(true)}
        aria-label="Dismiss"
      >
        &times;
      </button>
    </div>
  );
}

export default RetryWaitToast;
