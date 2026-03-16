import { get, set, del } from 'idb-keyval'
import {
  PersistedClient,
  Persister,
} from '@tanstack/react-query-persist-client'
import { serializeForIDB, deserializeFromIDB } from './sdk-serializer'

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

  return {
    persistClient: async (client: PersistedClient) => {
      if (pendingTimeout) clearTimeout(pendingTimeout);
      pendingTimeout = setTimeout(() => {
        set(idbValidKey, serializeForIDB(client));
        pendingTimeout = null;
      }, throttleMs);
    },
    restoreClient: async () => {
      try {
        const stored = await get<PersistedClient>(idbValidKey);
        if (!stored) return undefined;
        return deserializeFromIDB(stored) as PersistedClient;
      } catch (e) {
        console.warn('[query-persister] Failed to restore cache, clearing:', e);
        await del(idbValidKey);
        return undefined;
      }
    },
    removeClient: async () => {
      if (pendingTimeout) clearTimeout(pendingTimeout);
      await del(idbValidKey)
    },
  }
}

export const persister = createIDBPersister();
