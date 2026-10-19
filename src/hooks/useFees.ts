import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { surfIdxGet, surfIdxRetry, surfIdxSupported } from "src/utils/surfIdx";

export interface FeeTotal {
  fees: number;
  blocks: number;
  firstRound: number;
  lastRound: number;
  firstTs: number;
  lastTs: number;
}

/** One /v0/series bucket. fees in microAlgos, txns include inner txns. */
export interface Bucket {
  ts: number;
  fees: number;
  txns: number;
  tps: number;
  blocks: number;
  /** The block's round, block interval only. */
  rnd?: number;
}

/** A block bucket is one block; ts is its timestamp. */
export type Interval = "block" | "minute" | "hour" | "day" | "week" | "month";

export function useFeeTotal(period: "24h" | "7d" | "30d") {
  return useQuery({
    ...surfIdxRetry,
    queryKey: ["fees-total", period],
    queryFn: () => surfIdxGet<FeeTotal>(`/v0/fees/${period}`),
    enabled: surfIdxSupported,
    refetchInterval: 60_000,
    // Refetched every minute: persisted, each refetch would be an IndexedDB write for data that's stale by the next visit.
    meta: { noPersist: true },
  });
}

export interface SeriesView {
  interval: Interval;
  start?: number;
  end?: number;
  buckets: Bucket[];
}

/**
 * Whether prev's buckets from start on are what a fetch of [start, end) would return, but for those from its last bucket
 * on: the same interval and end, and a start that is the same, or later and on a bucket's start, so no bucket of prev is
 * cut by it. A rolling range sliding forward, or a narrower one, then needs only the buckets since prev's last.
 */
export function extendsView(prev: SeriesView, interval: Interval, start?: number, end?: number): boolean {
  if (prev.interval !== interval || prev.end !== end || !prev.buckets.length) return false;
  if (start === prev.start) return true;
  return start !== undefined && (prev.start ?? 0) <= start && bucketStart(interval, start) === start;
}

/** prev as a view from start: a later start drops whole buckets, the same start keeps a first bucket it cuts. */
function sliceView(prev: SeriesView, start?: number): SeriesView {
  if (start === prev.start) return prev;
  return { ...prev, start, buckets: prev.buckets.filter((b) => b.ts >= start!) };
}

// How often a live view refetches: about every other block for blocks, else a small part of a bucket. /v0/series is a
// heavy route (30 a minute per client), so this stays at 12 a minute or fewer.
export const LIVE_POLL_MS: Record<Interval, number> = {
  block: 5_000,
  minute: 10_000,
  hour: 30_000,
  day: 60_000,
  week: 60_000,
  month: 60_000,
};

const seriesUrl = (interval: Interval, start?: number, end?: number) =>
  `/v0/series?interval=${interval}${start ? `&start=${start}` : ""}${end ? `&end=${end}` : ""}`;

/**
 * Buckets over [start, end) in unix seconds, end defaulting to the tip. Pass an interval-aligned start so the key is stable.
 * While a new view loads, data is the previous view's, so it carries the params it was fetched with, unless the previous
 * view extends this one: it then stands in cut to this one's start, with this one's params.
 * live refetches every LIVE_POLL_MS[interval]. A refetch, or a new view the shown one extends (see extendsView), fetches
 * only from the shown view's last bucket on: the chain's past doesn't change, and that bucket may have been partial.
 */
export function useSeries(interval: Interval, start?: number, end?: number, live = false) {
  // The view shown at the last render, the current one or the previous one standing in while this one loads.
  const shown = useRef<SeriesView>();
  const query = useQuery({
    ...surfIdxRetry,
    queryKey: ["fees-series", { interval, start, end }],
    queryFn: async (): Promise<SeriesView> => {
      const prev = shown.current && extendsView(shown.current, interval, start, end) ? sliceView(shown.current, start) : undefined;
      // Blocks can share a second: every bucket from the last one's ts on is fetched again.
      const from = prev?.buckets[prev.buckets.length - 1]?.ts;
      if (from === undefined) {
        return { interval, start, end, buckets: await surfIdxGet<Bucket[]>(seriesUrl(interval, start, end)) };
      }
      const tail = await surfIdxGet<Bucket[]>(seriesUrl(interval, Math.max(from, start ?? 0), end));
      return { interval, start, end, buckets: [...prev!.buckets.filter((b) => b.ts < from), ...tail] };
    },
    enabled: surfIdxSupported,
    staleTime: live ? LIVE_POLL_MS[interval] : 60_000,
    refetchInterval: live ? LIVE_POLL_MS[interval] : false,
    // Live, showing the tab again doesn't refetch: the next poll, at most one away, does. A refocus refetch would take
    // one more of the client's 30 heavy requests a minute, and be wasted when the page then slides onto a new key.
    refetchOnWindowFocus: !live,
    // A view this one extends stands in as this one, from its start; any other as it is.
    placeholderData: (prev) => (prev && extendsView(prev, interval, start, end) ? sliceView(prev, start) : prev),
    // Up to ~770 rows per view and a new key per zoom: drop left views after 5 min, not the client's hour.
    gcTime: 5 * 60_000,
    // Same reason, and each zoom's key would leave its own entry in IndexedDB until it expires.
    meta: { noPersist: true },
  });
  // In v5 a placeholder stands in only while pending: a view whose first fetch failed, e.g. a live rolling range that
  // slid onto a new key while offline, would have no data. It keeps showing the view it extends instead.
  const data =
    query.data ??
    (query.error && shown.current && extendsView(shown.current, interval, start, end)
      ? sliceView(shown.current, start)
      : undefined);
  if (data) shown.current = data;
  return { data, isPlaceholderData: query.isPlaceholderData, error: query.error };
}

const HOUR = 3600;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
// A block bucket starts and ends on its timestamp's second.
const SECONDS = { block: 1, minute: 60, hour: HOUR, day: DAY, week: WEEK };

/** Start of the UTC bucket holding ts, as the API buckets it (weeks start Monday). */
export function bucketStart(interval: Interval, ts: number): number {
  if (interval !== "month") return ts - ((ts - (interval === "week" ? 4 * DAY : 0)) % SECONDS[interval]); // 1970-01-05 was a Monday
  const d = new Date(ts * 1000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000;
}

/** Start of the bucket after the one starting at ts. */
export function bucketEnd(interval: Interval, ts: number): number {
  if (interval !== "month") return ts + SECONDS[interval];
  const d = new Date(ts * 1000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / 1000;
}
