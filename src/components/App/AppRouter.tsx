import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import React, { lazy, Suspense } from "react";
import Explorer from "../Modules/Explorer/Explorer/Explorer";
import Loader from "../Common/Loader/Loader";
import AppSnackbar from "./AppSnackbar";
import Footer from "./Footer";
import { queryClient } from "../../db/query-client";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { persister } from "../../db/query-persister";
import { AbelAssetsProvider } from "../Common/AbelAssetsProvider";
import { GlobalUIProvider } from "../../contexts/GlobalUIContext";
import LoadingTile from "../v2/LoadingTile";

const Home = lazy(() => import("../Modules/Explorer/Home/Home"));
const Accounts = lazy(() => import("../Modules/Explorer/v2/Account/Accounts"));
const Transactions = lazy(() => import("../Modules/Explorer/v2/Transaction/Transactions"));
const Assets = lazy(() => import("../Modules/Explorer/v2/Asset/Assets"));
const Applications = lazy(() => import("../Modules/Explorer/v2/Application/Applications"));
const Account = lazy(() => import("../Modules/Explorer/v2/Account/Account"));
const AccountAssets = lazy(() => import("../Modules/Explorer/v2/Account/AccountAssets"));
const AccountTransactions = lazy(() => import("../Modules/Explorer/v2/Account/AccountTransactions"));
const AccountCreatedAssets = lazy(() => import("../Modules/Explorer/v2/Account/AccountCreatedAssets"));
const AccountCreatedApplications = lazy(() => import("../Modules/Explorer/v2/Account/AccountCreatedApplications"));
const AccountOptedApplications = lazy(() => import("../Modules/Explorer/v2/Account/AccountOptedApplications"));
const AccountControllerTo = lazy(() => import("../Modules/Explorer/v2/Account/AccountControllerTo"));
const AccountValidator = lazy(() => import("../Modules/Explorer/v2/Account/AccountValidator"));
const Block = lazy(() => import("../Modules/Explorer/v2/Block/Block"));
const BlockTransactions = lazy(() => import("../Modules/Explorer/v2/Block/BlockTransactions"));
const Asset = lazy(() => import("../Modules/Explorer/v2/Asset/Asset"));
const AssetTransactions = lazy(() => import("../Modules/Explorer/v2/Asset/AssetTransactions"));
const Application = lazy(() => import("../Modules/Explorer/v2/Application/Application"));
const ApplicationTransactions = lazy(() => import("../Modules/Explorer/v2/Application/ApplicationTransactions"));
const ApplicationBoxes = lazy(() => import("../Modules/Explorer/v2/Application/ApplicationBoxes"));
const Transaction = lazy(() => import("../Modules/Explorer/v2/Transaction/Transaction"));
const Group = lazy(() => import("../Modules/Explorer/v2/Group/Group"));
const GroupTransactions = lazy(() => import("../Modules/Explorer/v2/Group/GroupTransactions"));
const StripExplorerFromPath = lazy(() => import("./StripExplorerFromPath"));
const SearchFromPath = lazy(() => import("./SearchFromPath"));

const PERSIST_OPTIONS = { persister };

function AppRouter(): JSX.Element {
  return (
    <div>
      <BrowserRouter>
        <PersistQueryClientProvider
          persistOptions={PERSIST_OPTIONS}
          client={queryClient}
        >
          <GlobalUIProvider>
          <AbelAssetsProvider>
            <div className="flex flex-col items-center justify-start">
              <div className="w-full max-w-[1280px]">
                <div className="overflow-auto min-h-svh flex flex-col">
                  <div className="grow mx-5 mt-2.5 md:mx-[100px] md:mt-5">
                    <Explorer>
                      <Suspense fallback={<LoadingTile />}>
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
                      </Suspense>
                    </Explorer>
                  </div>
                  <Footer />
                </div>
              </div>
            </div>
            <Loader></Loader>
            <AppSnackbar></AppSnackbar>
          </AbelAssetsProvider>
          </GlobalUIProvider>
        </PersistQueryClientProvider>
      </BrowserRouter>
    </div>
  );
}

export default AppRouter;
