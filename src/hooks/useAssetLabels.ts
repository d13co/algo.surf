import { useQuery } from "@tanstack/react-query";
import { abel } from "src/packages/abel/abel";

const network = process.env.REACT_APP_NETWORK;

export function useAssetLabels(id: number) {
  return useQuery({
    queryKey: ["asset-labels", id],
    queryFn: async () => {
      const labels = await abel.getAssetLabels(BigInt(id));
      return labels;
    },
    enabled: !!id && network === "Mainnet",
  });
}
