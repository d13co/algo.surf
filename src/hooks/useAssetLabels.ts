import { useQuery } from "@tanstack/react-query";
import { abel } from "src/packages/abel/abel";
import { getAbelAt } from "src/packages/abel/abelAt";
import { getTimeTravelNode } from "src/utils/timeTravel";

const network = process.env.REACT_APP_NETWORK;

/**
 * An asset's Abel labels (e.g. `pv`, Pera verified). With `round`, as they
 * were at that round, read on the time-travel node: there, only `pv`, the
 * one label abel's tiny-label reads check.
 */
export function useAssetLabels(id: number, round?: number) {
  return useQuery({
    queryKey: ["asset-labels", id, round, round === undefined ? undefined : getTimeTravelNode()?.baseUrl],
    queryFn: async () => {
      if (round === undefined) return abel.getAssetLabels(BigInt(id));
      const abelAt = getAbelAt();
      if (!abelAt) return [];
      const tiny = await abelAt.getAssetsTinyLabels([id], { round });
      const asset = tiny.get(BigInt(id));
      return asset && "labels" in asset ? asset.labels : [];
    },
    enabled: !!id && network === "Mainnet",
    // Before the registry existed, a read at the round fails the same every time.
    retry: round === undefined ? 3 : false,
    // Labels at a past round never change.
    staleTime: round === undefined ? 0 : Infinity,
  });
}
