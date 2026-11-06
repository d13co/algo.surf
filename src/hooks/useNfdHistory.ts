import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getNfdGhost, nfdRegistryAppId } from "src/packages/nfd/nfdGhost";
import { getTimeTravelNode } from "src/utils/timeTravel";
import { loadNfdAssetHistory, loadNfdHistory, NfdHistory } from "src/utils/nfdHistory";
import { useTimeTravelCapabilities } from "src/hooks/useTimeTravel";

// Experimental and node-specific, like the version histories: kept in memory only.
const meta = { noPersist: true };

/**
 * Whether NFD reads work: a time-travel node for this network that runs
 * read-only queries, an NFD registry on this network, and nfd-ghost-sdk's
 * probe (one 1-call query, cached per client).
 */
export function useNfdHistorySupport(): boolean {
  const queries = !!useTimeTravelCapabilities()?.query;
  const sdk = queries ? getNfdGhost() : null;
  const { data } = useQuery({
    queryKey: ["nfd-ghost-support", getTimeTravelNode()?.baseUrl],
    queryFn: async () => {
      try {
        return await sdk!.supported();
      } catch (e) {
        // Resolved rather than thrown, as useTimeTravelStatus does: every mount would retry it.
        console.warn(`NFD history unavailable: ${(e as Error).message}`);
        return false;
      }
    },
    enabled: !!sdk,
    staleTime: Infinity,
    retry: false,
    meta,
  });
  return !!sdk && data === true;
}

/**
 * An account's NFD history in two stages (see loadNfdHistory and
 * loadNfdAssetHistory): stage 2, the asset scan, starts once stage 1 is done
 * and only adds owner periods. Each says what it is reading while it loads.
 */
export function useNfdHistory(address: string | undefined, enabled: boolean) {
  const [progress, setProgress] = useState<string>();
  const [assetProgress, setAssetProgress] = useState<string>();
  const sdk = getNfdGhost();
  const registryAppId = nfdRegistryAppId();
  const node = getTimeTravelNode()?.baseUrl;
  const ready = enabled && !!address && !!sdk && !!registryAppId;
  const links = useQuery({
    queryKey: ["nfd-history", node, address],
    queryFn: ({ signal }) =>
      loadNfdHistory(address!, { sdk: sdk!, registryAppId: registryAppId!, signal, onProgress: setProgress }),
    enabled: ready,
    // Past rounds never change; a reload reads what happened since.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
    meta,
  });
  const stage1: NfdHistory | undefined = links.data;
  const assets = useQuery({
    queryKey: ["nfd-history-assets", node, address, stage1?.latestRound, stage1?.candidates],
    queryFn: ({ signal }) =>
      loadNfdAssetHistory(address!, {
        sdk: sdk!,
        registryAppId: registryAppId!,
        latestRound: stage1!.latestRound,
        known: stage1!.candidates,
        signal,
        onProgress: setAssetProgress,
      }),
    enabled: ready && !!stage1,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
    meta,
  });
  return { links, assets, progress, assetProgress };
}
