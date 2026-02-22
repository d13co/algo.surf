import { get, set, del } from 'idb-keyval'
import {
  PersistedClient,
  Persister,
} from '@tanstack/react-query-persist-client'

/**
 * Creates an Indexed DB persister with debounced writes
 * @see https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
 */
export function createIDBPersister(
  idbValidKey: IDBValidKey = 'reactQuery',
  throttleMs = 1000,
): Persister {
  let pendingTimeout: ReturnType<typeof setTimeout> | null = null;

  return {
    persistClient: async (client: PersistedClient) => {
      if (pendingTimeout) clearTimeout(pendingTimeout);
      pendingTimeout = setTimeout(() => {
        set(idbValidKey, client);
        pendingTimeout = null;
      }, throttleMs);
    },
    restoreClient: async () => {
      return await get<PersistedClient>(idbValidKey)
    },
    removeClient: async () => {
      if (pendingTimeout) clearTimeout(pendingTimeout);
      await del(idbValidKey)
    },
  }
}

export const persister = createIDBPersister();