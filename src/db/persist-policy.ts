import type { QueryKey } from "@tanstack/react-query";

/**
 * Persistence policy for the React Query IndexedDB cache.
 *
 * Applied by query-persister's storage on write, on read and in its daily
 * sweep, so an entry that would not be written is also not read back.
 * Cross-session retention lives here rather than in per-hook gcTime, which
 * only bounds the in-memory cache.
 */

export const ONE_HOUR = 60 * 60 * 1000;
export const ONE_DAY = 24 * ONE_HOUR;
export const ONE_WEEK = 7 * ONE_DAY;

/**
 * Bump whenever the stored shape or the serializer changes. A mismatched entry
 * is dropped without being restored.
 */
export const CACHE_BUSTER = "3";

// Keys whose data never changes once fetched: safe to keep for longer.
const IMMUTABLE_KEYS = new Set([
  "transaction", "group", "block-hash", "block-header", "creator-app-info", "tiny-asset",
]);

export function maxEntryAge(queryKey: QueryKey): number {
  return IMMUTABLE_KEYS.has(queryKey[0] as string) ? ONE_WEEK : ONE_DAY;
}

/**
 * Infinite queries carry every fetched page (indexer pages are up to 1000
 * txns each). Detect by data shape: stored entries have no hook options.
 */
export function isInfiniteData(data: unknown): boolean {
  if (typeof data !== "object" || data === null) return false;
  const { pages, pageParams } = data as { pages?: unknown; pageParams?: unknown };
  return Array.isArray(pages) && Array.isArray(pageParams);
}

// The fields shared by a live Query and a PersistedQuery.
type PersistableQuery = {
  queryKey: QueryKey;
  state: { status: string; data?: unknown; dataUpdatedAt: number };
  meta?: Record<string, unknown>;
};

export function isPersistable(query: PersistableQuery, now: number): boolean {
  const { queryKey, state, meta } = query;
  return (
    state.status === "success" &&
    // Only a live query has meta: stored entries were filtered on it at write time.
    !meta?.noPersist &&
    !isInfiniteData(state.data) &&
    now - state.dataUpdatedAt <= maxEntryAge(queryKey)
  );
}
