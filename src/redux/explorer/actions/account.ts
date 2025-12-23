import {createAsyncThunk, createSlice, PayloadAction} from '@reduxjs/toolkit'
import {A_AccountInformation, A_Application, A_AppsLocalState} from '../../../packages/core-sdk/types';
import {handleException} from "../../common/actions/exception";
import explorer from "../../../utils/dappflow";
import {A_AccountsResponse, A_AccountTransactionsResponse, AccountClient} from "../../../packages/core-sdk/clients/accountClient";
import {CoreAccount} from "../../../packages/core-sdk/classes/core/CoreAccount";

export interface Account {
    loading: boolean,
    error: boolean,
    information: A_AccountInformation,
    controllingAccounts: A_AccountsResponse & { completed: boolean, loading: boolean }
    transactionsDetails: A_AccountTransactionsResponse & {completed: boolean, loading: boolean }
    createdApplications: A_Application[],
    optedApplications: A_AppsLocalState[],
    escrowOf?: number,
}

const information: A_AccountInformation = {
    address: "",
    amount: 0,
    "auth-addr": "",
    "min-balance": 0,
    "amount-without-pending-rewards": 0,
    "apps-local-state": [],
    "apps-total-schema": {
        "num-byte-slice": 0,
        "num-uint": 0
    },
    assets: [],
    "created-apps": [],
    "created-assets": [],
    "pending-rewards": 0,
    "reward-base": 0,
    rewards: 0,
    round: 0,
    status: ""
}

const initialState: Account = {
    loading: false,
    error: false,
    information,
    controllingAccounts: { accounts: [], "next-token": "", completed: false, loading: false },
    transactionsDetails: {
        "next-token": "",
        completed: false,
        loading: false,
        transactions: []
    },
    createdApplications: [],
    optedApplications: []
}

const supportedEscrows = [
    'mainnet',
    'testnet',
    'betanet',
    'localnet',
];

const network = process.env.REACT_APP_NETWORK.toLowerCase()
const networkSupportsEscrow = () => supportedEscrows.includes(network)
const escrowUrl = `https://d13co.github.io/app-addrs/data/${network}/data`;

export const loadAccount = createAsyncThunk(
    'account/loadAccount',
    async (address: string, thunkAPI) => {
        const {dispatch} = thunkAPI;
        try {
            const accountClient = new AccountClient(explorer.network);
            dispatch(resetAccount());
            dispatch(setLoading(true));
            const accountInfo = await accountClient.getAccountInformation(address);
            dispatch(loadAuthAddressTo(accountInfo));
            dispatch(loadCreatedApplications(accountInfo));
            dispatch(loadOptedApplications(accountInfo));
            dispatch(loadAccountTransactions(accountInfo));
            if (networkSupportsEscrow()) {
                dispatch(loadEscrowOf(accountInfo));
            }
            dispatch(setLoading(false));
            return accountInfo;
        }
        catch (e: any) {
            dispatch(handleException(e));
            dispatch(setError(true));
            dispatch(setLoading(false));
        }
    }
);

export const loadEscrowOf = createAsyncThunk(
    'account/loadEscrowOf',
    async (account: A_AccountInformation, thunkAPI) => {
        const {dispatch} = thunkAPI;
        try {
            const { address } = account;
            const prefix = address.slice(0, 3);
            const resp = await fetch(`${escrowUrl}/${prefix}.json`);
            if (!resp.ok) {
                return;
            }
            const data = await resp.json();
            return data[address];
        } catch (e: any) {
            dispatch(handleException(e));
        }
    }
);

export const loadAuthAddressTo = createAsyncThunk(
    'account/loadAuthAddressTo',
    async (information: A_AccountInformation, thunkAPI) => {
        const {dispatch, getState} = thunkAPI;
        try {
            // @ts-ignore
            const {account} = getState();

            if (account.controllingAccounts.completed) {
                return;
            }
            const accountClient = new AccountClient(explorer.network);
            const response = await accountClient.getAuthAddr(information.address, account.controllingAccounts['next-token']);
            return response;
        }
        catch (e: any) {
            dispatch(handleException(e));
        }
    }
);


export const loadCreatedAssets = createAsyncThunk(
    'account/loadCreatedAssets',
    async (information: A_AccountInformation, thunkAPI) => {
        const {dispatch} = thunkAPI;
        try {
            let createdAssets = new CoreAccount(information).getCreatedAssets();
            createdAssets = createdAssets.sort((a, b) => {
                return b.index - a.index;
            });

            return createdAssets;
        }
        catch (e: any) {
            dispatch(handleException(e));
        }
    }
);

export const loadCreatedApplications = createAsyncThunk(
    'account/loadCreatedApplications',
    async (information: A_AccountInformation, thunkAPI) => {
        const {dispatch} = thunkAPI;
        try {
            let createdApplications = new CoreAccount(information).getCreatedApplications();
            createdApplications = createdApplications.sort((a, b) => {
                return b.id - a.id;
            });

            return createdApplications;
        }
        catch (e: any) {
            dispatch(handleException(e));
        }
    }
);

export const loadOptedApplications = createAsyncThunk(
    'account/loadOptedApplications',
    async (information: A_AccountInformation, thunkAPI) => {
        const {dispatch} = thunkAPI;
        try {
            let optedApplications = new CoreAccount(information).getOptedApplications();

            optedApplications = optedApplications.sort((a, b) => {
                return b.id - a.id;
            });

            return optedApplications;
        }
        catch (e: any) {
            dispatch(handleException(e));
        }
    }
);

export const loadAccountTransactions = createAsyncThunk(
    'account/loadAccountTransactions',
    async (information: A_AccountInformation, thunkAPI) => {
        const {dispatch, getState} = thunkAPI;
        try {

            // @ts-ignore
            const {account} = getState();

            if (account.transactionsDetails.completed) {
                return;
            }

            dispatch(setTxnsLoading(true));
            const accountClient = new AccountClient(explorer.network);
            const response = await accountClient.getAccountTransactions(information.address, account.transactionsDetails["next-token"]);
            dispatch(setTxnsLoading(false));
            return response;
        }
        catch (e: any) {
            dispatch(setTxnsLoading(false));
            dispatch(handleException(e));
        }
    }
);

export const accountSlice = createSlice({
    name: 'account',
    initialState,
    reducers: {
        resetAccount: state => initialState,
        setLoading: (state, action: PayloadAction<boolean> ) => {
            state.loading = action.payload;
        },
        setTxnsLoading: (state, action: PayloadAction<boolean> ) => {
            state.transactionsDetails.loading = action.payload;
        },
        setError: (state, action: PayloadAction<boolean> ) => {
            state.error = action.payload;
        },
    },
    extraReducers: (builder) => {
        builder.addCase(loadEscrowOf.fulfilled, (state, action: PayloadAction<any>) => {
            if (action.payload) {
                state.escrowOf = action.payload;
            }
        });
        builder.addCase(loadAccount.fulfilled, (state, action: PayloadAction<any>) => {
            if (action.payload) {
                state.information = action.payload;
            }
        });
        builder.addCase(loadCreatedApplications.fulfilled, (state, action: PayloadAction<A_Application[]>) => {
            if (action.payload) {
                state.createdApplications = action.payload;
            }
        });
        builder.addCase(loadOptedApplications.fulfilled, (state, action: PayloadAction<A_AppsLocalState[]>) => {
            if (action.payload) {
                state.optedApplications = action.payload;
            }
        });
        builder.addCase(loadAuthAddressTo.fulfilled, (state, action: PayloadAction<A_AccountsResponse>) => {
            if (action.payload) {
                const nextToken = action.payload["next-token"];

                state.controllingAccounts["next-token"] = nextToken;
                state.controllingAccounts.accounts = [...state.controllingAccounts.accounts, ...action.payload.accounts];

                if (!nextToken) {
                    state.controllingAccounts.completed = true;
                }
            }
        });
        builder.addCase(loadAccountTransactions.fulfilled, (state, action: PayloadAction<A_AccountTransactionsResponse>) => {
            if (action.payload) {
                const nextToken = action.payload["next-token"];

                state.transactionsDetails["next-token"] = nextToken;
                state.transactionsDetails.transactions = [...state.transactionsDetails.transactions, ...action.payload.transactions];

                if (!nextToken) {
                    state.transactionsDetails.completed = true;
                }
            }
        });
    },
});

export const {resetAccount, setLoading, setError, setTxnsLoading} = accountSlice.actions
export default accountSlice.reducer
