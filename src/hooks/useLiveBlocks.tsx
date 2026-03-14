import { createContext, useContext, useEffect, useState } from "react";
import { useAlgoMetricsContext } from "@d13co/algo-metrics-react";
import type { TsTcWatcherBlockCallback, BlockRoundTimeAndTc } from "@d13co/algo-metrics-sdk";
import type { modelsv2, Transaction } from "algosdk";

const BLOCKS_TO_KEEP = 11;
const TRANSACTIONS_TO_KEEP = BLOCKS_TO_KEEP;

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

  useEffect(() => {
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
  }, [sdk]);

  return (
    <LiveBlocksContext.Provider value={state}>{children}</LiveBlocksContext.Provider>
  );
}

export function useLiveBlocks() {
  return useContext(LiveBlocksContext);
}
