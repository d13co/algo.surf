import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useSearchParams } from "react-router-dom";
import { BlockClient } from "src/packages/core-sdk/clients/blockClient";
import explorer from "src/utils/dappflow";
import { RoundBounds } from "src/utils/timeTravel";
import {
  parseVersionFilter,
  parseVersionRange,
  VersionFilter,
  VersionRange,
  withVersionFilter,
  withVersionRange,
} from "src/utils/versionFilter";

/**
 * The version filter in the URL (see versionFilter); undefined where there is
 * none. `objects`: whether the page lists several objects, so `object` applies.
 */
export function useVersionFilter(objects: boolean): VersionFilter | undefined {
  const [searchParams] = useSearchParams();
  const signature = [searchParams.get("object"), ...searchParams.getAll("field")].join("\n");
  // searchParams is a new object on any query change; signature is the part that matters.
  return useMemo(() => parseVersionFilter(searchParams, objects), [signature, objects]);
}

/** Links to this page with another version filter (or none), keeping the rest of its query. */
export function useVersionFilterHref(): (filter: VersionFilter | undefined) => string {
  const { pathname, search } = useLocation();
  return useCallback((filter: VersionFilter | undefined) => withVersionFilter(`${pathname}${search}`, filter), [pathname, search]);
}

/** The version date range in the URL (see VersionRange); undefined where there is none. */
export function useVersionRange(): VersionRange | undefined {
  const [searchParams] = useSearchParams();
  const signature = [searchParams.get("from"), searchParams.get("to")].join("\n");
  // searchParams is a new object on any query change; signature is the part that matters.
  return useMemo(() => parseVersionRange(searchParams), [signature]);
}

/** Links to this page with another version date range (or none), keeping the rest of its query. */
export function useVersionRangeHref(): (range: VersionRange | undefined) => string {
  const { pathname, search } = useLocation();
  return useCallback((range: VersionRange | undefined) => withVersionRange(`${pathname}${search}`, range), [pathname, search]);
}

/** The first round timestamped after `time` (Unix seconds), per the indexer; null where none is yet. */
function useFirstRoundAfter(time: number | undefined) {
  return useQuery({
    queryKey: ["first-round-after", time],
    queryFn: () => new BlockClient(explorer.network).firstRoundAfter(time!),
    enabled: time !== undefined,
    // A later block cannot take an earlier time; only "none yet" can change,
    // so that is read again on next use, and not kept across visits.
    staleTime: (query) => (query.state.data === null ? 0 : Infinity),
    meta: { noPersist: true },
  });
}

/**
 * The rounds of `range`, up to `maxRound` (the round the page shows, if any).
 * `bounds` is undefined while they are being looked up, where that failed
 * (`error`), and where no round is in range: then there is nothing to read.
 */
export function useRangeRounds(
  range: VersionRange | undefined,
  maxRound: number | undefined,
): { bounds: RoundBounds | undefined; isLoading: boolean; error: Error | null } {
  // The first round at `from` or later; the last at `to` or earlier, just before the first after it.
  const first = useFirstRoundAfter(range?.from === undefined ? undefined : range.from - 1);
  const afterLast = useFirstRoundAfter(range?.to);
  return useMemo(() => {
    const lookups = [range?.from !== undefined && first, range?.to !== undefined && afterLast].filter((q): q is typeof first => !!q);
    const error = lookups.find((q) => q.error)?.error ?? null;
    if (error || lookups.some((q) => q.status !== "success")) {
      return { bounds: undefined, isLoading: !error, error };
    }
    const min = range?.from === undefined ? undefined : first.data;
    let max = range?.to === undefined || afterLast.data === null ? maxRound : afterLast.data - 1;
    if (maxRound !== undefined && max !== undefined) max = Math.min(max, maxRound);
    // No round in range: `from` is past the last block, or after `to`, or `to` before the first.
    if (min === null || (max !== undefined && (max < 0 || (min !== undefined && min > max)))) {
      return { bounds: undefined, isLoading: false, error: null };
    }
    return { bounds: { min: min || undefined, max }, isLoading: false, error: null };
    // The query results are new objects every render; these are the parts that matter.
  }, [range, maxRound, first.status, first.data, first.error, afterLast.status, afterLast.data, afterLast.error]);
}
