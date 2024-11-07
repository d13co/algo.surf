import {createAsyncThunk, createSlice, PayloadAction} from '@reduxjs/toolkit'
import explorer from "../../../utils/dappflow";
import {BlockClient} from "../../../packages/core-sdk/clients/blockClient";
import {A_Block, A_SearchTransaction} from "../../../packages/core-sdk/types";
import {NodeClient} from "../../../packages/core-sdk/clients/nodeClient";

export const blockPreload = 3;

export interface LiveData {
    loading: number,
    currentBlock: number,
    blocks: A_Block[],
    transactions: A_SearchTransaction[],
    connection: {
        success: boolean
    }
}

const initialState: LiveData = {
    loading: 0,
    currentBlock: 0,
    blocks: [],
    transactions: [],
    connection: {
        success: true
    }
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
            dispatch(loadBlockInfo(round));
            // TODO put back pre-fetch
            for(let i=1; i<=blockPreload; i++) {
                dispatch(loadBlockHistory(round - i));
            }
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
            return blockInfo;
        }
        catch (e: any) {

        }
    }
);


export const loadBlockInfo = createAsyncThunk(
    'liveData/loadBlock',
    async (round: number, thunkAPI) => {
        const {dispatch} = thunkAPI;
        try {
            const blockClient = new BlockClient(explorer.network);
            await blockClient.statusAfterBlock(round);
            const blockInfo = await blockClient.get(round);
            dispatch(loadBlockInfo(round + 1));
            return blockInfo;
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
        const handler = (sort: boolean) => (state, action: PayloadAction<A_Block>) => {
            if (!action.payload) return;
            state.blocks.unshift(action.payload);

            let {blocks, currentBlock, transactions} = state;
            if (sort) {
                blocks = blocks.sort((a, b) => b.round - a.round);
            }
            state.currentBlock = Math.max(action.payload.round, state.currentBlock);
            if (state.blocks.length > 11) {
                state.blocks = blocks.slice(0, 11);
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
    },
});

export const {resetLiveData, setCurrentBlock, setConnectionSuccess} = liveDataSlice.actions
export default liveDataSlice.reducer
