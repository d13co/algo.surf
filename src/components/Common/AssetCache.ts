// IndexedDB-backed Asset Cache for tiny assets
// External API operates on A_AssetTiny
// Internal storage row is flattened for simple IndexedDB indexes
// Schema:
// - object store: 'assets' (keyPath: 'index')
// - indexes: 'name', 'unitName'

import type { A_AssetTiny } from "../../packages/core-sdk/types";

export interface AssetRow {
  index: number; // primary key
  name: string; // asset name
  unitName: string; // unit name
  decimals: number; // tinyint (store as number)
  peraVerified: boolean; // whether the asset is Pera verified
}

const DB_NAME = "algoSurfAssets";
const DB_VERSION = 1; // bump if schema changes
const STORE_NAME = "assets";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = () => {
        const db = req.result;
        // Create object store if missing
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "index" });
          store.createIndex("name", "name", { unique: false });
          store.createIndex("unitName", "unitName", { unique: false });
        } else {
          const tx = req.transaction!;
          const store = tx.objectStore(STORE_NAME);
          // Ensure indexes exist (safe re-create will throw, so guard)
          try {
            store.createIndex("name", "name", { unique: false });
          } catch {}
          try {
            store.createIndex("unitName", "unitName", { unique: false });
          } catch {}
        }
      };

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function runTx<T>(
  mode: IDBTransactionMode,
  runner: (store: IDBObjectStore) => Promise<T> | T
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        Promise.resolve(runner(store))
          .then((result) => {
            tx.oncomplete = () => resolve(result);
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
          })
          .catch(reject);
      })
  );
}

function toRow(asset: A_AssetTiny): AssetRow {
  return {
    index: asset.index,
    name: asset.params?.name ?? "",
    unitName: (asset.params && (asset.params as any)["unit-name"]) ?? "",
    decimals: asset.params?.decimals ?? 0,
    peraVerified: asset.peraVerified ?? false,
  };
}

function fromRow(row: AssetRow): A_AssetTiny {
  return {
    index: row.index,
    params: {
      decimals: row.decimals,
      name: row.name,
      "unit-name": row.unitName,
    },
    peraVerified: row.peraVerified,
  };
}

export const AssetCache = {
  // Insert a single row (upsert semantics)
  insertOne(asset: A_AssetTiny): Promise<void> {
    return runTx("readwrite", (store) => {
      return new Promise<void>((resolve, reject) => {
        const req = store.put(toRow(asset));
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    });
  },

  // Insert multiple rows in one transaction (bulk upsert)
  insertMany(assets: A_AssetTiny[]): Promise<void> {
    if (!assets.length) return Promise.resolve();
    return runTx("readwrite", (store) => {
      return new Promise<void>((resolve, reject) => {
        let pending = assets.length;
        for (const asset of assets) {
          const req = store.put(toRow(asset));
          req.onerror = () => reject(req.error);
          req.onsuccess = () => {
            pending -= 1;
            if (pending === 0) resolve();
          };
        }
      });
    });
  },

  // Query by primary key (index)
  async getByIndex(index: number): Promise<A_AssetTiny | null> {
    return runTx("readonly", (store) => {
      return new Promise<A_AssetTiny | null>((resolve, reject) => {
        const req = store.get(index);
        req.onsuccess = () => {
          const row = req.result as AssetRow | undefined;
          resolve(row ? fromRow(row) : null);
        };
        req.onerror = () => reject(req.error);
      });
    });
  },

  // Query multiple by primary keys (indices)
  async getByIndices(indices: number[]): Promise<Map<number, A_AssetTiny>> {
    if (!indices.length) return Promise.resolve(new Map());
    return runTx("readonly", (store) => {
      return new Promise<Map<number, A_AssetTiny>>((resolve, reject) => {
        const map = new Map<number, A_AssetTiny>();
        let pending = indices.length;
        let failed = false;
        for (const id of indices) {
          const req = store.get(id);
          req.onerror = () => {
            if (!failed) {
              failed = true;
              reject(req.error);
            }
          };
          req.onsuccess = () => {
            if (failed) return;
            const row = req.result as AssetRow | undefined;
            if (row) map.set(id, fromRow(row));
            pending -= 1;
            if (pending === 0) {
              resolve(map);
            }
          };
        }
      });
    });
  },

  // Query by partial asset name OR unit name (case-insensitive substring)
  // For performance, we iterate each index cursor and filter with includes().
  // Optional limit caps results.
  async partialSearchByNameOrUnit(partial: string): Promise<A_AssetTiny[]> {
    const term = partial.trim().toLowerCase();
    if (!term) return [];

    return runTx("readonly", async (store) => {
      const results: AssetRow[] = [];
      const seen = new Set<number>();

      // Helper to scan an index and collect matches
      const scanIndex = (indexName: "name" | "unitName") =>
        new Promise<void>((resolve, reject) => {
          const index = store.index(indexName);
          const req = index.openCursor();
          req.onerror = () => reject(req.error);
          req.onsuccess = () => {
            const cursor = req.result as IDBCursorWithValue | null;
            if (!cursor) return resolve();
            const value = cursor.value as AssetRow;
            const field =
              (indexName === "name" ? value.name : value.unitName) || "";
            debugger;
            if (!seen.has(value.index) && field.toLowerCase().includes(term)) {
              seen.add(value.index);
              results.push(value);
            }
            cursor.continue();
          };
        });

      // Scan 'name' first, then 'unitName'
      await scanIndex("name");
      await scanIndex("unitName");

      return results.map(fromRow);
    });
  },

  async searchByNameOrUnit({
    exact,
    peraVerified,
  }: {
    exact: string;
    peraVerified: boolean;
  }): Promise<A_AssetTiny[]> {
    const term = exact.trim().toLowerCase();
    if (!term) return [];

    return runTx("readonly", async (store) => {
      const results: AssetRow[] = [];
      const seen = new Set<number>();

      // Helper to scan an index and collect matches
      const scanIndex = (indexName: "name" | "unitName") =>
        new Promise<void>((resolve, reject) => {
          const index = store.index(indexName);
          const req = index.openCursor();
          req.onerror = () => reject(req.error);
          req.onsuccess = () => {
            const cursor = req.result as IDBCursorWithValue | null;
            if (!cursor) return resolve();
            const value = cursor.value as AssetRow;
            const field =
              (indexName === "name" ? value.name : value.unitName) || "";
            if (!seen.has(value.index) && field.toLowerCase().trim() === term && (peraVerified ? value.peraVerified : true)) {
              seen.add(value.index);
              results.push(value);
            }
            cursor.continue();
          };
        });

      // Scan 'name' first, then 'unitName'
      await Promise.all([scanIndex("name"), scanIndex("unitName")]);

      return results.map(fromRow).sort((a, b) => a.index - b.index);
    });
  },
};

export default AssetCache;
