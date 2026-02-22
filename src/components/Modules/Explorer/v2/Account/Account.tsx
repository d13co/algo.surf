import React, { Component, useRef, useCallback, useMemo } from "react";
import {
  matchPath,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useSelector } from "react-redux";
import { RootState } from "src/redux/store";
import { CoreAccount } from "src/packages/core-sdk/classes/core/CoreAccount";
import {
  useAccount,
  useEscrowOf,
  useAccountTransactions,
  useControllingAccounts,
} from "src/hooks/useAccount";
import { useValidator } from "src/hooks/useValidator";
import { useReverseNFD, useReverseNFDs } from "src/components/Common/UseNFD";
import { useTinyAssets } from "src/components/Common/UseTinyAsset";
import LoadingTile from "src/components/v2/LoadingTile";
import JsonViewer from "src/components/v2/JsonViewer";
import CustomError from "../CustomError";
import Copyable from "src/components/v2/Copyable";
import NumberFormatCopy from "src/components/v2/NumberFormatCopy";
import OpenInMenu from "src/components/v2/OpenInMenu";
import AlgoIcon from "../../AlgoIcon/AlgoIcon";
import useTitle from "src/components/Common/UseTitle/UseTitle";
import LinkToAccount from "../Links/LinkToAccount";
import LinkToApplication from "../Links/LinkToApplication";
import DymNFD from "../../Records/DymNFD";
import { microalgosToAlgos } from "algosdk";
import { network } from "src/packages/core-sdk/constants";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "src/components/v2/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "src/components/v2/ui/tooltip";

const isMainnet = network === "Mainnet";
const tinymanAppEscrow =
  "XSKED5VKZZCSYNDWXZJI65JM2HP7HZFJWCOBIMOONKHTK5UVKENBNVDEYM";

class TabErrorBoundary extends Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="mt-4 rounded-lg p-5 bg-background-card text-sm text-muted-foreground">
          <div className="font-semibold text-foreground mb-1">
            Something went wrong
          </div>
          <div>{this.state.error.message}</div>
        </div>
      );
    }
    return this.props.children;
  }
}

function plural(num: number): string {
  return num !== 1 ? "s" : "";
}

function Chip({
  children,
  className = "",
  onClick,
  variant = "success",
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
  variant?: "success" | "warning" | "tinyman";
}) {
  const colors = {
    success: "border-primary text-primary",
    warning: "border-yellow-500 text-yellow-500",
    tinyman: "bg-[#f1fe68] text-[#0e0b1c] border-transparent",
  };
  return (
    <span
      className={`inline-flex items-center text-xs border rounded px-2.5 py-0.5 ${colors[variant]} ${onClick ? "cursor-pointer" : "cursor-default"} ${className}`}
      onClick={onClick}
    >
      {children}
    </span>
  );
}

function Account(): JSX.Element {
  const navigate = useNavigate();
  const params = useParams();
  const { address } = params;

  const {
    data: accountInfo,
    isLoading,
    isError,
    error,
  } = useAccount(address);
  const { data: escrowOf } = useEscrowOf(address);
  const { data: validatorData } = useValidator(address);
  const { data: nfd } = useReverseNFD(address);
  const { data: txnData } = useAccountTransactions(address);
  const { data: controllerData, fetchNextPage: fetchNextControllerPage, hasNextPage: hasNextControllerPage } = useControllingAccounts(address);

  const addressBook = useSelector((state: RootState) => state.addressBook);

  const [searchParams] = useSearchParams();
  const altNFDQuery = searchParams.get("alt");
  const altNFDAccounts = useMemo(() => {
    if (nfd && altNFDQuery) {
      return altNFDQuery.split(":");
    }
    return [];
  }, [altNFDQuery, nfd]);

  const { data: confirmAltNFDAccounts } = useReverseNFDs(altNFDAccounts);

  const altNFDAccountsToShow = useMemo(() => {
    if (!nfd || !confirmAltNFDAccounts) return;
    return confirmAltNFDAccounts
      .filter(([_, _nfd]) => nfd === _nfd)
      .map(([addr]) => addr);
  }, [nfd, confirmAltNFDAccounts]);

  const addressLabel = useMemo(
    () => addressBook.data[address],
    [address, addressBook.data]
  );

  const accountInstance = accountInfo
    ? new CoreAccount(accountInfo)
    : null;

  const assetIdsToLookup = useMemo(() => {
    if (accountInfo?.["auth-addr"] === tinymanAppEscrow) {
      return accountInfo.assets.map((a) => a["asset-id"]);
    }
    return [];
  }, [accountInfo]);

  const { data: optedAssets } = useTinyAssets(assetIdsToLookup);

  const tinymanPool = useMemo(() => {
    if (!accountInfo || accountInfo["auth-addr"] !== tinymanAppEscrow) {
      return false;
    }
    const type = (optedAssets ?? []).find(
      ({ params: { "unit-name": u } }) => u === "TMPOOL2"
    );
    return type ? type.params.name.replace("TinymanPool2.0 ", "") : false;
  }, [optedAssets, accountInfo]);

  const controllingAccounts = useMemo(
    () => controllerData?.pages.flatMap((p) => p.accounts) ?? [],
    [controllerData]
  );

  // Fetch more controller pages if available
  React.useEffect(() => {
    if (hasNextControllerPage) {
      fetchNextControllerPage();
    }
  }, [hasNextControllerPage, fetchNextControllerPage]);

  const numControlledAccounts = controllingAccounts.length;

  const transactions = useMemo(
    () => txnData?.pages.flatMap((p) => p.transactions) ?? [],
    [txnData]
  );

  const [lastSent, isMultiSig, isLogicSig, isClosed] = useMemo(() => {
    if (!accountInfo) return [undefined, false, false, false];
    const lastSent = transactions.find(
      ({ sender }) => sender === address
    );
    const isMultiSig = !!lastSent?.signature?.multisig;
    const isLogicSig = !!lastSent?.signature?.logicsig;
    const isClosed = accountInfo.amount === 0 && !!lastSent;
    return [lastSent, isMultiSig, isLogicSig, isClosed];
  }, [address, accountInfo, transactions]);

  const hasOptedAssets = accountInfo?.assets?.length ?? 0;
  const hasCreatedAssets = accountInfo?.["created-assets"]?.length ?? 0;

  const createdApplications = useMemo(() => {
    if (!accountInfo) return [];
    return [...new CoreAccount(accountInfo).getCreatedApplications()]
      .sort((a, b) => b.id - a.id);
  }, [accountInfo]);

  const optedApplications = useMemo(() => {
    if (!accountInfo) return [];
    return [...new CoreAccount(accountInfo).getOptedApplications()]
      .sort((a, b) => b.id - a.id);
  }, [accountInfo]);

  const hasCreatedApps = createdApplications.length;
  const hasOptedApps = optedApplications.length;
  const hasAssetOrAppInfo =
    hasOptedAssets || hasCreatedAssets || hasOptedApps || hasCreatedApps;
  const hasValidatorData =
    (validatorData?.proposals?.length ?? 0) > 0 ||
    (validatorData?.suspensions?.length ?? 0) > 0;

  const tabsRef = useRef<HTMLDivElement>(null);

  const scrollToControllerTo = useCallback(
    (e: React.MouseEvent) => {
      navigate(`/account/${address}/controller`);
      if (tabsRef?.current) tabsRef.current.scrollIntoView();
      e.preventDefault();
    },
    [tabsRef, address, navigate]
  );

  const scrollToValidator = useCallback(
    (e: React.MouseEvent) => {
      navigate(`/account/${address}/validator`);
      if (tabsRef?.current) tabsRef.current.scrollIntoView();
      e.preventDefault();
    },
    [tabsRef, address, navigate]
  );

  let tabValue = "transactions";
  const { pathname } = useLocation();

  if (hasOptedAssets && matchPath("/account/:address/assets", pathname)) {
    tabValue = "assets";
  } else if (
    hasCreatedAssets &&
    matchPath("/account/:address/created-assets", pathname)
  ) {
    tabValue = "created-assets";
  } else if (
    hasCreatedApps &&
    matchPath("/account/:address/created-applications", pathname)
  ) {
    tabValue = "created-applications";
  } else if (
    hasOptedApps &&
    (matchPath("/account/:address/opted-applications", pathname) ||
      matchPath("/account/:address/opted-applications/:id", pathname))
  ) {
    tabValue = "opted-applications";
  } else if (
    numControlledAccounts &&
    matchPath("/account/:address/controller", pathname)
  ) {
    tabValue = "controlling-accounts";
  } else if (
    hasValidatorData &&
    matchPath("/account/:address/validator", pathname)
  ) {
    tabValue = "validator";
  }

  useTitle(`Account ${address}`);

  return (
    <div className="mt-5">
      <div>
        {isError ? (
          <CustomError error={error?.message} />
        ) : (
          <div>
            {nfd && altNFDAccountsToShow?.length ? (
              <DymNFD nfd={nfd} accounts={altNFDAccountsToShow} />
            ) : null}

            <div className="flex justify-between items-center text-xl font-bold">
              <div>Account overview</div>
              <div className="flex items-center gap-2.5">
                <JsonViewer
                  obj={accountInfo ?? {}}
                  filename={`account-${address}.json`}
                  title={`Account ${address?.slice(0, 16)}..`}
                />
                <OpenInMenu pageType="account" id={address} />
              </div>
            </div>

            {isLoading || !accountInstance ? (
              <LoadingTile />
            ) : (
              <div className="mt-8">
                {nfd ? (
                  <div className="mb-1 text-lg" style={{ color: "#f65624" }}>
                    <a
                      href={`https://app.nf.domains/name/${nfd}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                      style={{ color: "#f65624", textDecorationStyle: "dotted" }}
                    >
                      {nfd}
                    </a>
                    <Copyable style={{ color: "#f65624" }} value={nfd} />
                  </div>
                ) : null}

                <div className="mb-5">
                  <div className="flex items-center text-lg font-normal">
                    <span className="break-all max-w-[calc(100vw-20px)] overflow-hidden text-ellipsis">
                      {accountInfo.address}
                    </span>
                    <Copyable value={accountInfo.address} />
                  </div>

                  <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
                    {addressLabel ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Chip variant="success">{addressLabel}</Chip>
                          </TooltipTrigger>
                          <TooltipContent className="bg-black text-white border-border">
                            <p>This account is labelled in the algo.surf address book as: {addressLabel}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : null}

                    {tinymanPool ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Chip variant="tinyman">
                              Tinyman 2 &middot; {tinymanPool}
                            </Chip>
                          </TooltipTrigger>
                          <TooltipContent className="bg-black text-white border-border">
                            <p>This account is the Tinyman 2 liquidity pool for {tinymanPool}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : null}

                    {accountInfo.status === "Online" ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <a
                              href="#"
                              onClick={scrollToValidator}
                              className="no-underline"
                            >
                              <Chip variant="success" onClick={scrollToValidator}>
                                Validator
                              </Chip>
                            </a>
                          </TooltipTrigger>
                          <TooltipContent className="bg-black text-white border-border">
                            <p>Click to view validator information.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : null}

                    {accountInfo.status === "Not Participating" ? (
                      <Chip variant="warning">Not Participating</Chip>
                    ) : null}

                    {accountInfo["incentive-eligible"] === true ? (
                      <Chip variant="success">Incentives Eligible</Chip>
                    ) : null}

                    {escrowOf ? (
                      <a
                        href={`/application/${escrowOf}`}
                        onClick={(e) => {
                          e.preventDefault();
                          navigate(`/application/${escrowOf}`);
                        }}
                      >
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Chip variant="success" onClick={() => {}}>
                                App Escrow
                              </Chip>
                            </TooltipTrigger>
                            <TooltipContent className="bg-black text-white border-border">
                              <p>This is an application escrow account. Click to view parent application.</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </a>
                    ) : null}

                    {isMultiSig && lastSent ? (
                      <a
                        href={`/transaction/${lastSent.id}#multisig`}
                        onClick={(e) => {
                          e.preventDefault();
                          navigate(`/transaction/${lastSent.id}#multisig`);
                        }}
                      >
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Chip variant="success" onClick={() => {}}>
                                MultiSig
                              </Chip>
                            </TooltipTrigger>
                            <TooltipContent className="bg-black text-white border-border">
                              <p>This is a multi-signature account. Click to view configuration.</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </a>
                    ) : null}

                    {isLogicSig && lastSent ? (
                      <a
                        href={`/transaction/${lastSent.id}#logicsig`}
                        onClick={(e) => {
                          e.preventDefault();
                          navigate(`/transaction/${lastSent.id}#logicsig`);
                        }}
                      >
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Chip variant="success" onClick={() => {}}>
                                LogicSig
                              </Chip>
                            </TooltipTrigger>
                            <TooltipContent className="bg-black text-white border-border">
                              <p>This account is controlled by a stateless smart contract (logic sig). Click to view program source.</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </a>
                    ) : null}

                    {isClosed ? (
                      <Chip variant="warning">Closed</Chip>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-lg p-5 pt-2.5 bg-background-card">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="mt-2.5">
                      <div className="text-muted-foreground">Balance</div>
                      <div className="mt-2.5 inline-flex items-center gap-1">
                        <AlgoIcon />
                        <NumberFormatCopy
                          value={microalgosToAlgos(accountInstance.getBalance())}
                          displayType={"text"}
                          thousandSeparator={true}
                        />
                      </div>
                    </div>

                    {accountInfo.amount ? (
                      <div className="mt-2.5">
                        <div className="text-muted-foreground">
                          Minimum balance
                        </div>
                        <div className="mt-2.5 inline-flex items-center gap-1">
                          <AlgoIcon />
                          <NumberFormatCopy
                            value={microalgosToAlgos(accountInstance.getMinBalance())}
                            displayType={"text"}
                            thousandSeparator={true}
                          />
                        </div>
                      </div>
                    ) : null}

                    {escrowOf ? (
                      <div className="mt-2.5">
                        <div className="text-muted-foreground">
                          Application Escrow
                        </div>
                        <div className="mt-2.5">
                          <LinkToApplication id={escrowOf} copy="right" />
                        </div>
                      </div>
                    ) : null}

                    {numControlledAccounts ? (
                      <div className="mt-2.5">
                        <div className="text-muted-foreground">
                          Controller of
                        </div>
                        <div className="mt-2.5">
                          <a
                            href="#"
                            onClick={scrollToControllerTo}
                            className="text-primary hover:underline"
                          >
                            {numControlledAccounts} account
                            {plural(numControlledAccounts)}
                          </a>
                        </div>
                      </div>
                    ) : null}

                    {accountInfo["auth-addr"] ? (
                      <div className="mt-2.5">
                        <div className="text-muted-foreground">
                          Rekeyed to
                        </div>
                        <div className="mt-2.5 text-[13px] break-words overflow-hidden">
                          <LinkToAccount
                            copySize="m"
                            strip={9}
                            address={accountInfo["auth-addr"]}
                          />
                        </div>
                      </div>
                    ) : null}

                    {hasOptedAssets ? (
                      <div className="mt-2.5">
                        <div className="text-muted-foreground">
                          Holding assets
                        </div>
                        <div className="mt-2.5">
                          {accountInfo.assets.length}
                        </div>
                      </div>
                    ) : null}

                    {hasCreatedAssets ? (
                      <div className="mt-2.5">
                        <div className="text-muted-foreground">
                          Created assets
                        </div>
                        <div className="mt-2.5">
                          {accountInfo["created-assets"].length}
                        </div>
                      </div>
                    ) : null}

                    {hasCreatedApps ? (
                      <div className="mt-2.5">
                        <div className="text-muted-foreground">
                          Created apps
                        </div>
                        <div className="mt-2.5">
                          {createdApplications.length}
                        </div>
                      </div>
                    ) : null}

                    {hasOptedApps ? (
                      <div className="mt-2.5">
                        <div className="text-muted-foreground">
                          Opted applications
                        </div>
                        <div className="mt-2.5">
                          {optedApplications.length}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="mt-6 overflow-hidden" ref={tabsRef}>
                  <Tabs value={tabValue}>
                    <TabsList className="flex bg-transparent border-b border-border rounded-none w-full justify-start overflow-x-auto flex-nowrap">
                      <TabsTrigger
                        value="transactions"
                        className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none text-muted-foreground data-[state=active]:text-foreground"
                        onClick={() => navigate("/account/" + address)}
                      >
                        Transactions
                      </TabsTrigger>

                      {hasOptedAssets ? (
                        <TabsTrigger
                          value="assets"
                          className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none text-muted-foreground data-[state=active]:text-foreground"
                          onClick={() =>
                            navigate("/account/" + address + "/assets")
                          }
                        >
                          Assets
                        </TabsTrigger>
                      ) : null}

                      {hasCreatedAssets ? (
                        <TabsTrigger
                          value="created-assets"
                          className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none text-muted-foreground data-[state=active]:text-foreground"
                          onClick={() =>
                            navigate("/account/" + address + "/created-assets")
                          }
                        >
                          Created assets
                        </TabsTrigger>
                      ) : null}

                      {hasCreatedApps ? (
                        <TabsTrigger
                          value="created-applications"
                          className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none text-muted-foreground data-[state=active]:text-foreground"
                          onClick={() =>
                            navigate(
                              "/account/" + address + "/created-applications"
                            )
                          }
                        >
                          Created apps
                        </TabsTrigger>
                      ) : null}

                      {hasOptedApps ? (
                        <TabsTrigger
                          value="opted-applications"
                          className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none text-muted-foreground data-[state=active]:text-foreground"
                          onClick={() =>
                            navigate(
                              "/account/" + address + "/opted-applications"
                            )
                          }
                        >
                          Opted applications
                        </TabsTrigger>
                      ) : null}

                      {numControlledAccounts ? (
                        <TabsTrigger
                          value="controlling-accounts"
                          className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none text-muted-foreground data-[state=active]:text-foreground"
                          onClick={() =>
                            navigate("/account/" + address + "/controller")
                          }
                        >
                          Controlling accounts
                        </TabsTrigger>
                      ) : null}

                      {hasValidatorData ? (
                        <TabsTrigger
                          value="validator"
                          className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none text-muted-foreground data-[state=active]:text-foreground"
                          onClick={() =>
                            navigate("/account/" + address + "/validator")
                          }
                        >
                          Validator Data
                        </TabsTrigger>
                      ) : null}
                    </TabsList>
                  </Tabs>

                  <TabErrorBoundary>
                    <Outlet />
                  </TabErrorBoundary>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default Account;
