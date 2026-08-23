import type { QueryKey } from "@tanstack/react-query";

/**
 * Persistence policy for the React Query IndexedDB cache.
 *
 * Shared by the save side (shouldDehydrateQuery in AppRouter) and the restore
 * side (query-persister), so an entry that would not be written is also not
 * read back. Cross-session retention lives here rather than in per-hook
 * gcTime: hydrated queries are rebuilt with the client defaults, so a hook's
 * gcTime never survives a reload anyway.
 */

export const ONE_HOUR = 60 * 60 * 1000;
export const ONE_DAY = 24 * ONE_HOUR;
export const ONE_WEEK = 7 * ONE_DAY;

/**
 * Bump whenever the stored shape or the serializer changes. A mismatched blob
 * is dropped without being deserialized.
 */
export const CACHE_BUSTER = "3";

// Keys whose data never changes once fetched: safe to keep for longer.
const IMMUTABLE_KEYS = new Set(["transaction", "group", "block-hash", "tiny-asset"]);

export function maxEntryAge(queryKey: QueryKey): number {
  return IMMUTABLE_KEYS.has(queryKey[0] as string) ? ONE_WEEK : ONE_DAY;
}

/**
 * Infinite queries carry every fetched page (indexer pages are up to 1000
 * txns each). Detect by data shape: hydrated queries have no hook options.
 */
export function isInfiniteData(data: unknown): boolean {
  if (typeof data !== "object" || data === null) return false;
  const { pages, pageParams } = data as { pages?: unknown; pageParams?: unknown };
  return Array.isArray(pages) && Array.isArray(pageParams);
}

// The fields shared by a live Query and a DehydratedQuery.
type PersistableQuery = {
  queryKey: QueryKey;
  state: { status: string; data?: unknown; dataUpdatedAt: number };
  meta?: Record<string, unknown>;
};

export function isPersistable(query: PersistableQuery, now: number): boolean {
  const { queryKey, state, meta } = query;
  return (
    state.status === "success" &&
    !meta?.noPersist &&
    !isInfiniteData(state.data) &&
    now - state.dataUpdatedAt <= maxEntryAge(queryKey)
  );
}
