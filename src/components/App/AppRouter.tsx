import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import React from "react";
import Explorer from "../Modules/Explorer/Explorer/Explorer";
import Home from "../Modules/Explorer/Home/Home";
import Accounts from "../Modules/Explorer/Lists/Accounts/Accounts";
import Transactions from "../Modules/Explorer/Lists/Transactions/Transactions";
import Assets from "../Modules/Explorer/v2/Asset/Assets";
import Applications from "../Modules/Explorer/Lists/Applications/Applications";
import Account from "../Modules/Explorer/v2/Account/Account";
import AccountAssets from "../Modules/Explorer/v2/Account/AccountAssets";
import AccountTransactions from "../Modules/Explorer/v2/Account/AccountTransactions";
import AccountCreatedAssets from "../Modules/Explorer/v2/Account/AccountCreatedAssets";
import AccountCreatedApplications from "../Modules/Explorer/v2/Account/AccountCreatedApplications";
import AccountOptedApplications from "../Modules/Explorer/v2/Account/AccountOptedApplications";
import AccountControllerTo from "../Modules/Explorer/v2/Account/AccountControllerTo";
import Block from "../Modules/Explorer/v2/Block/Block";
import BlockTransactions from "../Modules/Explorer/v2/Block/BlockTransactions";
import Asset from "../Modules/Explorer/v2/Asset/Asset";
import AssetTransactions from "../Modules/Explorer/v2/Asset/AssetTransactions";
import Application from "../Modules/Explorer/v2/Application/Application";
import ApplicationTransactions from "../Modules/Explorer/v2/Application/ApplicationTransactions";
import ApplicationBoxes from "../Modules/Explorer/v2/Application/ApplicationBoxes";
import Transaction from "../Modules/Explorer/Records/Transaction/Transaction";
import Group from "../Modules/Explorer/v2/Group/Group";
import GroupTransactions from "../Modules/Explorer/v2/Group/GroupTransactions";
import Loader from "../Common/Loader/Loader";
import AppSnackbar from "./AppSnackbar";
import Footer from "./Footer";
import StripExplorerFromPath from "./StripExplorerFromPath";
import SearchFromPath from "./SearchFromPath";
import AccountValidator from "../Modules/Explorer/v2/Account/AccountValidator";
import { queryClient } from "../../db/query-client";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { persister } from "../../db/query-persister";
import { AbelAssetsProvider } from "../Common/AbelAssetsProvider";

function AppRouter(): JSX.Element {
  return (
    <div>
      <BrowserRouter>
        <PersistQueryClientProvider
          persistOptions={{ persister }}
          client={queryClient}
        >
          <AbelAssetsProvider>
            <div className="app-container">
              <div className="app-right">
                <div className="content-wrapper">
                  <div className="content-container">
                    <Explorer>
                      <Routes>
                        <Route index element={<Home></Home>} />
                        <Route
                          path="/explorer/home"
                          element={<Navigate to="/" replace />}
                        />
                        <Route
                          path="/accounts"
                          element={<Accounts></Accounts>}
                        />
                        <Route
                          path="/transactions"
                          element={<Transactions></Transactions>}
                        />
                        <Route path="/assets" element={<Assets></Assets>} />
                        <Route
                          path="/applications"
                          element={<Applications></Applications>}
                        />
                        <Route
                          path="/account/:address"
                          element={<Account></Account>}
                        >
                          <Route
                            path="assets"
                            element={<AccountAssets></AccountAssets>}
                          />
                          <Route
                            path="transactions"
                            element={<Navigate to=".." replace />}
                          />
                          <Route
                            path="created-assets"
                            element={
                              <AccountCreatedAssets></AccountCreatedAssets>
                            }
                          />
                          <Route
                            path="created-applications"
                            element={
                              <AccountCreatedApplications></AccountCreatedApplications>
                            }
                          />
                          <Route
                            path="opted-applications"
                            element={
                              <AccountOptedApplications></AccountOptedApplications>
                            }
                          />
                          <Route
                            path="opted-applications/:id"
                            element={
                              <AccountOptedApplications></AccountOptedApplications>
                            }
                          />
                          <Route
                            path="controller"
                            element={<AccountControllerTo />}
                          />
                          <Route
                            path="validator"
                            element={<AccountValidator />}
                          />
                          <Route
                            path=""
                            element={
                              <AccountTransactions></AccountTransactions>
                            }
                          />
                        </Route>
                        <Route path="/block/:id" element={<Block></Block>}>
                          <Route
                            path="transactions"
                            element={<BlockTransactions></BlockTransactions>}
                          />
                          <Route
                            path=""
                            element={<Navigate to="transactions" replace />}
                          />
                        </Route>
                        <Route path="/asset/:id" element={<Asset></Asset>}>
                          <Route
                            path="transactions"
                            element={<AssetTransactions></AssetTransactions>}
                          />
                          <Route
                            path=""
                            element={<Navigate to="transactions" replace />}
                          />
                        </Route>
                        <Route
                          path="/application/:id"
                          element={<Application></Application>}
                        >
                          <Route
                            path="transactions"
                            element={
                              <ApplicationTransactions></ApplicationTransactions>
                            }
                          />
                          <Route
                            path="boxes"
                            element={<ApplicationBoxes></ApplicationBoxes>}
                          />
                          <Route
                            path=""
                            element={<Navigate to="transactions" replace />}
                          />
                        </Route>
                        <Route
                          path="/transaction/:id"
                          element={<Transaction></Transaction>}
                        ></Route>
                        <Route
                          path="/group/:id/:blockId"
                          element={<Group></Group>}
                        >
                          <Route
                            path="transactions"
                            element={<GroupTransactions></GroupTransactions>}
                          />
                          <Route
                            path=""
                            element={<Navigate to="transactions" replace />}
                          />
                        </Route>
                        <Route
                          path="/explorer/*"
                          element={<StripExplorerFromPath />}
                        />
                        <Route path="*" element={<SearchFromPath />} />
                      </Routes>
                    </Explorer>
                  </div>
                  <Footer />
                </div>
              </div>
            </div>
            <Loader></Loader>
            <AppSnackbar></AppSnackbar>
          </AbelAssetsProvider>
        </PersistQueryClientProvider>
      </BrowserRouter>
    </div>
  );
}

export default AppRouter;
