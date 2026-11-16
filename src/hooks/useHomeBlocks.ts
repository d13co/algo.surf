import { useMemo, useRef } from "react";
import { useQueries } from "@tanstack/react-query";
import { useAlgoMetricsContext } from "@d13co/algo-metrics-react";
import type { modelsv2 } from "algosdk";
import { useRound } from "src/hooks/useRound";
import {
  BLOCKS_TO_KEEP,
  Block,
  SignedTxnInBlock,
  deriveTransactions,
  patchBlockTxns,
  useLiveBlocks,
} from "src/hooks/useLiveBlocks";

export interface HomeBlocks {
  /** The round shown, from ?round=R; undefined when live. */
  round: number | undefined;
  /** Newest first: the live head, or R and the blocks before it. */
  blocks: Block[];
  transactions: SignedTxnInBlock[];
  /** At a round: some of the window's blocks are still loading. */
  isLoading: boolean;
  /** At a round: the first failed block read. */
  error: unknown;
}

/**
 * The homepage's blocks: the live watcher's, or at ?round=R the BLOCKS_TO_KEEP blocks up to R,
 * read from algod one block per query. A block never changes, so each is cached for good while
 * the page lives; stepping R by one reads one block. While a new window loads, the last complete one
 * stands in (isLoading true), so a step or a replay doesn't shrink the list for a moment.
 */
export function useHomeBlocks(): HomeBlocks {
  const live = useLiveBlocks();
  const { round } = useRound();
  const { sdk } = useAlgoMetricsContext();

  const rounds = useMemo(() => {
    if (round === undefined) return [];
    const first = Math.max(0, round - BLOCKS_TO_KEEP + 1);
    return Array.from({ length: round - first + 1 }, (_, i) => round - i);
  }, [round]);

  const window = useQueries({
    queries: rounds.map((r) => ({
      queryKey: ["home-block", r],
      queryFn: async (): Promise<Block> => {
        const resp = (await sdk.algorand.client.algod.block(r).do()) as modelsv2.BlockResponse;
        patchBlockTxns(resp.block);
        return resp.block;
      },
      staleTime: Infinity,
      // Whole blocks, every txn: the heaviest entries there are. Kept in memory a while, never persisted.
      gcTime: 10 * 60_000,
      meta: { noPersist: true },
    })),
    combine: (results) => ({
      blocks: results.flatMap((q) => (q.data ? [q.data] : [])),
      isLoading: results.some((q) => q.isPending),
      error: results.find((q) => q.error)?.error ?? null,
    }),
  });

  const transactions = useMemo(() => deriveTransactions(window.blocks), [window.blocks]);
  const held = useRef<{ blocks: Block[]; transactions: SignedTxnInBlock[] }>();
  if (round !== undefined && !window.isLoading && !window.error && window.blocks.length) held.current = { blocks: window.blocks, transactions };

  if (round === undefined) {
    return { round, blocks: live.blocks, transactions: live.transactions, isLoading: false, error: null };
  }
  if (window.isLoading && !window.error && held.current) {
    return { round, ...held.current, isLoading: true, error: null };
  }
  return { round, blocks: window.blocks, transactions, isLoading: window.isLoading, error: window.error };
}
