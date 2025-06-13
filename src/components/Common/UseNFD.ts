import { useQuery, UseQueryResult } from "@tanstack/react-query";
import {
  create,
  indexedResolver,
  windowedFiniteBatchScheduler,
} from "@yornaath/batshit";

type NFDRecord = {
  name: string;
  properties?: {
    userDefined?: {
      avatar: string;
    };
  };
};

const nfd = create({
  fetcher: async (addresses: string[]): Promise<Record<string, NFDRecord>> => {
    const params = addresses.map((address) => `address=${address}`).join("&");
    const url = `https://api.nf.domains/nfd/v2/address?${params}&view=thumbnail&limit=1`;
    const response = await fetch(url);
    if (!response.ok) return {};
    const data = await response.json();
    const x = Object.fromEntries(
      // @ts-ignore
      Object.entries(data).map(([k, [v]]) => [k, v])
    );
    return x;
  },
  resolver: indexedResolver(),
  scheduler: windowedFiniteBatchScheduler({
    windowMs: 10,
    maxBatchSize: 20,
  }),
});

export const useReverseNFD = (
  address: string
): UseQueryResult<string | null> => {
  return useQuery({
    queryKey: ["nfd-rev", address],
    queryFn: async () => {
      if (!address) return null;
      const nfdData = await nfd.fetch(address);
      return nfdData?.name ?? null;
    },
    gcTime: 1000 * 60 * 60, // 1 hour
    staleTime: 1000 * 60 * 60, // 1 hour
  });
};

export const useNFDAvatar = (
  address?: string
): UseQueryResult<string | null> => {
  return useQuery({
    queryKey: ["nfd-avatar", address ?? "-"],
    queryFn: async () => {
      if (!address) return null;
      const nfdData = await nfd.fetch(address);
      return nfdData?.properties?.userDefined?.avatar ?? null;
    },
    gcTime: 1000 * 60 * 60, // 1 hour
    staleTime: 1000 * 60 * 60, // 1 hour
  });
};

export const useReverseNFDs = (
  addresses: string[]
): UseQueryResult<[string, string | null][] | null> => {
  return useQuery({
    queryKey: ["nfd-rev", addresses],
    queryFn: async () => {
      const nfdData = await Promise.all(
        addresses.map((address) => nfd.fetch(address))
      );
      const ret: [string, string | null][] = nfdData.map((data, i) => [
        addresses[i],
        data?.name ?? null,
      ]);
      return ret;
    },
    gcTime: 1000 * 60 * 60, // 1 hour
    staleTime: 1000 * 60 * 60, // 1 hour
  });
};
