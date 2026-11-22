import { BrowserRouter, Navigate, Route, Routes, useLocation, useMatch } from "react-router-dom";
import React, { lazy, Suspense } from "react";
import Explorer from "../Modules/Explorer/Explorer/Explorer";
import Loader from "../Common/Loader/Loader";
import AppSnackbar from "./AppSnackbar";
import RetryWaitToast from "./RetryWaitToast";
import Footer from "./Footer";
import { queryClient } from "../../db/query-client";
import { QueryClientProvider } from "@tanstack/react-query";
import { AbelAssetsProvider } from "../Common/AbelAssetsProvider";
import { GlobalUIProvider } from "../../contexts/GlobalUIContext";
import LoadingTile from "../v2/LoadingTile";
import { TimeTravelBar } from "../Modules/Explorer/v2/Versions/RoundNotice";
import LatestOnly from "../Modules/Explorer/v2/Versions/LatestOnly";

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
const AccountDelegations = lazy(() => import("../Modules/Explorer/v2/Account/AccountDelegations"));
const AccountMultisig = lazy(() => import("../Modules/Explorer/v2/Account/AccountMultisig"));
const AccountRekeys = lazy(() => import("../Modules/Explorer/v2/Account/AccountRekeys"));
const AccountController = lazy(() => import("../Modules/Explorer/v2/Account/AccountController"));
const AccountVersions = lazy(() => import("../Modules/Explorer/v2/Account/AccountVersions"));
const AccountNfdHistory = lazy(() => import("../Modules/Explorer/v2/Account/AccountNfdHistory"));
const Block = lazy(() => import("../Modules/Explorer/v2/Block/Block"));
const BlockTransactions = lazy(() => import("../Modules/Explorer/v2/Block/BlockTransactions"));
const BlockStateChanges = lazy(() => import("../Modules/Explorer/v2/Block/BlockStateChanges"));
const Asset = lazy(() => import("../Modules/Explorer/v2/Asset/Asset"));
const AssetTransactions = lazy(() => import("../Modules/Explorer/v2/Asset/AssetTransactions"));
const AssetVersions = lazy(() => import("../Modules/Explorer/v2/Asset/AssetVersions"));
const AssetHolders = lazy(() => import("../Modules/Explorer/v2/Asset/AssetHolders"));
const Application = lazy(() => import("../Modules/Explorer/v2/Application/Application"));
const ApplicationTransactions = lazy(() => import("../Modules/Explorer/v2/Application/ApplicationTransactions"));
const ApplicationBoxes = lazy(() => import("../Modules/Explorer/v2/Application/ApplicationBoxes"));
const ApplicationVersions = lazy(() => import("../Modules/Explorer/v2/Application/ApplicationVersions"));
const Transaction = lazy(() => import("../Modules/Explorer/v2/Transaction/Transaction"));
const Group = lazy(() => import("../Modules/Explorer/v2/Group/Group"));
const GroupTransactions = lazy(() => import("../Modules/Explorer/v2/Group/GroupTransactions"));
const GroupStateChanges = lazy(() => import("../Modules/Explorer/v2/Group/GroupStateChanges"));
const Fees = lazy(() => import("../Modules/Explorer/v2/Fees/Fees"));
const Tps = lazy(() => import("../Modules/Explorer/v2/Fees/Tps"));
const Upgrades = lazy(() => import("../Modules/Explorer/v2/Upgrades/Upgrades"));
const LsigTemplates = lazy(() => import("../Modules/Explorer/v2/Lsig/LsigTemplates"));
const LsigTemplate = lazy(() => import("../Modules/Explorer/v2/Lsig/LsigTemplate"));
const StripExplorerFromPath = lazy(() => import("./StripExplorerFromPath"));
const SearchFromPath = lazy(() => import("./SearchFromPath"));
const SearchResults = lazy(() => import("../Modules/Explorer/Search/SearchResults"));
const TraceDebug = lazy(() => import("../Modules/Explorer/v2/Transaction/TraceDebug"));
const ContractLibrary = lazy(() => import("../Modules/Explorer/v2/Transaction/ContractLibrary"));

/**
 * The page around the explorer. The debugger's fills the window: no time
 * travel bar, site header (it has its own), page width, margins or footer. One tree either way (the
 * wrappers it doesn't need step aside with `display: contents`), so moving
 * to or from the debugger keeps the explorer and its providers mounted.
 */
function Layout({ children }: { children: React.ReactNode }): JSX.Element {
  const full = !!useMatch("/debug/:id");
  return (
    <>
      {full ? null : <TimeTravelBar />}
      <div className={full ? "flex min-h-svh flex-col px-3 pt-2.5 md:px-5 lg:h-svh" : "flex flex-col items-center justify-start"}>
        <div className={full ? "contents" : "w-full max-w-[1280px]"}>
          <div className={full ? "contents" : "overflow-auto min-h-svh flex flex-col"}>
            <div className={full ? "contents" : "grow mx-5 mt-2.5 md:mx-[100px] md:mt-5"}>
              <Explorer className={full ? "flex min-h-0 flex-1 flex-col" : undefined} header={!full}>{children}</Explorer>
            </div>
            {full ? null : <Footer />}
          </div>
        </div>
      </div>
    </>
  );
}

/** A redirect that keeps the query string, so `?round=` survives it. */
function NavigateKeepingSearch({ to }: { to: string }): JSX.Element {
  const { search } = useLocation();
  return <Navigate to={{ pathname: to, search }} replace />;
}

function AppRouter(): JSX.Element {
  return (
    <div>
      <BrowserRouter>
        <QueryClientProvider client={queryClient}>
          <GlobalUIProvider>
          <AbelAssetsProvider>
                    <Layout>
                      <Suspense fallback={<LoadingTile />}>
                      <Routes>
                        <Route index element={<Home></Home>} />
                        <Route
                          path="/explorer/home"
                          element={<NavigateKeepingSearch to="/" />}
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
                        <Route path="/fees" element={<Fees></Fees>} />
                        <Route path="/tps" element={<Tps></Tps>} />
                        <Route path="/upgrades" element={<Upgrades />} />
                        <Route path="/lsigs" element={<LsigTemplates />} />
                        <Route path="/lsigs/:template" element={<LsigTemplate />} />
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
                            element={<NavigateKeepingSearch to=".." />}
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
                          <Route path="controller" element={<AccountController />}>
                            <Route
                              path="current"
                              element={<LatestOnly what="The accounts rekeyed to this one now"><AccountControllerTo /></LatestOnly>}
                            />
                            <Route path="history" element={<AccountRekeys side="from" />} />
                          </Route>
                          <Route
                            path="delegations"
                            element={<LatestOnly what="Delegations"><AccountDelegations /></LatestOnly>}
                          />
                          <Route
                            path="subsigners"
                            element={<LatestOnly what="Multisig signers"><AccountMultisig view="subsigners" /></LatestOnly>}
                          />
                          <Route
                            path="multisigs"
                            element={<LatestOnly what="Multisigs this key is in"><AccountMultisig view="multisigs" /></LatestOnly>}
                          />
                          <Route
                            path="rekeys"
                            element={<AccountRekeys />}
                          />
                          <Route
                            path="validator"
                            element={<AccountValidator />}
                          />
                          <Route
                            path="versions/*"
                            element={<AccountVersions />}
                          />
                          <Route
                            path="nfds"
                            element={<AccountNfdHistory />}
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
                            path="delta"
                            element={<BlockStateChanges></BlockStateChanges>}
                          />
                          <Route
                            path=""
                            element={<NavigateKeepingSearch to="transactions" />}
                          />
                        </Route>
                        <Route path="/asset/:id" element={<Asset></Asset>}>
                          <Route
                            path="transactions"
                            element={<AssetTransactions></AssetTransactions>}
                          />
                          <Route
                            path="versions/*"
                            element={<AssetVersions />}
                          />
                          <Route
                            path="holders"
                            element={<AssetHolders />}
                          />
                          <Route
                            path=""
                            element={<NavigateKeepingSearch to="transactions" />}
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
                            path="boxes/*"
                            element={<ApplicationBoxes></ApplicationBoxes>}
                          />
                          <Route
                            path="versions/*"
                            element={<ApplicationVersions />}
                          />
                          <Route
                            path=""
                            element={<NavigateKeepingSearch to="transactions" />}
                          />
                        </Route>
                        <Route
                          path="/transaction/:id/inner/*"
                          element={<Transaction></Transaction>}
                        ></Route>
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
                          <Route path="state-changes" element={<GroupStateChanges />} />
                          <Route
                            path=""
                            element={<NavigateKeepingSearch to="transactions" />}
                          />
                        </Route>
                        <Route
                          path="/explorer/*"
                          element={<StripExplorerFromPath />}
                        />
                        <Route path="/search" element={<SearchResults />} />
                        {/* A literal segment outranks /debug/:id. */}
                        <Route path="/debug/contracts" element={<ContractLibrary />} />
                        <Route path="/debug/specs" element={<NavigateKeepingSearch to="/debug/contracts" />} />
                        <Route path="/debug/:id" element={<TraceDebug />} />
                        <Route path="*" element={<SearchFromPath />} />
                      </Routes>
                      </Suspense>
                    </Layout>
            <Loader></Loader>
            {/* The toasts, stacked in one corner */}
            <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
              <RetryWaitToast />
              <AppSnackbar></AppSnackbar>
            </div>
          </AbelAssetsProvider>
          </GlobalUIProvider>
        </QueryClientProvider>
      </BrowserRouter>
    </div>
  );
}

export default AppRouter;
