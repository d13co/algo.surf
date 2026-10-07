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
}

export type Interval = "hour" | "day" | "week" | "month";

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
    placeholderData: keepPreviousData,
    // Thousands of rows per view and a new key per zoom: keep them out of the whole-cache IndexedDB blob.
    meta: { noPersist: true },
  });
}

const HOUR = 3600;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/** Start of the UTC bucket holding ts, as the API buckets it (weeks start Monday). */
export function bucketStart(interval: Interval, ts: number): number {
  switch (interval) {
    case "hour":
      return ts - (ts % HOUR);
    case "day":
      return ts - (ts % DAY);
    case "week":
      return ts - ((ts - 4 * DAY) % WEEK); // 1970-01-05 was a Monday
    case "month": {
      const d = new Date(ts * 1000);
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000;
    }
  }
}

/** Start of the bucket after the one starting at ts. */
export function bucketEnd(interval: Interval, ts: number): number {
  if (interval !== "month") return ts + { hour: HOUR, day: DAY, week: WEEK }[interval];
  const d = new Date(ts * 1000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / 1000;
}
