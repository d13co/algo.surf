/**
 * At most `n` calls of `fn` in flight at once, first come first served. A call whose `signal` aborts
 * rejects with the signal's reason and gives up its place: while it waits, it leaves the queue; while it
 * runs, its slot goes to the next call at once, even if `fn` itself can't be stopped (a read that hangs
 * after its page went away must not hold up the next page's). Its result, when it comes, is dropped.
 */
export function createLimit(n: number) {
  if (!Number.isInteger(n) || n < 1) throw new RangeError(`createLimit: n must be a whole number from 1, not ${n}`);
  let active = 0;
  const waiting: { start: () => void; signal?: AbortSignal; onAbort?: () => void }[] = [];

  const release = () => {
    const next = waiting.shift();
    if (next) {
      next.signal?.removeEventListener("abort", next.onAbort!);
      next.start(); // the slot passes straight to the next call
    } else active--;
  };

  return async function run<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    signal?.throwIfAborted();
    if (active >= n) {
      await new Promise<void>((resolve, reject) => {
        const w: (typeof waiting)[number] = { start: resolve, signal };
        if (signal) {
          w.onAbort = () => {
            const k = waiting.indexOf(w);
            if (k >= 0) waiting.splice(k, 1);
            reject(signal.reason);
          };
          signal.addEventListener("abort", w.onAbort, { once: true });
        }
        waiting.push(w);
      });
    } else active++;
    let onAbort: (() => void) | undefined;
    try {
      // Aborted as its turn came (after the hand-off, before this resumed): give the slot back unused.
      signal?.throwIfAborted();
      if (!signal) return await fn();
      const aborted = new Promise<never>((_, reject) => {
        onAbort = () => reject(signal.reason);
        signal.addEventListener("abort", onAbort, { once: true });
      });
      const running = fn();
      running.catch(() => {}); // abandoned on abort: its failure, if any, goes nowhere
      return await Promise.race([running, aborted]);
    } finally {
      if (onAbort) signal!.removeEventListener("abort", onAbort);
      release();
    }
  };
}
