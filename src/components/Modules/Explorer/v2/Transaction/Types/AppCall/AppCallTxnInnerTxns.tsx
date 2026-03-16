import React, { useState, useMemo, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useHotkeys } from "react-hotkeys-hook";
import { CoreTransaction } from "src/packages/core-sdk/classes/core/CoreTransaction";
import { TXN_TYPES } from "src/packages/core-sdk/constants";
import { AssetClient } from "src/packages/core-sdk/clients/assetClient";
import explorer from "src/utils/dappflow";
import { getApplicationAddress, encodeAddress } from "algosdk";
import { useEscrowBatch } from "src/hooks/useAccount";
import { ChevronRight, ChevronDown, ArrowRight, ArrowLeftFromLine, ArrowRightFromLine, Minus } from "lucide-react";
import LinkToAccount from "src/components/Modules/Explorer/v2/Links/LinkToAccount";
import LinkToApplication from "src/components/Modules/Explorer/v2/Links/LinkToApplication";
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
) {
  for (const txn of txns) {
    const inst = new CoreTransaction(txn);
    const from = inst.getFrom();
    const to = inst.getTo();
    if (from) addresses.add(from);
    if (to) addresses.add(to);
    const type = inst.getType();
    if (type === TXN_TYPES.APP_CALL) {
      const appId = inst.getAppId();
      if (appId) {
        const escrowAddr = appIdToAddress(appId);
        escrows.set(escrowAddr, appId);
        addresses.add(escrowAddr);
      }
    }
    if (inst.hasInnerTransactions()) {
      collectInnerTxnData(inst.getInnerTransactions(), addresses, escrows);
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

export function countInnerTxns(txnInstance: CoreTransaction): number {
  const inner = txnInstance.getInnerTransactions();
  if (!inner?.length) return 0;
  let count = inner.length;
  for (const itxn of inner) {
    count += countInnerTxns(new CoreTransaction(itxn));
  }
  return count;
}

function InnerTxnNode({
  txn,
  level,
  path,
  onView,
}: {
  txn: any;
  level: number;
  path: string;
  onView: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const txnInstance = new CoreTransaction(txn);
  const type = txnInstance.getType();
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

        <span className="inline-flex items-center text-xs border rounded px-2 py-0.5 border-yellow-500 text-yellow-500 shrink-0">
          {txnInstance.getTypeDisplayValue()}
        </span>

        <button
          type="button"
          className="text-xs px-2 py-0.5 rounded border border-primary text-primary cursor-pointer hover:bg-primary/20 shrink-0"
          onClick={() => onView(path)}
        >
          View
        </button>

        <span className="text-xs truncate min-w-0">
          <LinkToAccount
            address={txnInstance.getFrom()}
            strip={20}
            copy="none"
            shortEscrow
          />
        </span>

        <ArrowRight
          size={12}
          className="shrink-0 text-muted-foreground"
        />

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
              name={"Application: " + txnInstance.getAppId()}
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

  const { allAddresses, knownEscrows } = useMemo(() => {
    const addresses = new Set<string>();
    const escrows = new Map<string, number>();
    collectInnerTxnData(innerTxns, addresses, escrows);
    return { allAddresses: Array.from(addresses), knownEscrows: escrows };
  }, [transaction]);

  useEscrowBatch(allAddresses, knownEscrows);

  // Find current inner txn from URL
  const currentIndex = innerPath ? flatList.findIndex((e) => e.path === innerPath) : -1;
  const currentEntry = currentIndex >= 0 ? flatList[currentIndex] : null;
  const dialogOpen = !!currentEntry;

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
      assetClient.get(inst.getAssetId()).then(setAsset).catch(() => setAsset(undefined));
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
        <div className="ml-6 pl-4 border-l border-dashed border-muted/40">
          {innerTxns.map((txn, i) => (
            <InnerTxnNode
              key={String(i + 1)}
              txn={txn}
              level={1}
              path={String(i + 1)}
              onView={handleView}
            />
          ))}
        </div>
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
