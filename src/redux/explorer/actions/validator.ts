import {createAsyncThunk, createSlice, PayloadAction} from '@reduxjs/toolkit'
import {handleException} from "../../common/actions/exception";
import explorer from "../../../utils/dappflow";

export type ProposalData = Array<{rnd: number, pp: number}>

export interface InnerValidatorData {
    address: string;
    proposals: ProposalData;
    suspensions: Array<number>;
}

export interface ValidatorData {
    raw: InnerValidatorData,
    error: boolean,
    loading: boolean,
}

const initialState: ValidatorData = {
    loading: false,
    error: false,
    raw: { address: "", proposals: [], suspensions: [] },
}

async function fetchProposalData(address: string): Promise<ProposalData> {
    const response = await fetch(`https://mainnet-analytics.d13.co/v0/proposer/${address}`);
    return response.json();
}

async function fetchSuspensions(address: string): Promise<number[]> {
    const response = await fetch(`https://mainnet-analytics.d13.co/v0/evictions/${address}`);
    return response.json();
}

export const loadValidator = createAsyncThunk(
    'validator/load',
    async (address: string, thunkAPI) => {
        const {dispatch} = thunkAPI;
        try {
            dispatch(resetValidator());
            dispatch(setLoading(true));
            const [proposals, suspensions] = await Promise.all([
                fetchProposalData(address),
                fetchSuspensions(address),
            ]);
            dispatch(setLoading(false));
            return { proposals, suspensions, address }
        }
        catch (e: any) {
            dispatch(handleException(e));
            dispatch(setError(true));
            dispatch(setLoading(false));
        }
    }
);

export const blockSlice = createSlice({
    name: 'block',
    initialState,
    reducers: {
        resetValidator: state => initialState,
        setLoading: (state, action: PayloadAction<boolean> ) => {
            state.loading = action.payload;
        },
        setError: (state, action: PayloadAction<boolean> ) => {
            state.error = action.payload;
        },
    },
    extraReducers: (builder) => {
        builder.addCase(loadValidator.fulfilled, (state, action: PayloadAction<InnerValidatorData>) => {
            if (action.payload) {
                state.raw = action.payload;
            }
        });
    },
});

export const {resetValidator, setLoading, setError} = blockSlice.actions
export default blockSlice.reducer
