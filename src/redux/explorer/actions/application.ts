import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";
import { handleException } from "../../common/actions/exception";
import explorer from "../../../utils/dappflow";
import { A_BoxNames, A_Application } from "../../../packages/core-sdk/types";
import {
  A_ApplicationTransactionsResponse,
  ApplicationClient,
} from "../../../packages/core-sdk/clients/applicationClient";
import { BoxClient } from "../../../packages/core-sdk/clients/boxClient";
import { CoreApplication } from "../../../packages/core-sdk/classes/core/CoreApplication";
import { ABIContractParams, makeApplicationClearStateTxnFromObject } from "algosdk";
import chunk from "lodash/chunk.js";
import sha512 from 'js-sha512'

function arrayBufferToHex(ab: ArrayBuffer): string {
    return Buffer.from(ab).toString("hex")
}

export async function getProgramHashes(appInfo: A_Application): Promise<ApplicationHashes> {
    const approvalB64 = appInfo.params["approval-program"];
    const clearB64 = appInfo.params["clear-state-program"];
    const approvalProgram = Buffer.from(approvalB64, 'base64');
    const approvalProgramPages = chunk(Array.from(approvalProgram), 4096)
    const clearProgream = Buffer.from(clearB64, 'base64');
    const approvalPagesSha256 = await Promise.all(
        approvalProgramPages.map(page => 
            crypto.subtle.digest('SHA-256', Buffer.from(page) as any)
        )
    );
    const sha256: ApplicationHashesInner = {
        approval: arrayBufferToHex(await crypto.subtle.digest('SHA-256', approvalProgram as any)),
        approvalPages: approvalPagesSha256.map(page => arrayBufferToHex(page)),
        clear: arrayBufferToHex(await crypto.subtle.digest('SHA-256', approvalProgram as any)),
    }
    const sha512_256: ApplicationHashesInner = {
        approval: sha512.sha512_256(new Uint8Array(approvalProgram)),
        approvalPages: approvalProgramPages.map(page => sha512.sha512_256(new Uint8Array(page))),
        clear: sha512.sha512_256(new Uint8Array(clearProgream)),
    }
    return { sha256, sha512_256 }
}

interface ApplicationHashesInner {
    approvalPages: string[];       
    approval: string;
    clear: string;
}

interface ApplicationHashes {
    sha256: ApplicationHashesInner;
    sha512_256: ApplicationHashesInner;
}

export interface Application {
  loading: boolean;
  error: boolean;
  information: A_Application;
  transactionsDetails: A_ApplicationTransactionsResponse & {
    completed: boolean;
    loading: boolean;
  };
  boxNames: A_BoxNames;
  abiDetails: {
    abi: ABIContractParams;
    loaded: boolean;
    present: boolean;
  };
  hashes: ApplicationHashes;
}

const initialState: Application = {
  loading: false,
  error: false,
  information: {
    id: 0,
    params: {
      "approval-program": "",
      "clear-state-program": "",
      creator: "",
      "global-state": [],
      "global-state-schema": {
        "num-byte-slice": 0,
        "num-uint": 0,
      },
      "local-state-schema": {
        "num-byte-slice": 0,
        "num-uint": 0,
      },
    },
  },
  hashes: {
    sha256: {
      approvalPages: [],
      approval: "",
      clear: "",
    },
    sha512_256: {
      approvalPages: [],
      approval: "",
      clear: "",
    },
  },
  boxNames: [],
  transactionsDetails: {
    "next-token": "",
    completed: false,
    loading: false,
    transactions: [],
  },
  abiDetails: {
    abi: {
      name: "",
      methods: [],
    },
    loaded: false,
    present: false,
  },
};

export const loadApplication = createAsyncThunk(
  "application/loadApplication",
  async (id: number, thunkAPI) => {
    const { dispatch } = thunkAPI;
    try {
      const applicationClient = new ApplicationClient(explorer.network);
      dispatch(resetApplication());
      dispatch(setLoading(true));
      const applicationInfo = await applicationClient.get(id);
      dispatch(calculateApplicationHashes(applicationInfo));
      dispatch(loadApplicationBoxNames(id));
      dispatch(loadApplicationTransactions(id));
      dispatch(setLoading(false));
      return applicationInfo;
    } catch (e: any) {
      dispatch(handleException(e));
      dispatch(setError(true));
      dispatch(setLoading(false));
    }
  }
);

export const calculateApplicationHashes = createAsyncThunk(
    "application/calculateApplicationHashes",
    async (appInfo: A_Application, thunkAPI) => {
      try {
        return await getProgramHashes(appInfo);
      } catch (e: any) {
      }
    }
  );

export const loadApplicationBoxNames = createAsyncThunk(
  "application/loadApplicationBoxNames",
  async (id: number, thunkAPI) => {
    const { dispatch } = thunkAPI;
    try {
      const boxClient = new BoxClient(explorer.network);
      dispatch(setLoading(true));
      const boxNameResponse = await boxClient.getBoxNames(id);
      dispatch(setLoading(false));
      return boxNameResponse;
    } catch (e: any) {
      dispatch(handleException(e));
      dispatch(setError(true));
      dispatch(setLoading(false));
    }
  }
);

export const loadApplicationBox = createAsyncThunk(
  "application/loadApplicationBox",
  async ({ id, name }: { id: number; name: string }, thunkAPI) => {
    const { dispatch } = thunkAPI;
    try {
      const boxClient = new BoxClient(explorer.network);
      dispatch(setLoading(true));
      const box = await boxClient.getBox(id, name);
      dispatch(setLoading(false));
      return box;
    } catch (e: any) {
      dispatch(handleException(e));
      dispatch(setError(true));
      dispatch(setLoading(false));
    }
  }
);

export const loadApplicationTransactions = createAsyncThunk(
  "application/loadApplicationTransactions",
  async (id: number, thunkAPI) => {
    const { dispatch, getState } = thunkAPI;
    try {
      // @ts-ignore
      const { application } = getState();

      if (application.transactionsDetails.completed) {
        return;
      }

      dispatch(setTxnsLoading(true));
      const applicationClient = new ApplicationClient(explorer.network);
      const response = await applicationClient.getApplicationTransactions(
        id,
        application.transactionsDetails["next-token"]
      );
      dispatch(setTxnsLoading(false));
      return response;
    } catch (e: any) {
      dispatch(setTxnsLoading(false));
      dispatch(handleException(e));
    }
  }
);

export const applicationSlice = createSlice({
  name: "application",
  initialState,
  reducers: {
    resetApplication: (state) => initialState,
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    setTxnsLoading: (state, action: PayloadAction<boolean>) => {
      state.transactionsDetails.loading = action.payload;
    },
    setError: (state, action: PayloadAction<boolean>) => {
      state.error = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(
      loadApplication.fulfilled,
      (state, action: PayloadAction<A_Application>) => {
        if (action.payload) {
          state.information = action.payload;
        }
      }
    );
    builder.addCase(
        calculateApplicationHashes.fulfilled,
        (state, action: PayloadAction<ApplicationHashes>) => {
          if (action.payload) {
            state.hashes = action.payload;
          }
        }
      );
    builder.addCase(
      loadApplicationBoxNames.fulfilled,
      (state, action: PayloadAction<A_BoxNames>) => {
        if (action.payload) {
          state.boxNames = action.payload;
        }
      }
    );
    builder.addCase(
      loadApplicationTransactions.fulfilled,
      (state, action: PayloadAction<A_ApplicationTransactionsResponse>) => {
        if (action.payload) {
          const nextToken = action.payload["next-token"];

          state.transactionsDetails["next-token"] = nextToken;
          state.transactionsDetails.transactions = [
            ...state.transactionsDetails.transactions,
            ...action.payload.transactions,
          ];

          if (!nextToken) {
            state.transactionsDetails.completed = true;
          }
        }
      }
    );
  },
});

export const { resetApplication, setLoading, setError, setTxnsLoading } =
  applicationSlice.actions;
export default applicationSlice.reducer;
