import { useState, useEffect, useCallback } from "react";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { AccountClient } from "src/packages/core-sdk/clients/accountClient";
import explorer from "src/utils/dappflow";
import { EscregSDK } from "@d13co/escreg-sdk";

const escreg = new EscregSDK({});

const ESCROW_FAILURE_CACHE_MS = 10 * 60 * 1000; // 10 minutes

// Module-level escrow cache: address -> app ID (number) or null (not an escrow)
const escrowCache = new Map<string, number | null>();
const escrowPending = new Set<string>();

export function useAccount(address: string) {
  return useQuery({
    queryKey: ["account", address],
    queryFn: () =>
      new AccountClient(explorer.network).getAccountInformation(address),
    enabled: !!address,
  });
}

/**
 * Look up a single address escrow. Fires its own request.
 * Use only on dedicated pages (e.g. Account page), not in lists.
 */
export function useEscrowOf(address: string) {
  const query = useQuery({
    queryKey: ["escrow-of", address],
    queryFn: async () => {
      const result = await escreg.lookup({ addresses: [address] });
      const appId = result[address];
      return appId ? Number(appId) : null;
    },
    enabled: !!address,
    staleTime: (query) => query.state.data ? Infinity : ESCROW_FAILURE_CACHE_MS,
    gcTime: Infinity,
  });
  return query;
}

/**
 * Read escrow app ID from the module-level cache.
 * Returns number (escrow app), null (not an escrow), or undefined (not yet looked up).
 */
export function getEscrowOf(address: string): number | null | undefined {
  return escrowCache.has(address) ? escrowCache.get(address)! : undefined;
}

/**
 * Batch-prefetch escrow lookups for a list of addresses.
 * Populates the module-level escrow cache and triggers a single
 * re-render of the calling component when done.
 */
export function useEscrowBatch(addresses: string[]) {
  const [, bump] = useState(0);

  useEffect(() => {
    const uncached = addresses.filter(
      (addr) => !escrowCache.has(addr) && !escrowPending.has(addr),
    );
    if (uncached.length === 0) return;

    for (const addr of uncached) escrowPending.add(addr);

    escreg.lookup({ addresses: uncached }).then((result) => {
      for (const addr of uncached) {
        const appId = result[addr];
        escrowCache.set(addr, appId ? Number(appId) : null);
        escrowPending.delete(addr);
      }
      bump((n) => n + 1);
    }).catch(() => {
      for (const addr of uncached) escrowPending.delete(addr);
    });
  }, [addresses.join(",")]);
}

export function useAccountTransactions(address: string) {
  return useInfiniteQuery({
    queryKey: ["account-transactions", address],
    queryFn: ({ pageParam }) =>
      new AccountClient(explorer.network).getAccountTransactions(
        address,
        pageParam
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage["next-token"] || undefined,
    enabled: !!address,
  });
}

export function useControllingAccounts(address: string) {
  return useInfiniteQuery({
    queryKey: ["controlling-accounts", address],
    queryFn: ({ pageParam }) =>
      new AccountClient(explorer.network).getAuthAddr(address, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage["next-token"] || undefined,
    enabled: !!address,
  });
}
