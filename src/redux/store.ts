import { configureStore } from '@reduxjs/toolkit';
import abiStudio from "./abi/actions/abiStudio";
import accountsReducer from "./explorer/actions/accounts";
import addressBookReducer from "./explorer/actions/addressBook";
import app from "./app/actions/app";
import applicationReducer from "./explorer/actions/application";
import applicationsReducer from "./explorer/actions/applications";
import assetsReducer from "./explorer/actions/assets";
import developerApiReducer from "./developerApi/actions/developerApi";
import kmd from "./explorer/actions/kmd";
import loaderReducer from "./common/actions/loader";
import node from "./network/actions/node";
import settingsReducer from "./settings/actions/settings";
import snackbarReducer from './common/actions/snackbar';
import transactionReducer from "./explorer/actions/transaction";
import transactionsReducer from "./explorer/actions/transactions";

export const store = configureStore({
    reducer: {
        abiStudio: abiStudio,
        accounts: accountsReducer,
        addressBook: addressBookReducer,
        app: app,
        application: applicationReducer,
        applications: applicationsReducer,
        assets: assetsReducer,
        developerApi: developerApiReducer,
        kmd: kmd,
        loader: loaderReducer,
        node: node,
        settings: settingsReducer,
        snackbar: snackbarReducer,
        transactions: transactionsReducer,
        transaction: transactionReducer,
    },
});

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>
// Inferred type: {posts: PostsState, comments: CommentsState, users: UsersState}
export type AppDispatch = typeof store.dispatch
