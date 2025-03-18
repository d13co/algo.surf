import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";
import { handleException } from "../../common/actions/exception";
import explorer from "../../../utils/dappflow";

export type ProposalData = Array<{ rnd: number; pp: number }>;

export interface InnerValidatorData {
  address: string;
  proposals: ProposalData;
  suspensions: Array<number>;
}

export interface ValidatorData {
  raw: InnerValidatorData;
  error: string;
  loading: boolean;
}

const initialState: ValidatorData = {
  loading: false,
  error: "",
  raw: { address: "", proposals: [], suspensions: [] },
};

async function fetchHasProposalData(address: string): Promise<ProposalData> {
  const response = await fetch(
    `https://mainnet-analytics.d13.co/v0/exists/${address}`
  );
  const { exists } = await response.json();
  return exists;
}

async function fetchProposalData(address: string): Promise<ProposalData> {
  const response = await fetch(
    `https://mainnet-analytics.d13.co/v0/proposer/${address}`
  );
  return response.json();
}

async function fetchSuspensions(address: string): Promise<number[]> {
  const response = await fetch(
    `https://mainnet-analytics.d13.co/v0/evictions/${address}`
  );
  return response.json();
}

export const loadValidator = createAsyncThunk(
  "validator/load",
  async (address: string, thunkAPI) => {
    const { dispatch } = thunkAPI;
    try {
      dispatch(resetValidator());
      dispatch(setLoading(true));
      const hasData = await fetchHasProposalData(address);
      const [proposals, suspensions] = hasData
        ? await Promise.all([
            fetchProposalData(address),
            fetchSuspensions(address),
          ])
        : [[], []];
      dispatch(setLoading(false));
      return { proposals, suspensions, address };
    } catch (e: any) {
      dispatch(handleException(e));
      dispatch(setError((e as Error).message));
      dispatch(setLoading(false));
    }
  }
);

export const blockSlice = createSlice({
  name: "block",
  initialState,
  reducers: {
    resetValidator: (state) => initialState,
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    setError: (state, action: PayloadAction<string>) => {
      state.error = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(
      loadValidator.fulfilled,
      (state, action: PayloadAction<InnerValidatorData>) => {
        if (action.payload) {
          state.raw = action.payload;
        }
      }
    );
  },
});

export const { resetValidator, setLoading, setError } = blockSlice.actions;
export default blockSlice.reducer;
