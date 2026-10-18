import React, { Component, Suspense, useRef, useCallback, useMemo } from "react";
import {
  matchPath,
  Outlet,
  useLocation,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useAddressBook } from "src/hooks/useAddressBook";
import { CoreAccount } from "src/packages/core-sdk/classes/core/CoreAccount";
import {
  getAttachedPqSig,
  pqSigSchemeLabel,
} from "src/packages/core-sdk/utils/pqsig";
import {
  useAccount,
  useEscrowOf,
  useAccountTransactions,
  useControllingAccounts,
} from "src/hooks/useAccount";
import { useValidatorStats } from "src/hooks/useValidator";
import { delegationLive, templateLabel, useDelegations, useLsig } from "src/hooks/useLsig";
import { useMsigSubsigners, useMsigsOf } from "src/hooks/useMsig";
import { useTimeTravelSupport } from "src/hooks/useTimeTravel";
import { useRound, useRoundHref, useRoundNavigate } from "src/hooks/useRound";
import RoundNotice from "../Versions/RoundNotice";
import { useReverseNFD, useReverseNFDs } from "src/components/Common/UseNFD";
import { useTinyAssets } from "src/components/Common/UseTinyAsset";
import LoadingTile from "src/components/v2/LoadingTile";
import CustomError from "../CustomError";
import Copyable from "src/components/v2/Copyable";
import NumberFormat from "react-number-format";
import RecordPageHeader from "src/components/v2/RecordPageHeader";
import AlgoIcon from "../../AlgoIcon/AlgoIcon";
import useTitle from "src/components/Common/UseTitle/UseTitle";
import LinkToAccount from "../Links/LinkToAccount";
import LinkToApplication from "../Links/LinkToApplication";
import LinkToBlockscan from "../Links/LinkToBlockscan";
import LinkToLsigTemplate from "../Links/LinkToLsigTemplate";
import DymNFD from "../DymNFD";
import XChainBadge from "../XChainBadge";
import { microalgosToAlgos } from "src/utils/common";
import { toPlainJson } from "src/packages/core-sdk/utils/serialize";
import { network } from "src/packages/core-sdk/constants";
import TabsUnderline from "src/components/v2/shadcn-studio/tabs/tabs-11";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "src/components/v2/ui/tooltip";
import { Chip, BadgesRow } from "src/components/v2/Chips";
import { AlgoXEvmSdk } from "algo-x-evm-sdk";
import { CircleHelp } from "lucide-react";

const isMainnet = network === "Mainnet";
const INDEXER_MAX_ACCOUNT_RESOURCES = 1000;
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

function Account(): JSX.Element {
  const navigate = useRoundNavigate();
  const roundHref = useRoundHref();
  const params = useParams();
  const { address } = params;
  // The account as it was at a past round, when the URL asks for one.
  const { round } = useRound();

  const {
    data: accountInfo,
    isLoading,
    isError,
    error,
  } = useAccount(address, round);
  const { data: escrowOf } = useEscrowOf(address);
  const { data: validatorStats } = useValidatorStats(address, 0, round);
  // surf idx: the logic sig with this program address, and the ones this account delegated or was
  // moved by. Neither has history, so delegations are only listed for the current round.
  const { data: lsig } = useLsig(address);
  const { data: delegations } = useDelegations(address, round === undefined);
  // surf idx: the keys of this multisig, or the multisigs this key is in. Without history too.
  const { data: subsigners } = useMsigSubsigners(address, round === undefined);
  const { data: msigsOf } = useMsigsOf(address, round === undefined);
  const { data: nfd } = useReverseNFD(address);
  const { data: txnData } = useAccountTransactions(address, round);
  // The indexer only knows which accounts are rekeyed to this one now, so
  // there is no list to show for a past round.
  const { data: controllerData, fetchNextPage: fetchNextControllerPage, hasNextPage: hasNextControllerPage } = useControllingAccounts(address, round === undefined);

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

  const accountInstance = useMemo(
    () => accountInfo ? new CoreAccount(accountInfo) : null,
    [accountInfo]
  );

  // The indexer inlines an account's asset and app arrays and refuses the
  // whole record once their combined count passes its max-results limit
  // ("Result limit exceeded"), so those accounts have to ask for the record
  // without them. Every other account gets the arrays. The limit is per-node
  // and not discoverable, so assume the indexer default and stay under it.
  const indexerExcludesResources = useMemo(() => {
    if (!accountInfo) return false;
    const resources =
      Number(accountInfo.totalAssetsOptedIn ?? 0) +
      Number(accountInfo.totalCreatedAssets ?? 0) +
      Number(accountInfo.totalAppsOptedIn ?? 0) +
      Number(accountInfo.totalCreatedApps ?? 0);
    return resources > INDEXER_MAX_ACCOUNT_RESOURCES;
  }, [accountInfo]);

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
    if (hasNextControllerPage && round === undefined) {
      fetchNextControllerPage();
    }
  }, [hasNextControllerPage, fetchNextControllerPage, round]);

  const numControlledAccounts = round === undefined ? controllingAccounts.length : 0;

  const transactions = useMemo(
    () => txnData?.pages.flatMap((p) => p.transactions) ?? [],
    [txnData]
  );

  const [lastSent, isMultiSig, isLogicSig, isClosed, isXEVM, pqSig] = useMemo(() => {
    if (!accountInfo) return [undefined, false, false, false, null, undefined] as const;
    const lastSent = transactions.find(
      ({ sender }) => sender === address
    );
    const isMultiSig = !!lastSent?.signature?.multisig;
    const isLogicSig = !!lastSent?.signature?.logicsig;
    const isClosed = accountInfo.amount === 0n && !!lastSent;
    const isXEVM = isLogicSig ? AlgoXEvmSdk.getEvmAddressFromProgram(lastSent!.signature!.logicsig!.logic) : null;
    const pqSig = lastSent ? getAttachedPqSig(lastSent) : undefined;
    return [lastSent, isMultiSig, isLogicSig, isClosed, isXEVM, pqSig] as const;
  }, [address, accountInfo, transactions]);

  // The last sent txn's logic sig was delegated: a key signed the program.
  const lastSentDelegated = useMemo(() => {
    const ls = lastSent?.signature?.logicsig;
    return !!(ls && (ls.signature || ls.multisigSignature || ls.logicMultisigSignature || ls.pqsig));
  }, [lastSent]);
  const authAddr = accountInfo?.authAddr?.toString();
  // The account's last txn was authorized by a logic sig no key signed (escrow).
  const escrowViaTxn = !!lastSent && isLogicSig && !lastSentDelegated;
  // A logic sig escrow per surf idx: its program authorized its own address's txns, and the account
  // isn't rekeyed away from it since.
  const lsigEscrow = !!lsig?.uses.some((u) => u.lsig === address && !u.signer) && !authAddr;
  const numDelegations = round === undefined ? delegations?.length ?? 0 : 0;
  const numSubsigners = round === undefined ? subsigners?.length ?? 0 : 0;
  const numMsigsOf = round === undefined ? msigsOf?.length ?? 0 : 0;
  // Delegations this account's key signed that can still send its txns.
  const liveDelegations = useMemo(
    () =>
      round === undefined && delegations && accountInfo
        ? delegations.filter((u) => u.signer === address && delegationLive(u, address!, authAddr)).length
        : 0,
    [round, delegations, accountInfo, address, authAddr]
  );

  const hasOptedAssets = accountInfo?.assets?.length ?? 0;
  const hasCreatedAssets = accountInfo?.createdAssets?.length ?? 0;

  const createdApplications = useMemo(() => {
    if (!accountInstance) return [];
    return [...accountInstance.getCreatedApplications()]
      .sort((a, b) => Number(b.id) - Number(a.id));
  }, [accountInstance]);

  const optedApplications = useMemo(() => {
    if (!accountInstance) return [];
    return [...accountInstance.getOptedApplications()]
      .sort((a, b) => Number(b.id) - Number(a.id));
  }, [accountInstance]);

  const hasCreatedApps = createdApplications.length;
  const hasOptedApps = optedApplications.length;
  const hasAssetOrAppInfo =
    hasOptedAssets || hasCreatedAssets || hasOptedApps || hasCreatedApps;
  const hasValidatorData =
    (accountInfo?.status === "Online" && !!accountInfo.participation) ||
    (validatorStats?.blocks ?? 0) > 0 ||
    (validatorStats?.suspensions ?? 0) > 0;

  const tabsRef = useRef<HTMLDivElement>(null);

  const scrollToControllerTo = useCallback(
    (e: React.MouseEvent) => {
      navigate(`/account/${address}/controller`);
      if (tabsRef?.current) tabsRef.current.scrollIntoView();
      e.preventDefault();
    },
    [tabsRef, address, navigate]
  );

  const scrollToDelegations = useCallback(
    (e: React.MouseEvent) => {
      navigate(`/account/${address}/delegations`);
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
  const hasVersions = useTimeTravelSupport();

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
    numDelegations &&
    matchPath("/account/:address/delegations", pathname)
  ) {
    tabValue = "delegations";
  } else if (
    numSubsigners &&
    matchPath("/account/:address/subsigners", pathname)
  ) {
    tabValue = "subsigners";
  } else if (
    numMsigsOf &&
    matchPath("/account/:address/multisigs", pathname)
  ) {
    tabValue = "multisigs";
  } else if (
    hasValidatorData &&
    matchPath("/account/:address/validator", pathname)
  ) {
    tabValue = "validator";
  } else if (
    hasVersions &&
    matchPath("/account/:address/versions", pathname)
  ) {
    tabValue = "versions";
  }

  useTitle(`Account ${address}`);

  return (
    <div className="mt-5">
      <div>
        <RoundNotice />

        {isError ? (
          <CustomError error={error?.message} />
        ) : (
          <div>
            {nfd && altNFDAccountsToShow?.length ? (
              <DymNFD nfd={nfd} accounts={altNFDAccountsToShow} />
            ) : null}

            <RecordPageHeader
              label="Account"
              id={address}
              copyValue={address!}
              qrAddress={address}
              truncate
              jsonViewer={{
                obj: () => accountInfo ? toPlainJson(accountInfo) : {},
                dataKey: accountInfo,
                filename: round === undefined ? `account-${address}.json` : `account-${address}-block-${round}.json`,
                title: `Account ${address?.slice(0, 16)}..${round === undefined ? "" : ` at block ${round}`}`,
                // Neither serves a past round: that came from the time-travel node.
                api: address && round === undefined
                  ? {
                      // algod has no such limit, so it always serves the
                      // arrays in full.
                      algod: `/v2/accounts/${address}`,
                      indexer: `/v2/accounts/${address}${indexerExcludesResources ? "?exclude=all" : ""}`,
                    }
                  : undefined,
              }}
              openIn={{ pageType: "account", id: address }}
            />

            {isLoading || !accountInstance ? (
              <LoadingTile />
            ) : (
              <div>
                <BadgesRow>
                  {nfd ? (
                    <span className="inline-flex items-center gap-1 text-lg" style={{ color: "#f65624" }}>
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
                    </span>
                  ) : null}
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
                          <a
                            href={`https://app.tinyman.org/pool/${address}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="no-underline"
                          >
                            <Chip variant="tinyman" onClick={() => {}}>
                              Tinyman 2 &middot; {tinymanPool}
                            </Chip>
                          </a>
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
                      href={roundHref(`/application/${escrowOf}`)}
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
                      href={roundHref(`/transaction/${lastSent.id}#multisig`)}
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

                  {escrowViaTxn || lsigEscrow ? (
                    <a
                      href={roundHref(escrowViaTxn ? `/transaction/${lastSent!.id}#logicsig` : `/lsigs/${lsig!.template}`)}
                      onClick={(e) => {
                        e.preventDefault();
                        navigate(escrowViaTxn ? `/transaction/${lastSent!.id}#logicsig` : `/lsigs/${lsig!.template}`);
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
                            <p>
                              This account is controlled by a stateless smart contract (logic sig).{" "}
                              {escrowViaTxn ? "Click to view program source." : "Click to view its template."}
                            </p>
                            {lsig ? <p>Template: {templateLabel(lsig)}, shared by {lsig.programs.toLocaleString()} program{plural(lsig.programs)}.</p> : null}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </a>
                  ) : null}

                  {liveDelegations || lastSentDelegated ? (
                    <a
                      href={roundHref(liveDelegations ? `/account/${address}/delegations` : `/transaction/${lastSent!.id}#logicsig`)}
                      onClick={(e) => {
                        if (liveDelegations) return scrollToDelegations(e);
                        e.preventDefault();
                        navigate(`/transaction/${lastSent!.id}#logicsig`);
                      }}
                    >
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Chip variant={liveDelegations ? "warning" : "success"} onClick={() => {}}>
                              Delegated LogicSig{liveDelegations > 1 ? ` (${liveDelegations})` : ""}
                            </Chip>
                          </TooltipTrigger>
                          <TooltipContent className="bg-black text-white border-border">
                            <p>
                              {liveDelegations
                                ? "This account signed logic sigs that can still send its txns. Click to view them."
                                : "This account's last txn was authorized by a delegated logic sig. Click to view it."}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </a>
                  ) : null}

                  {pqSig && lastSent ? (
                    <a
                      href={roundHref(`/transaction/${lastSent.id}#pqsig`)}
                      onClick={(e) => {
                        e.preventDefault();
                        navigate(`/transaction/${lastSent.id}#pqsig`);
                      }}
                    >
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Chip variant="success" onClick={() => {}}>
                              PQ ({pqSigSchemeLabel(pqSig)})
                            </Chip>
                          </TooltipTrigger>
                          <TooltipContent className="bg-black text-white border-border">
                            <p>This account signs transactions with the {pqSigSchemeLabel(pqSig)} post-quantum signature scheme. Click to view the signature.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </a>
                  ) : null}

                  {isXEVM ? <XChainBadge /> : null}

                  {isClosed ? (
                    <Chip variant="warning">Closed</Chip>
                  ) : null}
                </BadgesRow>

                <div className="rounded-lg p-5 pt-2.5 bg-background-card">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="mt-2.5">
                      <div className="text-muted-foreground">Balance</div>
                      <div className="mt-2.5 group inline-flex items-center gap-1">
                        <AlgoIcon />
                        <NumberFormat value={microalgosToAlgos(accountInstance.getBalance())} displayType="text" thousandSeparator={true} />
                        <Copyable className="opacity-60 group-hover:opacity-100" value={microalgosToAlgos(accountInstance.getBalance())} />
                      </div>
                    </div>

                    {accountInfo.amount ? (
                      <div className="mt-2.5">
                        <div className="text-muted-foreground">
                          Minimum balance
                        </div>
                        <div className="mt-2.5 group inline-flex items-center gap-1">
                          <AlgoIcon />
                          <NumberFormat value={microalgosToAlgos(accountInstance.getMinBalance())} displayType="text" thousandSeparator={true} />
                          <Copyable className="opacity-60 group-hover:opacity-100" value={microalgosToAlgos(accountInstance.getMinBalance())} />
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

                    {lsig ? (
                      <div className="mt-2.5">
                        <div className="text-muted-foreground">
                          LogicSig template
                        </div>
                        <div className="mt-2.5 inline-flex items-center gap-1.5 max-w-full min-w-0">
                          <LinkToLsigTemplate template={lsig.template} name={lsig.name} />
                          <span className="text-muted-foreground shrink-0">
                            {lsig.programs.toLocaleString()} program{plural(lsig.programs)}
                          </span>
                        </div>
                      </div>
                    ) : null}

                    {isXEVM ? (
                      <div className="mt-2.5">
                        <div className="text-muted-foreground inline-flex items-center gap-1">
                          xChain EVM owner
                          <a
                            href="https://xchain.algorand.tech/docs/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center hover:text-foreground"
                          >
                            <CircleHelp className="h-3.5 w-3.5" />
                          </a>
                        </div>
                        <div className="mt-2.5 text-[13px] break-words overflow-hidden">
                          <LinkToBlockscan address={isXEVM} />
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
                      ...(numDelegations ? [{ name: "Delegations", value: "delegations", onClick: () => navigate("/account/" + address + "/delegations") }] : []),
                      ...(numSubsigners ? [{ name: "Subsigners", value: "subsigners", onClick: () => navigate("/account/" + address + "/subsigners") }] : []),
                      ...(numMsigsOf ? [{ name: "Multisigs", value: "multisigs", onClick: () => navigate("/account/" + address + "/multisigs") }] : []),
                      ...(hasValidatorData ? [{ name: "Validator Data", value: "validator", onClick: () => navigate("/account/" + address + "/validator") }] : []),
                      ...(hasVersions ? [{ name: "Versions", value: "versions", onClick: () => navigate("/account/" + address + "/versions") }] : []),
                    ]}
                  />

                  <TabErrorBoundary>
                    <Suspense fallback={<LoadingTile />}>
                      <Outlet />
                    </Suspense>
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
