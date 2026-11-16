import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { InfiniteData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import explorer from "src/utils/dappflow";
import { BlockClient } from "src/packages/core-sdk/clients/blockClient";
import type { ListOrder } from "src/components/v2/ListOrderToggle";

/** Ids to look back over first: on mainnet, ~100 assets or apps. */
const FIRST_WINDOW = 100_000;
/** How much wider the first retry looks when a window holds too few: a burst may be just past it. */
const WIDEN = 2;
/** How much wider each later retry looks: a sparse network needs to cover ground fast. */
const WIDEN_MORE = 4;
/** The most to ask the indexer for at once (its default cap). */
const BATCH = 1000;

/**
 * One indexer page of created things, ids ascending, listed after `next`;
 * with `includeAll`, the deleted ones too.
 */
export type FetchAfter<T> = (
  next: string | undefined,
  limit: number,
  options: { signal?: AbortSignal; includeAll?: boolean },
) => Promise<{ items: T[]; nextToken?: string }>;

type LatestPage<T> = {
  /** Newest first */
  items: T[];
  /** The lowest id this page looked at: the next page ends below it. */
  lower: number;
  /** The window that filled this page, to start the next one with. */
  window: number;
};

type LatestParam = { upper: number; window: number } | undefined;

/**
 * Everything with an id in [lower, upper), oldest first. A short batch does
 * not mean the end (the indexer may cap the limit lower than asked), so this
 * stops only at an empty batch or an id past the range.
 */
async function collect<T>(
  lower: number,
  upper: number,
  fetchAfter: FetchAfter<T>,
  idOf: (item: T) => number,
  signal?: AbortSignal,
): Promise<T[]> {
  const items: T[] = [];
  let after = lower - 1;
  for (;;) {
    // Deleted ones too: they were still created
    const { items: batch } = await fetchAfter(after >= 0 ? String(after) : undefined, BATCH, {
      signal,
      includeAll: true,
    });
    if (!batch.length) return items;
    for (const item of batch) {
      if (idOf(item) >= upper) return items;
      items.push(item);
    }
    const last = idOf(batch[batch.length - 1]);
    // An indexer that didn't move past `after` would repeat this batch forever
    if (last <= after) throw new Error(`The indexer listed id ${last} again after ${after}`);
    after = last;
  }
}

/**
 * The assets or apps created on this network, in either order, deleted ones
 * included.
 *
 * Oldest first is the indexer's own order. Latest first is not one the
 * indexer has, but asset and app ids come from the ledger's transaction
 * counter: everything created by a round has an id at most the counter then.
 * So each latest page lists the ids in a window below the last, widening it
 * until it holds a page's worth. With `round`, latest is as of that round.
 */
export function useCreatedList<T>({
  kind,
  order,
  round,
  pageSize,
  fetchAfter,
  idOf,
}: {
  kind: "assets" | "applications";
  order: ListOrder;
  round?: number;
  pageSize: number;
  fetchAfter: FetchAfter<T>;
  idOf: (item: T) => number;
}) {
  const queryClient = useQueryClient();

  /** One past the highest id created by `round`: its transaction counter, read once per round. */
  const upperAt = useCallback(
    async (round: number, signal?: AbortSignal) =>
      (await queryClient.fetchQuery({
        queryKey: ["txn-counter", round],
        queryFn: () => new BlockClient(explorer.network).txnCounter(round, signal),
        staleTime: Infinity,
      })) + 1,
    [queryClient],
  );

  const oldest = useInfiniteQuery({
    queryKey: ["created-list", kind, "oldest", round ?? "live"],
    enabled: order === "oldest",
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) => {
      // Deleted ones too, as Latest lists them
      const [page, upper] = await Promise.all([
        fetchAfter(pageParam, pageSize, { signal, includeAll: true }),
        round === undefined ? Infinity : upperAt(round, signal),
      ]);
      // At a round, only what existed by then: the first id past it ends the list
      const items = page.items.filter((item) => idOf(item) < upper);
      return items.length < page.items.length ? { items } : page;
    },
    // The indexer can return a next-token even on the final (short) page, so
    // only treat it as a real next page when the page came back full.
    getNextPageParam: (last) =>
      last.items.length >= pageSize ? last.nextToken || undefined : undefined,
  });

  /** A latest-first page: without `pageParam`, the first, from the transaction counter. */
  const fetchLatest = useCallback(
    async (pageParam: LatestParam, signal?: AbortSignal): Promise<LatestPage<T>> => {
      const upper =
        pageParam?.upper ??
        (round === undefined
          ? (await new BlockClient(explorer.network).txnCounter(undefined, signal)) + 1
          : await upperAt(round, signal));
      let window = pageParam?.window ?? FIRST_WINDOW;
      // Widening only fetches the part of the window not yet seen
      let items: T[] = [];
      let lower = upper;
      for (let retry = 0; ; retry++) {
        const wider = Math.max(1, upper - window);
        items = [...(await collect(wider, lower, fetchAfter, idOf, signal)), ...items];
        lower = wider;
        if (items.length >= pageSize || lower === 1) break;
        window *= retry === 0 ? WIDEN : WIDEN_MORE;
      }
      // A window that held far more than a page is too wide for the next one
      const nextWindow =
        items.length > WIDEN_MORE * pageSize ? Math.max(1000, Math.floor(window / WIDEN_MORE)) : window;
      return { items: items.reverse(), lower, window: nextWindow };
    },
    [round, pageSize, fetchAfter, idOf, upperAt],
  );

  const latestKey = useMemo(
    () => ["created-list", kind, "latest", round ?? "live"],
    [kind, round],
  );
  const latest = useInfiniteQuery({
    queryKey: latestKey,
    enabled: order === "latest",
    // New rows land at the top: only the reload button brings them in, so the
    // rows don't move under the reader
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    initialPageParam: undefined as LatestParam,
    queryFn: ({ pageParam, signal }) => fetchLatest(pageParam, signal),
    getNextPageParam: (last): LatestParam =>
      last.lower > 1 ? { upper: last.lower, window: last.window } : undefined,
  });

  /**
   * Latest: look again from the transaction counter now. The rows loaded so
   * far stay up while it loads, and stay if it fails; once it is in, the list
   * starts over from that one page (older ones follow on from it). Resolves
   * true if it replaced the list.
   */
  const [reloading, setReloading] = useState(false);
  const [reloadError, setReloadError] = useState<Error | null>(null);
  const reloadAbort = useRef<AbortController>();
  useEffect(() => {
    setReloadError(null);
    // Leaving the list, or another round's list, stops a reload of this one
    return () => reloadAbort.current?.abort();
  }, [latestKey]);

  const reload = useCallback(async (): Promise<boolean> => {
    reloadAbort.current?.abort();
    const abort = new AbortController();
    reloadAbort.current = abort;
    setReloading(true);
    setReloadError(null);
    try {
      // A page still coming would land on top of the new list
      await queryClient.cancelQueries({ queryKey: latestKey, exact: true });
      const first = await fetchLatest(undefined, abort.signal);
      if (abort.signal.aborted) return false;
      queryClient.setQueryData<InfiniteData<LatestPage<T>, LatestParam>>(latestKey, {
        pages: [first],
        pageParams: [undefined],
      });
      return true;
    } catch (e) {
      if (!abort.signal.aborted) setReloadError(e as Error);
      return false;
    } finally {
      // Unless another reload took over
      if (reloadAbort.current === abort) setReloading(false);
    }
  }, [queryClient, latestKey, fetchLatest]);

  const items = useMemo(
    () =>
      order === "latest"
        ? latest.data?.pages.flatMap((p) => p.items)
        : oldest.data?.pages.flatMap((p) => p.items),
    [order, latest.data, oldest.data],
  );
  const active = order === "latest" ? latest : oldest;
  const isLatest = order === "latest";
  return {
    items,
    fetchNextPage: active.fetchNextPage,
    hasNextPage: active.hasNextPage,
    isFetchingNextPage: active.isFetchingNextPage,
    error: active.error ?? (isLatest ? reloadError : null),
    reload,
    reloading: isLatest && reloading,
  };
}
