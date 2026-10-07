import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { network } from "src/packages/core-sdk/constants";

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

const FEES_HOSTS: Record<string, string> = {
  Mainnet: "https://mainnet-fees.d13.co",
};
// REACT_APP_FEES_API points a build at another fees-api, e.g. one on the LAN.
const feesHost = process.env.REACT_APP_FEES_API || FEES_HOSTS[network];
export const feesSupported = !!feesHost;

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${feesHost}${path}`);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

export function useFeeTotal(period: "24h" | "7d" | "30d") {
  return useQuery({
    queryKey: ["fees-total", period],
    queryFn: () => getJson<FeeTotal>(`/v0/fees/${period}`),
    enabled: feesSupported,
    refetchInterval: 60_000,
    // Persisted, each refetch would rewrite the whole IndexedDB cache blob every minute.
    meta: { noPersist: true },
  });
}

/**
 * Buckets over [start, end) in unix seconds, end defaulting to the tip. Pass an interval-aligned start so the key is stable.
 * While a new view loads, data is the previous view's, so it carries the params it was fetched with.
 */
export function useSeries(interval: Interval, start?: number, end?: number) {
  return useQuery({
    queryKey: ["fees-series", { interval, start, end }],
    queryFn: async () => ({
      interval,
      start,
      end,
      buckets: await getJson<Bucket[]>(
        `/v0/series?interval=${interval}${start ? `&start=${start}` : ""}${end ? `&end=${end}` : ""}`,
      ),
    }),
    enabled: feesSupported,
    staleTime: 60_000,
    // Up to ~770 rows per view and a new key per zoom: drop left views after 5 min, not the client's hour.
    gcTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    // Same reason: keep them out of the whole-cache IndexedDB blob.
    meta: { noPersist: true },
  });
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
