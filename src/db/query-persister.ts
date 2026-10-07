import { get, set, del } from 'idb-keyval'
import {
  PersistedClient,
  Persister,
} from '@tanstack/react-query-persist-client'
import { serializeForIDB, deserializeFromIDB } from './sdk-serializer'
import { CACHE_BUSTER, isPersistable } from './persist-policy'

// The queries a client state holds, each as of its last update. Sorted: hydrate can add restored queries after ones
// the page created meanwhile, so the cache's order needn't match the blob's.
const fingerprint = ({ queries, mutations }: PersistedClient['clientState']) =>
  queries.map((q) => `${q.queryHash}@${q.state.dataUpdatedAt}`).sort().join() + `|${mutations.length}`;

/**
 * Creates an Indexed DB persister with debounced writes.
 *
 * SDK model instances are serialized via toEncodingData() before storage
 * and reconstructed via fromEncodingData() on restore, so that class
 * prototypes (and instanceof checks) survive the IndexedDB round-trip.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
 */
export function createIDBPersister(
  idbValidKey: IDBValidKey = 'reactQuery_v2',
  throttleMs = 1000,
): Persister {
  let pendingTimeout: ReturnType<typeof setTimeout> | null = null;
  // The queries the last scheduled write holds, or the last restore read.
  let lastFingerprint = '';

  return {
    persistClient: async (client: PersistedClient) => {
      // Every cache event lands here, including those of queries never persisted (noPersist, pending, failed):
      // skip a write that would store the same queries as the last one.
      const next = fingerprint(client.clientState);
      if (next === lastFingerprint) return;
      lastFingerprint = next;
      if (pendingTimeout) clearTimeout(pendingTimeout);
      pendingTimeout = setTimeout(async () => {
        pendingTimeout = null;
        try {
          await set(idbValidKey, serializeForIDB(client));
        } catch (e) {
          // e.g. QuotaExceededError: drop the blob rather than retry forever.
          console.warn('[query-persister] Failed to persist cache, clearing:', e);
          lastFingerprint = '';
          await del(idbValidKey).catch(() => {});
        }
      }, throttleMs);
    },
    restoreClient: async () => {
      try {
        const stored = await get<PersistedClient>(idbValidKey);
        if (!stored) return undefined;
        // persistQueryClientRestore only checks the buster after we return,
        // so check it here to skip the deserialize walk on a stale blob.
        if (stored.buster !== CACHE_BUSTER) {
          await del(idbValidKey);
          return undefined;
        }
        // Drop expired entries before deserializing, not after.
        const now = Date.now();
        stored.clientState.queries = stored.clientState.queries.filter((q) =>
          isPersistable(q, now),
        );
        const restored = deserializeFromIDB(stored) as PersistedClient;
        // The cache events after a restore (observers, refetches starting) don't write these same queries back.
        lastFingerprint = fingerprint(stored.clientState);
        return restored;
      } catch (e) {
        console.warn('[query-persister] Failed to restore cache, clearing:', e);
        await del(idbValidKey);
        return undefined;
      }
    },
    removeClient: async () => {
      if (pendingTimeout) clearTimeout(pendingTimeout);
      lastFingerprint = '';
      await del(idbValidKey)
    },
  }
}

export const persister = createIDBPersister();
