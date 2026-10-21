import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAlgoMetricsContext } from "@d13co/algo-metrics-react";
import type { TsTcWatcherBlockCallback, TsTcWatcherSimpleCallback } from "@d13co/algo-metrics-sdk";
import type { modelsv2, Transaction } from "algosdk";
import { surfIdxSupported } from "src/utils/surfIdx";
import { rememberBlock } from "src/hooks/useKnownNames";

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

/** Who needs what: the homepage lists each block's transactions; the upgrades page reads headers only. */
type WatchMode = "full" | "header";

function watchMode(pathname: string): WatchMode | null {
  if (pathname === "/") return "full";
  // The upgrades page follows a vote or switch countdown from the latest header, and needs the next
  // header to see one end or a new one start, so it always watches.
  if (surfIdxSupported && pathname.replace(/\/+$/, "") === "/upgrades") return "header";
  return null;
}

/** Blocks fetched without their transactions; the homepage must not list them. */
const headerOnlyBlocks = new WeakSet<Block>();

export function LiveBlocksProvider({ children }: { children: React.ReactNode }) {
  const { sdk } = useAlgoMetricsContext();
  const [state, setState] = useState<LiveBlocksState>(initialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const { pathname } = useLocation();
  const mode = watchMode(pathname);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const fetchBlock = async (round: number | bigint, headerOnly: boolean): Promise<Block> => {
    const resp = await sdk.algorand.client.algod.block(round).headerOnly(headerOnly).do();
    const block = (resp as modelsv2.BlockResponse).block;
    if (headerOnly) {
      // Typed as always present, but omitted from a header-only response.
      block.payset ??= [];
      headerOnlyBlocks.add(block);
    } else {
      patchBlockTxns(block);
      // Names its logic sig accounts and the apps it created (short-lived ones too).
      rememberBlock(block);
    }
    return block;
  };

  /** Adds a new head block, ignoring one that is not newer than the current head. */
  const pushBlock = (block: Block) => {
    setState((prev) => {
      if (prev.blocks.length && block.header.round <= prev.currentBlock) return prev;
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

      return { currentBlock: block.header.round, blocks, transactions };
    });
  };

  // Initial fetch: runs once when sdk is ready. Only the homepage needs transactions; elsewhere the
  // latest header is enough.
  useEffect(() => {
    const headerOnly = modeRef.current !== "full";
    sdk.algorand.client.algod.status().do().then(async (status) => {
      const lastRound = Number(status.lastRound);
      const numToFetch = IS_LOCALNET ? BLOCKS_TO_KEEP : 1;
      const firstRound = Math.max(0, lastRound - numToFetch + 1);
      const blocks = (
        await Promise.all(
          Array.from({ length: lastRound - firstRound + 1 }, (_, i) => fetchBlock(firstRound + i, headerOnly))
        )
      ).reverse();
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

  // Watcher: register only on the pages that follow the chain
  useEffect(() => {
    if (!mode) return;
    const headerOnly = mode === "header";
    let active = true;

    // Backfill any blocks we missed while away
    const prev = stateRef.current;
    if (prev.blocks.length > 0) {
      sdk.algorand.client.algod.status().do().then(async (status) => {
        const latestRound = Number(status.lastRound);
        const ourLatest = Number(prev.currentBlock);
        const gap = latestRound - ourLatest;
        // Blocks kept from a header-only page have no transactions to list.
        const missingTxns = !headerOnly && prev.blocks.some((b) => headerOnlyBlocks.has(b));

        if (gap > BLOCKS_TO_KEEP || missingTxns) {
          // Too stale, or not the blocks needed: reset with just the latest block
          const block = await fetchBlock(latestRound, headerOnly);
          if (!active) return;
          setState({
            currentBlock: block.header.round,
            blocks: [block],
            transactions: deriveTransactions([block]),
          });
        } else if (gap > 0) {
          // Fetch only the missing blocks
          const newBlocks = (
            await Promise.all(Array.from({ length: gap }, (_, i) => fetchBlock(ourLatest + 1 + i, headerOnly)))
          ).reverse();
          if (!active) return;
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

    // With includeBlock the SDK hands over the full block it fetched. Without it, the SDK fetches
    // only the header but does not pass it on, so fetch the (small) header here.
    const fullCallback: TsTcWatcherBlockCallback = (_data, lastBlock?: modelsv2.BlockResponse) => {
      // On register the SDK calls back with cached data only, and no block.
      if (!lastBlock?.block) return;
      patchBlockTxns(lastBlock.block);
      rememberBlock(lastBlock.block);
      pushBlock(lastBlock.block);
    };
    const headerCallback: TsTcWatcherSimpleCallback = (data) => {
      const round = data[data.length - 1]?.rnd;
      if (round == null || (stateRef.current.blocks.length && round <= stateRef.current.currentBlock)) return;
      fetchBlock(round, true)
        .then((block) => active && pushBlock(block))
        .catch(() => {
          // Ignore — the next round retries
        });
    };
    const callback = headerOnly ? headerCallback : fullCallback;
    if (headerOnly) {
      void sdk.register(headerCallback, { numBlocks: BLOCKS_TO_KEEP });
    } else {
      void sdk.register(fullCallback, { includeBlock: true, numBlocks: BLOCKS_TO_KEEP });
    }

    return () => {
      active = false;
      sdk.unregister(callback);
    };
  }, [sdk, mode]);

  return (
    <LiveBlocksContext.Provider value={state}>{children}</LiveBlocksContext.Provider>
  );
}

export function useLiveBlocks() {
  return useContext(LiveBlocksContext);
}
