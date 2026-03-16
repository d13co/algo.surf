import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAlgoMetricsContext } from "@d13co/algo-metrics-react";
import type { TsTcWatcherBlockCallback, BlockRoundTimeAndTc } from "@d13co/algo-metrics-sdk";
import type { modelsv2, Transaction } from "algosdk";

const BLOCKS_TO_KEEP = 11;
const TRANSACTIONS_TO_KEEP = BLOCKS_TO_KEEP;
const IS_LOCALNET = process.env.REACT_APP_NETWORK === "Localnet";

type Block = modelsv2.BlockResponse["block"];
type SignedTxnInBlock = Block["payset"][number];

/** Restore genesisID/genesisHash stripped by algod in block encoding */
function patchBlockTxns(block: Block): void {
  const { genesisID, genesisHash } = block.header;
  for (const stib of block.payset) {
    const txn = stib.signedTxn.signedTxn.txn as { -readonly [K in keyof Transaction]: Transaction[K] };
    if (!txn.genesisID) {
      txn.genesisID = genesisID;
      txn.genesisHash = genesisHash;
    }
  }
}

function deriveTransactions(blocks: Block[]): SignedTxnInBlock[] {
  return blocks
    .flatMap((b) => b.payset ?? [])
    .slice(0, TRANSACTIONS_TO_KEEP);
}

export interface LiveBlocksState {
  currentBlock: bigint;
  blocks: Block[];
  transactions: SignedTxnInBlock[];
}

const initialState: LiveBlocksState = {
  currentBlock: 0n,
  blocks: [],
  transactions: [],
};

const LiveBlocksContext = createContext<LiveBlocksState>(initialState);

export function LiveBlocksProvider({ children }: { children: React.ReactNode }) {
  const { sdk } = useAlgoMetricsContext();
  const [state, setState] = useState<LiveBlocksState>(initialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const { pathname } = useLocation();
  const isHome = pathname === "/";

  // Initial fetch: runs once when sdk is ready
  useEffect(() => {
    const algod = sdk.algorand.client.algod;
    algod.status().do().then(async (status) => {
      const lastRound = Number(status.lastRound);
      const numToFetch = IS_LOCALNET ? BLOCKS_TO_KEEP : 1;
      const firstRound = Math.max(0, lastRound - numToFetch + 1);
      const responses = await Promise.all(
        Array.from({ length: lastRound - firstRound + 1 }, (_, i) =>
          algod.block(firstRound + i).do()
        )
      );
      const blocks = responses
        .map((r) => (r as modelsv2.BlockResponse).block)
        .reverse();
      for (const block of blocks) {
        patchBlockTxns(block);
      }
      setState((prev) => {
        if (prev.blocks.length > 0) return prev;
        return {
          currentBlock: blocks[0].header.round,
          blocks,
          transactions: deriveTransactions(blocks),
        };
      });
    }).catch(() => {
      // Ignore — the watcher will populate data shortly
    });
  }, [sdk]);

  // Watcher: register only when on the home page
  useEffect(() => {
    if (!isHome) return;

    const algod = sdk.algorand.client.algod;

    // Backfill any blocks we missed while away
    const prev = stateRef.current;
    if (prev.blocks.length > 0) {
      algod.status().do().then(async (status) => {
        const latestRound = Number(status.lastRound);
        const ourLatest = Number(prev.currentBlock);
        const gap = latestRound - ourLatest;

        if (gap <= 0) return; // already current

        if (gap > BLOCKS_TO_KEEP) {
          // Too stale — reset with just the latest block
          const resp = await algod.block(latestRound).do();
          const block = (resp as modelsv2.BlockResponse).block;
          patchBlockTxns(block);
          setState({
            currentBlock: block.header.round,
            blocks: [block],
            transactions: deriveTransactions([block]),
          });
        } else {
          // Fetch only the missing blocks
          const responses = await Promise.all(
            Array.from({ length: gap }, (_, i) =>
              algod.block(ourLatest + 1 + i).do()
            )
          );
          const newBlocks = responses
            .map((r) => (r as modelsv2.BlockResponse).block)
            .reverse();
          for (const block of newBlocks) {
            patchBlockTxns(block);
          }
          setState((cur) => {
            const merged = [...newBlocks, ...cur.blocks].slice(0, BLOCKS_TO_KEEP);
            return {
              currentBlock: merged[0].header.round,
              blocks: merged,
              transactions: deriveTransactions(merged),
            };
          });
        }
      }).catch(() => {
        // Ignore — the watcher will populate data shortly
      });
    }

    const callback: TsTcWatcherBlockCallback = (
      _data: BlockRoundTimeAndTc[],
      lastBlock: modelsv2.BlockResponse,
    ) => {
      if (!lastBlock) return;
      const block = lastBlock.block;
      patchBlockTxns(block);
      setState((prev) => {
        const blocks = [block, ...prev.blocks];
        if (blocks.length > BLOCKS_TO_KEEP) {
          blocks.length = BLOCKS_TO_KEEP;
        }

        const blockTxns = block.payset ?? [];
        let transactions = prev.transactions;
        if (blockTxns.length) {
          if (blockTxns.length >= TRANSACTIONS_TO_KEEP) {
            transactions = blockTxns.slice(0, TRANSACTIONS_TO_KEEP);
          } else {
            transactions = [...blockTxns, ...transactions].slice(0, TRANSACTIONS_TO_KEEP);
          }
        }

        return {
          currentBlock: block.header.round,
          blocks,
          transactions,
        };
      });
    };

    void sdk.register(callback, { includeBlock: true, numBlocks: BLOCKS_TO_KEEP });

    return () => {
      sdk.unregister(callback);
    };
  }, [sdk, isHome]);

  return (
    <LiveBlocksContext.Provider value={state}>{children}</LiveBlocksContext.Provider>
  );
}

export function useLiveBlocks() {
  return useContext(LiveBlocksContext);
}
