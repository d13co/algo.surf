import type { RoundBounds, TTVersionsPage, VersionsOrder } from "src/utils/timeTravel";

/**
 * One version list read from several version feeds of the node (an app's
 * params and its boxes, say), merged by round.
 */

type Versioned = { round: number; timestamp: number };

/** Where a feed is read up to: its next token, and the versions read but not yet listed. */
export type FeedCursor<V> = { started: boolean; done: boolean; next?: string; pending: V[] };

/**
 * Where a merged list is read up to. `max` is the last round it lists: the
 * bounds' or, without one, the lowest round any feed's first page was read
 * at, so no feed lists rounds another has not seen yet.
 */
export type MergedCursor<V> = { feeds: FeedCursor<V>[]; max?: number };

export type MergedPage<V> = { versions: V[]; cursor: MergedCursor<V>; more: boolean };

/** Reads a page of feed `feed`, from `query` (`next`, `min-round`, `max-round`, `order`). */
export type FeedReader<V> = (
  feed: number,
  query: { next?: string; "min-round"?: number; "max-round"?: number; order: VersionsOrder },
) => Promise<TTVersionsPage<V>>;

/**
 * The next page of `feedCount` feeds merged, in `order`, from `cursor`
 * (undefined for the first). A feed has listed every version before its next
 * token (in its order); a round is listed once every feed has, with each
 * feed's changes in it merged into one version. Each call reads the feeds
 * furthest behind, so every page moves the list on.
 */
export async function readMergedPage<V extends Versioned>(
  feedCount: number,
  read: FeedReader<V>,
  bounds: RoundBounds,
  order: VersionsOrder,
  cursor: MergedCursor<V> | undefined,
): Promise<MergedPage<V>> {
  const desc = order === "desc";
  // The round before which (in `order`) a feed has listed everything.
  const reach = (f: FeedCursor<V>) =>
    !f.started ? (desc ? Infinity : -Infinity) : f.done ? (desc ? -Infinity : Infinity) : Number(f.next);
  const frontier = (fs: FeedCursor<V>[]) => (desc ? Math.max(...fs.map(reach)) : Math.min(...fs.map(reach)));

  const state: MergedCursor<V> = cursor ?? {
    feeds: Array.from({ length: feedCount }, () => ({ started: false, done: false, pending: [] })),
    max: bounds.max,
  };
  const behind = frontier(state.feeds);
  const pages = await Promise.all(
    state.feeds.map((f, i) =>
      !f.done && reach(f) === behind
        ? read(i, { next: f.next, "min-round": bounds.min, "max-round": state.max, order })
        : null,
    ),
  );
  const max = state.max ?? Math.min(...pages.flatMap((p) => (p ? [p.round] : [])));

  const feeds = state.feeds.map((f, i): FeedCursor<V> => {
    const page = pages[i];
    if (!page) return f;
    const next = page["next-token"] || undefined;
    return {
      started: true,
      // Ascending, a feed whose first page was read past `max` is done there.
      done: next === undefined || (!desc && Number(next) > max),
      next,
      pending: [...f.pending, ...page.versions.filter((v) => v.round <= max)],
    };
  });

  const upTo = frontier(feeds);
  const listed = (v: V) => (desc ? v.round > upTo : v.round < upTo);
  const byRound = new Map<number, V>();
  for (const v of feeds.flatMap((f) => f.pending.filter(listed))) {
    byRound.set(v.round, { ...byRound.get(v.round), ...v });
  }
  const versions = [...byRound.values()].sort((a, b) => (desc ? b.round - a.round : a.round - b.round));
  const left = feeds.map((f) => ({ ...f, pending: f.pending.filter((v) => !listed(v)) }));
  return { versions, cursor: { feeds: left, max }, more: left.some((f) => !f.done || f.pending.length > 0) };
}
