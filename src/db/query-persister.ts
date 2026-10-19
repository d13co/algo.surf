import { clear, createStore, del, delMany, entries, get, set } from 'idb-keyval'
import {
  experimental_createQueryPersister,
  type AsyncStorage,
  type PersistedQuery,
} from '@tanstack/react-query-persist-client'
import { serializeForIDB, deserializeFromIDB } from './sdk-serializer'
import { CACHE_BUSTER, ONE_DAY, ONE_WEEK, isPersistable } from './persist-policy'

/**
 * Per-query IndexedDB persistence: each query is its own entry, read only when
 * that query first fetches. Nothing is restored up front, so a heavy cache
 * costs a page only the entries it uses.
 *
 * SDK model instances are serialized via toEncodingData() before storage
 * and reconstructed via fromEncodingData() on restore, so that class
 * prototypes (and instanceof checks) survive the IndexedDB round-trip.
 */

const store = createStore('algo-surf-queries', 'queries')

// Raw entries hold SDK models in tagged form: the policy reads only key and state, so it needs no deserialize.
const isLive = (q: PersistedQuery, now: number) => q.buster === CACHE_BUSTER && isPersistable(q, now)

// Never rejects: the persister awaits these before the query's own fetch, even from its catch, so a failure here
// (IndexedDB blocked or unavailable) would fail the query instead of falling back to the network.
const storage: AsyncStorage<PersistedQuery> = {
  getItem: async (key) => {
    try {
      const stored = await get<PersistedQuery>(key, store)
      if (stored && !isLive(stored, Date.now())) {
        await del(key, store)
        return undefined
      }
      return stored
    } catch {
      return undefined
    }
  },
  setItem: async (key, value) => {
    if (!isPersistable(value, Date.now())) return
    try {
      await set(key, value, store)
    } catch (e) {
      console.warn('[query-persister] Failed to persist query:', e)
      // Out of space: drop the cache rather than fail every write from now on.
      if ((e as Error)?.name === 'QuotaExceededError') await clear(store).catch(() => {})
    }
  },
  removeItem: async (key) => {
    try {
      await del(key, store)
    } catch {
      // Nothing to clean up if the store can't be opened.
    }
  },
}

export const persister = experimental_createQueryPersister<PersistedQuery>({
  storage,
  buster: CACHE_BUSTER,
  // Ceiling; per-entry retention is isPersistable (24h / 7d tiers).
  maxAge: ONE_WEEK,
  serialize: (query) => {
    try {
      return serializeForIDB(query) as PersistedQuery
    } catch (e) {
      // The core doesn't catch this (it would be an unhandled rejection). Not a success, so setItem skips it.
      console.warn('[query-persister] Failed to serialize query:', e)
      return { ...query, state: { ...query.state, status: 'error' } }
    }
  },
  deserialize: (stored) => deserializeFromIDB(stored) as PersistedQuery,
  filters: {
    // Infinite queries run every page fetch through the persister: skip them before their pages are serialized.
    predicate: (query) => !query.meta?.noPersist && !('getNextPageParam' in query.options),
  },
}).persisterFn

// Entries are only checked when their query asks for them: sweep the rest out once a day.
const SWEPT_AT_KEY = 'query-persister:sweptAt'

async function sweep(): Promise<void> {
  const now = Date.now()
  // ponytail: reads every entry at once; walk a cursor if the store grows large enough for that to hurt.
  const expired = (await entries<string, PersistedQuery>(store))
    .filter(([, q]) => !isLive(q, now))
    .map(([key]) => key)
  await delMany(expired, store)
  // ponytail: one-time cleanup of the old whole-cache blob; drop after a couple of releases.
  await del('reactQuery_v2')
  localStorage.setItem(SWEPT_AT_KEY, String(now))
}

try {
  // A missing or unreadable timestamp counts as never swept.
  if (Date.now() - (Number(localStorage.getItem(SWEPT_AT_KEY)) || 0) > ONE_DAY) {
    setTimeout(() => sweep().catch((e) => console.warn('[query-persister] Sweep failed:', e)), 10_000)
  }
} catch {
  // No localStorage (e.g. blocked site data): entries still expire as they are read.
}
