import { configureStore } from '@reduxjs/toolkit';
import abiStudio from "./abi/actions/abiStudio";
import accountReducer from "./explorer/actions/account";
import accountsReducer from "./explorer/actions/accounts";
import addressBookReducer from "./explorer/actions/addressBook";
import app from "./app/actions/app";
import applicationReducer from "./explorer/actions/application";
import applicationsReducer from "./explorer/actions/applications";
import arc from "./arcPortal/actions/arc";
import arcs from "./arcPortal/actions/arcs";
import assetReducer from "./explorer/actions/asset";
import assetsReducer from "./explorer/actions/assets";
import blockReducer from "./explorer/actions/block";
import connectWallet from "./wallet/actions/connectWallet";
import developerApiReducer from "./developerApi/actions/developerApi";
import devWallets from "./devWallets/actions/devWallets";
import groupReducer from "./explorer/actions/group";
import kmd from "./explorer/actions/kmd";
import liveData from "./explorer/actions/liveData";
import loaderReducer from "./common/actions/loader";
import node from "./network/actions/node";
import settingsReducer from "./settings/actions/settings";
import signer from "./wallet/actions/signer";
import snackbarReducer from './common/actions/snackbar';
import transactionReducer from "./explorer/actions/transaction";
import transactionsReducer from "./explorer/actions/transactions";
import validatorReducer from "./explorer/actions/validator";
import wallet from "./wallet/actions/wallet";

export const store = configureStore({
    reducer: {
        abiStudio: abiStudio,
        account: accountReducer,
        accounts: accountsReducer,
        addressBook: addressBookReducer,
        app: app,
        application: applicationReducer,
        applications: applicationsReducer,
        arc: arc,
        arcs: arcs,
        asset: assetReducer,
        assets: assetsReducer,
        block: blockReducer,
        connectWallet: connectWallet,
        developerApi: developerApiReducer,
        devWallets: devWallets,
        group: groupReducer,
        kmd: kmd,
        liveData: liveData,
        loader: loaderReducer,
        node: node,
        settings: settingsReducer,
        signer: signer,
        snackbar: snackbarReducer,
        transactions: transactionsReducer,
        transaction: transactionReducer,
        wallet: wallet,
        validator: validatorReducer,
    },
});

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>
// Inferred type: {posts: PostsState, comments: CommentsState, users: UsersState}
export type AppDispatch = typeof store.dispatch
