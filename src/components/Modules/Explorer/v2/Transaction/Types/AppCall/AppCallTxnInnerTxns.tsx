import React, { useState, useMemo, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useHotkeys } from "react-hotkeys-hook";
import { CoreTransaction } from "src/packages/core-sdk/classes/core/CoreTransaction";
import { TXN_TYPES } from "src/packages/core-sdk/constants";
import { AssetClient } from "src/packages/core-sdk/clients/assetClient";
import { isNotFoundError } from "src/packages/core-sdk/utils/common";
import explorer from "src/utils/dappflow";
import { getApplicationAddress, encodeAddress } from "algosdk";
import { useEscrowBatch } from "src/hooks/useAccount";
import { useTinyAssets } from "src/components/Common/UseTinyAsset";
import { A_AssetTiny } from "src/packages/core-sdk/types";
import { microalgosToAlgos } from "src/utils/common";
import { ChevronRight, ChevronDown, ArrowRight, ArrowLeftFromLine, ArrowRightFromLine, Minus } from "lucide-react";
import LinkToAccount from "src/components/Modules/Explorer/v2/Links/LinkToAccount";
import LinkToApplication from "src/components/Modules/Explorer/v2/Links/LinkToApplication";
import { Button } from "src/components/v2/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "src/components/v2/ui/dialog";
import InnerTransactionDetail from "./InnerTransactionDetail";

function appIdToAddress(appId: number): string {
  const addr = getApplicationAddress(appId);
  if (addr && typeof addr === "object") {
    if ("publicKey" in addr) {
      return encodeAddress(addr.publicKey as Uint8Array);
    }
    if (typeof (addr as any).toString === "function") {
      return (addr as any).toString();
    }
  }
  return addr as unknown as string;
}

function collectInnerTxnData(
  txns: any[],
  addresses: Set<string>,
  escrows: Map<string, number>,
  assetIds: Set<number>,
) {
  for (const txn of txns) {
    const inst = new CoreTransaction(txn);
    const from = inst.getFrom();
    const to = inst.getTo();
    if (from) addresses.add(from);
    if (to) addresses.add(to);
    const type = inst.getType();
    if (type === TXN_TYPES.ASSET_TRANSFER) {
      assetIds.add(inst.getAssetId());
    }
    if (type === TXN_TYPES.APP_CALL) {
      const appId = inst.getAppId();
      if (appId) {
        const escrowAddr = appIdToAddress(appId);
        escrows.set(escrowAddr, appId);
        addresses.add(escrowAddr);
      }
    }
    if (inst.hasInnerTransactions()) {
      collectInnerTxnData(inst.getInnerTransactions(), addresses, escrows, assetIds);
    }
  }
}

interface FlatEntry {
  path: string;
  txn: any;
}

function flattenInnerPaths(txns: any[], prefix: string = ""): FlatEntry[] {
  const result: FlatEntry[] = [];
  for (let i = 0; i < txns.length; i++) {
    const path = prefix ? `${prefix}/${i + 1}` : String(i + 1);
    result.push({ path, txn: txns[i] });
    const inst = new CoreTransaction(txns[i]);
    if (inst.hasInnerTransactions()) {
      result.push(...flattenInnerPaths(inst.getInnerTransactions(), path));
    }
  }
  return result;
}

const COLLAPSED_COUNT = 10;

// Digits past the second are noise once there is a whole part (1.0002389 ->
// ~1.00), but they are the whole number when there isn't (0.00005 stays).
function formatAmount(amount: number): string {
  if (Math.abs(amount) >= 1 && Number(amount.toFixed(2)) !== amount) {
    return `~${amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  return amount.toLocaleString(undefined, { maximumFractionDigits: 20 });
}

function amountLabel(
  inst: CoreTransaction,
  assets: Map<number, A_AssetTiny>,
): string | null {
  const type = inst.getType();
  if (type === TXN_TYPES.PAYMENT) {
    return `${formatAmount(microalgosToAlgos(inst.getAmount()))} ALGO`;
  }
  if (type === TXN_TYPES.ASSET_TRANSFER) {
    const assetId = inst.getAssetId();
    const asset = assets.get(assetId);
    // No tiny data (uncached miss, deleted asset) — show base units and the id
    // rather than a wrong decimal shift.
    const amount = asset
      ? inst.getAmount() / 10 ** asset.params.decimals
      : inst.getAmount();
    const unit = asset?.params["unit-name"] || `#${assetId}`;
    return `${formatAmount(amount)} ${unit}`;
  }
  return null;
}

export function countInnerTxns(txnInstance: CoreTransaction): number {
  const inner = txnInstance.getInnerTransactions();
  if (!inner?.length) return 0;
  let count = inner.length;
  for (const itxn of inner) {
    count += countInnerTxns(new CoreTransaction(itxn));
  }
  return count;
}

// The two connectors around an amount: `-[` and `]->`. Same 24-unit grid,
// stroke-width and round caps as the lucide arrows, drawn at the same 12px
// height, so their weight and baseline match them exactly.
const connectorProps = {
  height: 12,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function DashBracket({ className }: { className?: string }) {
  return (
    <svg {...connectorProps} width={11} viewBox="0 0 22 24" className={className}>
      <path d="M2 12h9" />
      <path d="M20 4h-5v16h5" />
    </svg>
  );
}

function BracketArrow({ className }: { className?: string }) {
  return (
    <svg {...connectorProps} width={13} viewBox="0 0 26 24" className={className}>
      <path d="M2 4h5v16H2" />
      <path d="M9 12h15" />
      <path d="m20 8 4 4-4 4" />
    </svg>
  );
}

function InnerTxnNode({
  txn,
  level,
  path,
  onView,
  assets,
}: {
  txn: any;
  level: number;
  path: string;
  onView: (path: string) => void;
  assets: Map<number, A_AssetTiny>;
}) {
  const [expanded, setExpanded] = useState(true);
  const txnInstance = new CoreTransaction(txn);
  const type = txnInstance.getType();
  const amount = amountLabel(txnInstance, assets);
  const children = txnInstance.hasInnerTransactions()
    ? txnInstance.getInnerTransactions()
    : [];
  const hasChildren = children.length > 0;

  return (
    <div>
      <div className="flex items-center gap-1.5 py-1">
        {hasChildren ? (
          <button
            type="button"
            className="shrink-0 p-0.5 cursor-pointer rounded hover:bg-muted"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <ChevronDown size={14} className="text-muted-foreground" />
            ) : (
              <ChevronRight size={14} className="text-muted-foreground" />
            )}
          </button>
        ) : (
          <span className="shrink-0 w-[18px] flex items-center justify-center">
            <Minus size={10} className="text-muted-foreground/50" />
          </span>
        )}

        <button
          type="button"
          className="inline-flex items-center text-xs border rounded px-2 py-0.5 border-yellow-500 text-yellow-500 shrink-0 cursor-pointer hover:bg-yellow-500/20"
          onClick={() => onView(path)}
          title="View transaction"
        >
          {txnInstance.getTypeDisplayValue()}
        </button>

        <span className="text-xs truncate min-w-0">
          <LinkToAccount
            address={txnInstance.getFrom()}
            strip={20}
            copy="none"
            shortEscrow
          />
        </span>

        {amount ? (
          <>
            <DashBracket className="shrink-0" />
            {/* -mx-1.5 cancels the row's gap-1.5 so the connectors sit against
                the amount. px-1 is the padding inside the brackets. */}
            <span className="text-xs shrink-0 -mx-1.5 px-0.5">{amount}</span>
            <BracketArrow className="shrink-0" />
          </>
        ) : (
          <ArrowRight
            size={12}
            className="shrink-0 text-muted-foreground"
          />
        )}

        <span className="text-xs truncate min-w-0">
          {type === TXN_TYPES.PAYMENT ||
          type === TXN_TYPES.ASSET_TRANSFER ? (
            <LinkToAccount
              address={txnInstance.getTo()}
              strip={20}
              copy="none"
              shortEscrow
            />
          ) : null}
          {type === TXN_TYPES.APP_CALL ? (
            <LinkToApplication
              id={txnInstance.getAppId()}
              name={"App " + txnInstance.getAppId()}
            />
          ) : null}
        </span>
      </div>

      {hasChildren && expanded ? (
        <div className="ml-6 pl-4 border-l border-dashed border-muted/40">
          {children.map((child, i) => (
            <InnerTxnNode
              key={`${path}/${i + 1}`}
              txn={child}
              level={level + 1}
              path={`${path}/${i + 1}`}
              onView={onView}
              assets={assets}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function AppCallTxnInnerTxns({
  transaction,
}: {
  transaction: any;
}): JSX.Element {
  const navigate = useNavigate();
  const params = useParams();
  const txnId = params.id;
  const innerPath = params["*"] || "";

  const txnInstance = new CoreTransaction(transaction);
  const innerTxns = txnInstance.getInnerTransactions();

  const count = useMemo(
    () => countInnerTxns(txnInstance),
    [transaction],
  );

  const flatList = useMemo(
    () => flattenInnerPaths(innerTxns),
    [transaction],
  );

  const { allAddresses, knownEscrows, allAssetIds } = useMemo(() => {
    const addresses = new Set<string>();
    const escrows = new Map<string, number>();
    const assetIds = new Set<number>();
    collectInnerTxnData(innerTxns, addresses, escrows, assetIds);
    return {
      allAddresses: Array.from(addresses),
      knownEscrows: escrows,
      allAssetIds: Array.from(assetIds),
    };
  }, [transaction]);

  useEscrowBatch(allAddresses, knownEscrows);

  // One ABEL/IndexedDB lookup for every asset in the tree, however deep.
  const { data: tinyAssets } = useTinyAssets(allAssetIds);
  const assetMap = useMemo(
    () => new Map((tinyAssets ?? []).map((a) => [a.index, a])),
    [tinyAssets],
  );

  // Find current inner txn from URL
  const currentIndex = innerPath ? flatList.findIndex((e) => e.path === innerPath) : -1;
  const currentEntry = currentIndex >= 0 ? flatList[currentIndex] : null;
  const dialogOpen = !!currentEntry;

  const [showAll, setShowAll] = useState(false);
  const hiddenCount = innerTxns.length - COLLAPSED_COUNT;
  const collapsed = !showAll && hiddenCount > 0;
  const visibleTxns = collapsed ? innerTxns.slice(0, COLLAPSED_COUNT) : innerTxns;

  const [asset, setAsset] = useState<any>(undefined);

  // Fetch asset info when viewing an asset transfer inner txn
  useEffect(() => {
    if (!currentEntry) {
      setAsset(undefined);
      return;
    }
    const inst = new CoreTransaction(currentEntry.txn);
    if (inst.getType() === TXN_TYPES.ASSET_TRANSFER) {
      const assetClient = new AssetClient(explorer.network);
      // null = the asset id resolves to nothing (zero-amount transfers of any
      // asset id are valid); undefined = lookup failed / not applicable.
      assetClient
        .getWithCreationFallback(inst.getAssetId())
        .then(setAsset)
        .catch((e) => setAsset(isNotFoundError(e) ? null : undefined));
    } else {
      setAsset(undefined);
    }
  }, [currentEntry?.path]);

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < flatList.length - 1;

  const goToPrev = () => {
    if (hasPrev) navigate(`/transaction/${txnId}/inner/${flatList[currentIndex - 1].path}`, { replace: true });
  };
  const goToNext = () => {
    if (hasNext) navigate(`/transaction/${txnId}/inner/${flatList[currentIndex + 1].path}`, { replace: true });
  };
  const closeDialog = () => {
    navigate(`/transaction/${txnId}`, { replace: true });
  };

  const handleView = (path: string) => {
    navigate(`/transaction/${txnId}/inner/${path}`, { replace: true });
  };

  useHotkeys("left", goToPrev, { enabled: dialogOpen && hasPrev }, [currentIndex, flatList, txnId]);
  useHotkeys("right", goToNext, { enabled: dialogOpen && hasNext }, [currentIndex, flatList, txnId]);

  return (
    <div className="mt-6" id="inner-txns">
      <h3 className="text-sm font-medium text-muted-foreground mb-3">
        Inner transactions ({count})
      </h3>

      <div className="rounded-lg p-5 bg-background-card">
        <div className="text-sm font-medium mb-1">Current transaction</div>
        <div className="relative">
          <div className="ml-6 pl-4 border-l border-dashed border-muted/40">
            {visibleTxns.map((txn, i) => (
              <InnerTxnNode
                key={String(i + 1)}
                txn={txn}
                level={1}
                path={String(i + 1)}
                onView={handleView}
                assets={assetMap}
              />
            ))}
          </div>
          {collapsed ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-b from-transparent to-background-card" />
          ) : null}
        </div>

        {hiddenCount > 0 ? (
          <div className="flex justify-center mt-3">
            <Button
              variant="outline"
              size="sm"
              className="border-primary text-primary hover:bg-primary/10 hover:text-primary"
              onClick={() => setShowAll(!showAll)}
            >
              {showAll ? "Show less" : `Show more (${hiddenCount})`}
            </Button>
          </div>
        ) : null}
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <a
                href={hasPrev ? `/transaction/${txnId}/inner/${flatList[currentIndex - 1]?.path}` : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  goToPrev();
                }}
                className={`rounded p-1.5 ${hasPrev ? "text-primary hover:bg-primary/10 cursor-pointer" : "text-muted-foreground/30 pointer-events-none"}`}
                title="Previous inner txn (←)"
              >
                <ArrowLeftFromLine size={18} />
              </a>
              <DialogTitle>
                Inner transaction {currentEntry?.path.replace(/\//g, " / ")} ({currentIndex + 1} of {flatList.length})
              </DialogTitle>
              <a
                href={hasNext ? `/transaction/${txnId}/inner/${flatList[currentIndex + 1]?.path}` : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  goToNext();
                }}
                className={`rounded p-1.5 ${hasNext ? "text-primary hover:bg-primary/10 cursor-pointer" : "text-muted-foreground/30 pointer-events-none"}`}
                title="Next inner txn (→)"
              >
                <ArrowRightFromLine size={18} />
              </a>
            </div>
          </DialogHeader>
          {currentEntry ? (
            <InnerTransactionDetail
              txn={currentEntry.txn}
              asset={asset}
              innerPath={currentEntry.path}
              txnId={txnId}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AppCallTxnInnerTxns;
