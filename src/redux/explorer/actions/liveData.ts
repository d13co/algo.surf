import {createAsyncThunk, createSlice, PayloadAction} from '@reduxjs/toolkit'
import explorer from "../../../utils/dappflow";
import {BlockClient} from "../../../packages/core-sdk/clients/blockClient";
import {A_Block, A_Status, A_SearchTransaction} from "../../../packages/core-sdk/types";
import {NodeClient} from "../../../packages/core-sdk/clients/nodeClient";

export const blockPreload = 3;
export const blocksToKeep = 11;

export interface UpgradeData {
    name?: string;
    upgradeRound?: number;
    rounds?: number;
    eta?: string[];
    avgRoundTime?: number;
    lastRound?: number;
    lastRoundTimestamp?: number;
}

export interface LiveData {
    loading: number,
    currentBlock: number,
    blocks: A_Block[],
    transactions: A_SearchTransaction[],
    connection: {
        success: boolean
    },
    upgrade: UpgradeData
}

const initialState: LiveData = {
    loading: 0,
    currentBlock: 0,
    blocks: [],
    transactions: [],
    connection: {
        success: true
    },
    upgrade: {},
}

export interface A_Block_And_Current extends A_Block {
    latestRound: number;
}

export const initLivedata = createAsyncThunk(
    'liveData/initLivedata',
    async (_, thunkAPI) => {
        const {dispatch} = thunkAPI;
        try {
            const nodeClientInstance = new NodeClient(explorer.network);
            const health = await nodeClientInstance.health();

            const round = health.round;

            dispatch(setCurrentBlock(round));
            dispatch(loadBlockInfo(round - 100));
            // for(let i=1; i<=blockPreload; i++) {
            //     dispatch(loadBlockHistory(round - i));
            // }
            dispatch(setConnectionSuccess(true));
        }
        catch (e: any) {
            dispatch(setConnectionSuccess(false));
        }
    }
);

export const loadBlockHistory = createAsyncThunk(
    'liveData/loadBlockHistory',
    async (round: number, thunkAPI) => {
        const {dispatch} = thunkAPI;
        try {
            const blockClient = new BlockClient(explorer.network);
            const blockInfo = await blockClient.get(round);
            return { ...blockInfo, latestRound: 0 };
        }
        catch (e: any) {

        }
    }
);

const upgradeNameMap = {
    default: "Algorand v4",
};

export const tick = createAsyncThunk(
    'liveData/tick',
    async (init: boolean, thunkAPI) => {
        const {dispatch,getState} = thunkAPI;
        // @ts-ignore
        const { liveData: { upgrade } } = getState();
        // console.log('tick', { init });
        if (upgrade.name) {
            init = false;
        }
        if (init || upgrade.name) {
            setTimeout(() => dispatch(tick(init)), 1_000);
        }
        return null;
    }
);

export const loadUpgradeInfo = createAsyncThunk(
    'liveData/loadUpgradeInfo',
    async ({status, block: blockNow}: { status: A_Status, block: A_Block }, thunkAPI) => {
        const {dispatch} = thunkAPI;
        try {
            const { "last-version": lv, "next-version": nv, "last-round": lr, "next-version-round": upgradeRound, } = status;
            const name = upgradeNameMap[nv] ?? upgradeNameMap.default;

            const blockNowRound = blockNow.round;
            const blockClient = new BlockClient(explorer.network);
            const DELTA = 50_000;
            const blockThen = await blockClient.get(blockNowRound - DELTA);
            const dts = blockNow.timestamp - blockThen.timestamp;
            const avgRoundTime = dts / DELTA;

            dispatch(tick(true));

            return { name, upgradeRound, avgRoundTime };
        }
        catch (e: any) {
            console.error('loadUpgradeInfo', e.message);
        }
    }
);

export const loadBlockInfo = createAsyncThunk(
    'liveData/loadBlock',
    async (round: number, thunkAPI) => {
        const {dispatch,getState} = thunkAPI;
        try {
            const state = getState();
            const blockClient = new BlockClient(explorer.network);
            const statusNow = await blockClient.statusAfterBlock(round);
            const { "last-round": cr, "last-version": lv, "next-version": nv } = statusNow;
            const { "last-round": roundNow } = statusNow;
            const delta = roundNow - round;
            if (delta < 0) {
                // we did not reach it yet
                await sleep(500);
                // try again
                dispatch(loadBlockInfo(round));
                return;
            } else if (delta > blocksToKeep) {
                // we are resuming and may be _way_ behind
                // ignore and jump ahead
                await sleep(100);
                dispatch(loadBlockInfo(roundNow - blocksToKeep));
                return;
            }
            const blockInfo = await blockClient.get(round);
            // @ts-ignore
            if (lv !== nv && !state.liveData.upgrade.name) {
                dispatch(loadUpgradeInfo({ status: statusNow, block: blockInfo }));
            }
            await sleep(500);
            dispatch(loadBlockInfo(round + 1));
            return { ...blockInfo, latestRound: cr }
        }
        catch (e: any) {

        }
    }
);

const transactionsToKeep = 25;

export const liveDataSlice = createSlice({
    name: 'liveData',
    initialState,
    reducers: {
        resetLiveData: state => initialState,
        setCurrentBlock: (state, action: PayloadAction<number> ) => {
            state.currentBlock = action.payload;
        },
        setConnectionSuccess: (state, action: PayloadAction<boolean> ) => {
            state.connection.success = action.payload;
        },
    },
    extraReducers: (builder) => {
        const handler = (sort: boolean) => (state, action: PayloadAction<A_Block_And_Current>) => {
            if (!action.payload) return;
            state.blocks.unshift(action.payload);

            const { latestRound } = action.payload;
            if (latestRound && state.upgrade.name) {
                const { upgradeRound, avgRoundTime } = state.upgrade;
                if (upgradeRound < latestRound) {
                    state.upgrade = {};
                } else {
                    state.upgrade.rounds = upgradeRound - latestRound;
                    state.upgrade.lastRound = action.payload.round;
                    state.upgrade.lastRoundTimestamp = action.payload.timestamp;
                }
            }
            let {blocks, currentBlock, transactions} = state;
            if (sort) {
                blocks = blocks.sort((a, b) => b.round - a.round);
            }
            state.currentBlock = Math.max(action.payload.round, state.currentBlock);
            if (state.blocks.length > blocksToKeep) {
                state.blocks = blocks.slice(0, blocksToKeep);
            }
            if (action.payload?.transactions) {
                const newTransactions = action.payload?.transactions;
                if (newTransactions.length >= transactionsToKeep) {
                    state.transactions = newTransactions.slice(0, 25);
                } else {
                    state.transactions = [...newTransactions, ...transactions].slice(0, 25);
                }
            }
        }
        builder.addCase(loadBlockHistory.fulfilled, handler(true));
        builder.addCase(loadBlockInfo.fulfilled, handler(false));
        builder.addCase(loadUpgradeInfo.fulfilled, (state, action: PayloadAction<Partial<UpgradeData>>) => {
            if (!action.payload)
                return;
            state.upgrade.name = action.payload.name;
            state.upgrade.upgradeRound = action.payload.upgradeRound;
            state.upgrade.avgRoundTime = action.payload.avgRoundTime;
        });
        builder.addCase(tick.fulfilled, (state, _) => {
            const { avgRoundTime, upgradeRound, lastRound, lastRoundTimestamp } = state.upgrade;
            const deltaRounds = state.upgrade.upgradeRound - lastRound;
            const deltaSec = avgRoundTime * deltaRounds;
            const now = Date.now() / 1000;
            const offsetSinceBlock = now - lastRoundTimestamp;
            let remain = deltaSec - offsetSinceBlock;
            const eta = {} as { days: number, hours: number, minutes: number, seconds: number };
            eta.days = Math.floor(deltaSec / 3600 / 24);
            remain -= eta.days * 3600 * 24;
            eta.hours = Math.floor(remain / 3600);
            remain -= eta.hours * 3600;
            eta.minutes = Math.floor(remain / 60);
            remain -= eta.minutes * 60;
            eta.seconds = Math.floor(remain);
            const s = [];
            for(const key of ['days', 'hours', 'minutes', 'seconds']) {
                if (eta[key] || s.length) {
                    s.push(eta[key]);
                    s.push(key);
                }
            }
            state.upgrade.eta = s;
        });
    },
});

export const {resetLiveData, setCurrentBlock, setConnectionSuccess} = liveDataSlice.actions
export default liveDataSlice.reducer

async function sleep(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)) }
