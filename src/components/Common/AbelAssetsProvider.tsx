import React from "react";
import AssetCache from "./AssetCache";
import { abel, abelTinyToAssetTiny } from "../../packages/abel/abel";
import type { A_AssetTiny } from "../../packages/core-sdk/types";

export type AbelAssetsContextValue = {
  loading: boolean;
  loadedPromise: Promise<void>;
//   refresh: () => Promise<void>;
};

// Create a deferred promise so consumers can await the initial load
function createDeferredPromise<T = void>() {
  let resolveFn: (value: T | PromiseLike<T>) => void = () => {};
  const promise = new Promise<T>((resolve) => {
    resolveFn = resolve;
  });
  return { promise, resolve: resolveFn };
}

export const AbelAssetsContext = React.createContext<AbelAssetsContextValue>({
  loading: false,
  loadedPromise: Promise.resolve(),
//   refresh: async () => {},
});

async function loadAllAssetsIntoCache(): Promise<void> {
  try {
    // Get all known asset IDs from ABEL
    const assetIdsBig = await abel.getAllAssetIDs();
    const assetIds = assetIdsBig.map((id) => Number(id));

    // Check cache for existing entries
    let cachedMap: Map<number, A_AssetTiny> = new Map();
    try {
      cachedMap = await AssetCache.getByIndices(assetIds);
    } catch {
      // ignore cache failures
    }

    const missingIds = assetIdsBig.filter((id) => !cachedMap.has(Number(id)));
    if (missingIds.length > 0) {
      console.log(
        "Fetching from abel",
        missingIds.length,
        "missing asset tiny labels to populate cache"
      );
      // Fetch tiny labels for missing IDs from ABEL
      const abelData = await abel.getAssetsTinyLabels(missingIds);
      const assets = Array.from(abelData.values())
        .map(abelTinyToAssetTiny)
        .filter((a): a is NonNullable<typeof a> => a != null);

      if (assets.length) {
        // Persist to IndexedDB asynchronously (ignore errors)
        try {
          await AssetCache.insertMany(assets);
        } catch {
          // ignore cache failures
        }
      }
    }
  } catch(e) {
    console.error("Abel error:", e)
    // Swallow all errors to keep UI responsive
  }
}

export function AbelAssetsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [loading, setLoading] = React.useState(true);
  const deferredRef = React.useRef<{ resolve: () => void } | null>(null);
  const [loadedPromise] = React.useState<Promise<void>>(() => {
    const { promise, resolve } = createDeferredPromise<void>();
    deferredRef.current = { resolve };
    return promise;
  });

//   const refresh = React.useCallback(async () => {
//     setLoading(true);
//     await loadAllAssetsIntoCache();
//     setLoading(false);
//   }, []);

  React.useEffect(() => {
    (async () => {
      try {
        await loadAllAssetsIntoCache();
      } finally {
        setLoading(false);
        // Resolve the deferred loadedPromise so listeners can proceed
        deferredRef.current?.resolve();
      }
    })();
  }, []);

  const value: AbelAssetsContextValue = React.useMemo(
    () => ({ loading, loadedPromise, /* refresh */ }),
    [loading, loadedPromise /*, refresh */]
  );

  return (
    <AbelAssetsContext.Provider value={value}>
      {children}
    </AbelAssetsContext.Provider>
  );
}

export function useAbelAssetsContext(): AbelAssetsContextValue {
  return React.useContext(AbelAssetsContext);
}
