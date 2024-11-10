import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import React from "react";
import Explorer from "../Modules/Explorer/Explorer/Explorer";
import Home from "../Modules/Explorer/Home/Home";
import Accounts from "../Modules/Explorer/Lists/Accounts/Accounts";
import Transactions from "../Modules/Explorer/Lists/Transactions/Transactions";
import Assets from "../Modules/Explorer/Lists/Assets/Assets";
import Applications from "../Modules/Explorer/Lists/Applications/Applications";
import Account from "../Modules/Explorer/Records/Account/Account";
import AccountAssets from "../Modules/Explorer/Records/Account/RelatedList/AccountAssets/AccountAssets";
import AccountTransactions from "../Modules/Explorer/Records/Account/RelatedList/AccountTransactions/AccountTransactions";
import AccountCreatedAssets
    from "../Modules/Explorer/Records/Account/RelatedList/AccountCreatedAssets.tsx/AccountCreatedAssets";
import AccountCreatedApplications
    from "../Modules/Explorer/Records/Account/RelatedList/AccountCreatedApplications.tsx/AccountCreatedApplications";
import AccountOptedApplications
    from "../Modules/Explorer/Records/Account/RelatedList/AccountOptedApplications.tsx/AccountOptedApplications";
import AccountControllerTo
    from "../Modules/Explorer/Records/Account/RelatedList/AccountControllerTo.tsx/AccountControllerTo";
import Block from "../Modules/Explorer/Records/Block/Block";
import BlockTransactions from "../Modules/Explorer/Records/Block/RelatedList/BlockTransactions/BlockTransactions";
import Asset from "../Modules/Explorer/Records/Asset/Asset";
import AssetTransactions from "../Modules/Explorer/Records/Asset/RelatedList/AssetTransactions/AssetTransactions";
import Application from "../Modules/Explorer/Records/Application/Application";
import ApplicationTransactions
    from "../Modules/Explorer/Records/Application/RelatedList/ApplicationTransactions/ApplicationTransactions";
import Transaction from "../Modules/Explorer/Records/Transaction/Transaction";
import Group from "../Modules/Explorer/Records/Group/Group";
import GroupTransactions from "../Modules/Explorer/Records/Group/RelatedList/GroupTransactions/GroupTransactions";
import Loader from "../Common/Loader/Loader";
import AppSnackbar from "./AppSnackbar";
import Footer from "./Footer";
import StripExplorerFromPath from "./StripExplorerFromPath";
import SearchFromPath from "./SearchFromPath";

function AppRouter(): JSX.Element {
    return (<div>
        <BrowserRouter>
            <div className="app-container">
                <div className="app-right">
                    <div className="content-wrapper">
                        <div className="content-container">
                            <Explorer>
                                <Routes>
                                    <Route index element={<Home></Home>} />
                                    <Route path="/explorer/home" element={<Navigate to="/" replace />} />
                                    <Route path="/accounts" element={<Accounts></Accounts>} />
                                    <Route path="/transactions" element={<Transactions></Transactions>} />
                                    <Route path="/assets" element={<Assets></Assets>} />
                                    <Route path="/applications" element={<Applications></Applications>} />
                                    <Route path="/account/:address" element={<Account></Account>}>
                                        <Route path="assets" element={<AccountAssets></AccountAssets>} />
                                        <Route path="transactions" element={<AccountTransactions></AccountTransactions>} />
                                        <Route path="created-assets" element={<AccountCreatedAssets></AccountCreatedAssets>} />
                                        <Route path="created-applications" element={<AccountCreatedApplications></AccountCreatedApplications>} />
                                        <Route path="opted-applications" element={<AccountOptedApplications></AccountOptedApplications>} />
                                        <Route path="controller" element={<AccountControllerTo />} />
                                        <Route path="" element={<Navigate to="transactions" replace />}/>
                                    </Route>
                                    <Route path="/block/:id" element={<Block></Block>}>
                                        <Route path="transactions" element={<BlockTransactions></BlockTransactions>} />
                                        <Route path="" element={<Navigate to="transactions" replace />}/>
                                    </Route>
                                    <Route path="/asset/:id" element={<Asset></Asset>}>
                                        <Route path="transactions" element={<AssetTransactions></AssetTransactions>} />
                                        <Route path="" element={<Navigate to="transactions" replace />}/>
                                    </Route>
                                    <Route path="/application/:id" element={<Application></Application>}>
                                        <Route path="transactions" element={<ApplicationTransactions></ApplicationTransactions>} />
                                        <Route path="" element={<Navigate to="transactions" replace />}/>
                                    </Route>
                                    <Route path="/transaction/:id" element={<Transaction></Transaction>}></Route>
                                    <Route path="/group/:id/:blockId" element={<Group></Group>}>
                                        <Route path="transactions" element={<GroupTransactions></GroupTransactions>} />
                                        <Route path="" element={<Navigate to="transactions" replace />}/>
                                    </Route>
                                    <Route path="/explorer/*" element={<StripExplorerFromPath />} />
                                    <Route path="*" element={<SearchFromPath />}/>
                                </Routes>
                            </Explorer>
                        </div>
                        <Footer />
                    </div>
                </div>
            </div>
            <Loader></Loader>
            <AppSnackbar></AppSnackbar>
        </BrowserRouter>
    </div>);
}

export default AppRouter;
