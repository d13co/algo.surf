import type { RetryOptions, RetryPolicy, RetryWait } from "algosdk";

/**
 * The requests that are waiting to be retried, for RetryWaitToast. The
 * retrying clients (time travel, algod, indexer) report each wait through
 * their retry policy's `onWait` (see retryOptions); a wait stays here until
 * its retry starts (`until`). A RetryWait names the path but not the host, so
 * each client's closure adds which one it is.
 */

export type RetrySource = "time-travel" | "algod" | "indexer";

export type SourcedRetryWait = RetryWait & { source: RetrySource };

const active = new Set<SourcedRetryWait>();
const listeners = new Set<() => void>();
let snapshot: readonly SourcedRetryWait[] = [];

function emit() {
  snapshot = [...active];
  listeners.forEach((listener) => listener());
}

/** Records a wait until its retry starts. Retries that don't wait are not shown. */
export function reportRetryWait(source: RetrySource, wait: RetryWait): void {
  if (wait.delayMs <= 0) return;
  const entry = { ...wait, source };
  active.add(entry);
  emit();
  setTimeout(() => {
    active.delete(entry);
    emit();
  }, Math.max(0, wait.until - Date.now()));
}

/** Calls `listener` whenever a wait starts or ends. */
export function subscribeRetryWaits(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The waits now: the same array until one starts or ends. */
export function getRetryWaits(): readonly SourcedRetryWait[] {
  return snapshot;
}

/** A client's retry options: the default policy with `policy`'s changes, reporting its waits as `source`. */
export function retryOptions(source: RetrySource, policy?: Partial<RetryPolicy>): Exclude<RetryOptions, false> {
  return { ...policy, onWait: (wait) => reportRetryWait(source, wait) };
}
