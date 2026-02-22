import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { indexerModels } from "algosdk";
import explorer from "../utils/dappflow";
import { BlockClient } from "../packages/core-sdk/clients/blockClient";
import { NodeClient } from "../packages/core-sdk/clients/nodeClient";
import { A_SearchTransaction } from "../packages/core-sdk/types";
import { toA_SearchTransaction } from "../packages/core-sdk/utils/v3Adapters";

const BLOCKS_TO_KEEP = 11;
const TRANSACTIONS_TO_KEEP = 25;

export interface LiveDataState {
  currentBlock: number;
  blocks: indexerModels.Block[];
  transactions: A_SearchTransaction[];
  connectionSuccess: boolean;
}

const initialState: LiveDataState = {
  currentBlock: 0,
  blocks: [],
  transactions: [],
  connectionSuccess: true,
};

type SetState = React.Dispatch<React.SetStateAction<LiveDataState>>;

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function applyBlock(state: LiveDataState, block: indexerModels.Block, latestRound: number): LiveDataState {
  const blocks = [block, ...state.blocks];
  if (blocks.length > BLOCKS_TO_KEEP) {
    blocks.length = BLOCKS_TO_KEEP;
  }

  let transactions = state.transactions;
  const blockTxns = block.transactions ?? [];
  if (blockTxns.length) {
    const newTxns = blockTxns.map(toA_SearchTransaction);
    if (newTxns.length >= TRANSACTIONS_TO_KEEP) {
      transactions = newTxns.slice(0, TRANSACTIONS_TO_KEEP);
    } else {
      transactions = [...newTxns, ...transactions].slice(0, TRANSACTIONS_TO_KEEP);
    }
  }

  return {
    currentBlock: Math.max(Number(block.round), state.currentBlock),
    blocks,
    transactions,
    connectionSuccess: true,
  };
}

async function startPolling(setState: SetState, abortRef: React.MutableRefObject<boolean>) {
  try {
    const nodeClient = new NodeClient(explorer.network);
    const health = await nodeClient.health();
    const startRound = health.round;

    setState((s) => ({ ...s, currentBlock: startRound, connectionSuccess: true }));

    let round = startRound - 100;
    const blockClient = new BlockClient(explorer.network);

    while (!abortRef.current) {
      try {
        const statusNow = await blockClient.statusAfterBlock(round);
        if (abortRef.current) break;

        const roundNow = statusNow["last-round"];
        const delta = roundNow - round;

        if (delta < 0) {
          await sleep(500);
          continue;
        } else if (delta > BLOCKS_TO_KEEP) {
          round = roundNow - BLOCKS_TO_KEEP;
          await sleep(100);
          continue;
        }

        const block = await blockClient.get(round);
        if (abortRef.current) break;

        setState((s) => applyBlock(s, block, roundNow));

        await sleep(500);
        round += 1;
      } catch {
        await sleep(1000);
      }
    }
  } catch {
    setState((s) => ({ ...s, connectionSuccess: false }));
  }
}

const LiveDataContext = createContext<LiveDataState>(initialState);

export function LiveDataProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<LiveDataState>(initialState);
  const abortRef = useRef(false);

  useEffect(() => {
    abortRef.current = false;
    startPolling(setState, abortRef);
    return () => {
      abortRef.current = true;
    };
  }, []);

  return (
    <LiveDataContext.Provider value={state}>{children}</LiveDataContext.Provider>
  );
}

export function useLiveData() {
  return useContext(LiveDataContext);
}
