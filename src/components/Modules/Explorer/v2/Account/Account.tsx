import React, { Component, useRef, useCallback, useMemo } from "react";
import {
  matchPath,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useAddressBook } from "src/hooks/useAddressBook";
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
import NumberFormat from "react-number-format";
import OpenInMenu from "src/components/v2/OpenInMenu";
import AlgoIcon from "../../AlgoIcon/AlgoIcon";
import useTitle from "src/components/Common/UseTitle/UseTitle";
import LinkToAccount from "../Links/LinkToAccount";
import LinkToApplication from "../Links/LinkToApplication";
import DymNFD from "../DymNFD";
import { microalgosToAlgos } from "algosdk";
import { toPlainJson } from "src/packages/core-sdk/utils/serialize";
import { network } from "src/packages/core-sdk/constants";
import TabsUnderline from "src/components/v2/shadcn-studio/tabs/tabs-11";
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

  const { data: addressBookData } = useAddressBook();

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
    () => addressBookData?.[address!],
    [address, addressBookData]
  );

  const accountInstance = accountInfo
    ? new CoreAccount(accountInfo)
    : null;

  const assetIdsToLookup = useMemo(() => {
    if (accountInfo?.authAddr?.toString() === tinymanAppEscrow) {
      return (accountInfo.assets ?? []).map((a) => Number(a.assetId));
    }
    return [];
  }, [accountInfo]);

  const { data: optedAssets } = useTinyAssets(assetIdsToLookup);

  const tinymanPool = useMemo(() => {
    if (!accountInfo || accountInfo.authAddr?.toString() !== tinymanAppEscrow) {
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
    const isClosed = accountInfo.amount === 0n && !!lastSent;
    return [lastSent, isMultiSig, isLogicSig, isClosed];
  }, [address, accountInfo, transactions]);

  const hasOptedAssets = accountInfo?.assets?.length ?? 0;
  const hasCreatedAssets = accountInfo?.createdAssets?.length ?? 0;

  const createdApplications = useMemo(() => {
    if (!accountInfo) return [];
    return [...new CoreAccount(accountInfo).getCreatedApplications()]
      .sort((a, b) => Number(b.id) - Number(a.id));
  }, [accountInfo]);

  const optedApplications = useMemo(() => {
    if (!accountInfo) return [];
    return [...new CoreAccount(accountInfo).getOptedApplications()]
      .sort((a, b) => Number(b.id) - Number(a.id));
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

            <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 text-xl">
              <div className="group flex items-center gap-2 min-w-0">
                <span className="shrink-0">Account</span>
                <span className="truncate min-w-0">{address}</span>
                <Copyable className="opacity-60 group-hover:opacity-100" value={address!} />
              </div>
              <div className="flex items-center gap-2.5 shrink-0 ml-auto">
                <JsonViewer
                  obj={accountInfo ? toPlainJson(accountInfo) : {}}
                  filename={`account-${address}.json`}
                  title={`Account ${address?.slice(0, 16)}..`}
                />
                <OpenInMenu pageType="account" id={address} />
              </div>
            </div>

            {isLoading || !accountInstance ? (
              <LoadingTile />
            ) : (
              <div className="mt-6">
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
                  <div className="flex items-center gap-1.5 flex-wrap">
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

                    {accountInfo.incentiveEligible === true ? (
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
                      <div className="mt-2.5 group inline-flex items-center gap-1">
                        <Copyable className="opacity-60 group-hover:opacity-100" value={microalgosToAlgos(accountInstance.getBalance())} />
                        <AlgoIcon />
                        <NumberFormat value={microalgosToAlgos(accountInstance.getBalance())} displayType="text" thousandSeparator={true} />
                      </div>
                    </div>

                    {accountInfo.amount ? (
                      <div className="mt-2.5">
                        <div className="text-muted-foreground">
                          Minimum balance
                        </div>
                        <div className="mt-2.5 group inline-flex items-center gap-1">
                          <Copyable className="opacity-60 group-hover:opacity-100" value={microalgosToAlgos(accountInstance.getMinBalance())} />
                          <AlgoIcon />
                          <NumberFormat value={microalgosToAlgos(accountInstance.getMinBalance())} displayType="text" thousandSeparator={true} />
                        </div>
                      </div>
                    ) : null}

                    {escrowOf ? (
                      <div className="mt-2.5">
                        <div className="text-muted-foreground">
                          Application Escrow
                        </div>
                        <div className="mt-2.5">
                          <LinkToApplication id={escrowOf} copy="left" />
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

                    {accountInfo.authAddr ? (
                      <div className="mt-2.5">
                        <div className="text-muted-foreground">
                          Rekeyed to
                        </div>
                        <div className="mt-2.5 text-[13px] break-words overflow-hidden">
                          <LinkToAccount
                            copySize="m"
                            strip={9}
                            address={accountInfo.authAddr.toString()}
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
                          {accountInfo.createdAssets?.length ?? 0}
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

                <div className="mt-6 overflow-hidden">
                  <TabsUnderline
                    tabsRef={tabsRef}
                    value={tabValue}
                    listClassName="flex-nowrap"
                    tabs={[
                      { name: "Transactions", value: "transactions", onClick: () => navigate("/account/" + address) },
                      ...(hasOptedAssets ? [{ name: "Assets", value: "assets", onClick: () => navigate("/account/" + address + "/assets") }] : []),
                      ...(hasCreatedAssets ? [{ name: "Created assets", value: "created-assets", onClick: () => navigate("/account/" + address + "/created-assets") }] : []),
                      ...(hasCreatedApps ? [{ name: "Created apps", value: "created-applications", onClick: () => navigate("/account/" + address + "/created-applications") }] : []),
                      ...(hasOptedApps ? [{ name: "Opted applications", value: "opted-applications", onClick: () => navigate("/account/" + address + "/opted-applications") }] : []),
                      ...(numControlledAccounts ? [{ name: "Controlling accounts", value: "controlling-accounts", onClick: () => navigate("/account/" + address + "/controller") }] : []),
                      ...(hasValidatorData ? [{ name: "Validator Data", value: "validator", onClick: () => navigate("/account/" + address + "/validator") }] : []),
                    ]}
                  />

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
