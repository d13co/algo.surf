import React, { useState, useMemo } from "react";
import { CoreTransaction } from "src/packages/core-sdk/classes/core/CoreTransaction";
import { TXN_TYPES } from "src/packages/core-sdk/constants";
import { AssetClient } from "src/packages/core-sdk/clients/assetClient";
import explorer from "src/utils/dappflow";
import { ChevronRight, ChevronDown, ArrowRight, Minus } from "lucide-react";
import LinkToAccount from "src/components/Modules/Explorer/v2/Links/LinkToAccount";
import LinkToApplication from "src/components/Modules/Explorer/v2/Links/LinkToApplication";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "src/components/v2/ui/dialog";
import InnerTransactionDetail from "./InnerTransactionDetail";

function countInnerTxns(txnInstance: CoreTransaction): number {
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
  onView: (txn: any) => void;
}) {
  const [expanded, setExpanded] = useState(level < 2);
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
          onClick={() => onView(txn)}
        >
          View
        </button>

        <span className="text-xs truncate min-w-0">
          <LinkToAccount
            address={txnInstance.getFrom()}
            strip={20}
            copy="none"
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
              key={`${path}-${i}`}
              txn={child}
              level={level + 1}
              path={`${path}-${i}`}
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
  const txnInstance = new CoreTransaction(transaction);
  const innerTxns = txnInstance.getInnerTransactions();
  const count = useMemo(
    () => countInnerTxns(txnInstance),
    [transaction],
  );

  const [dialogState, setDialogState] = useState<{
    open: boolean;
    txn?: any;
    asset?: any;
  }>({ open: false });

  const handleView = async (txn: any) => {
    const inner = new CoreTransaction(txn);
    if (inner.getType() === TXN_TYPES.ASSET_TRANSFER) {
      try {
        const assetClient = new AssetClient(explorer.network);
        const asset = await assetClient.get(inner.getAssetId());
        setDialogState({ open: true, txn, asset });
        return;
      } catch {
        // fall through — show without asset
      }
    }
    setDialogState({ open: true, txn });
  };

  return (
    <div className="mt-6">
      <h3 className="text-sm font-medium text-muted-foreground mb-3">
        Inner transactions ({count})
      </h3>

      <div className="rounded-lg p-5 bg-background-card">
        <div className="text-sm font-medium mb-1">Current transaction</div>
        <div className="ml-6 pl-4 border-l border-dashed border-muted/40">
          {innerTxns.map((txn, i) => (
            <InnerTxnNode
              key={String(i)}
              txn={txn}
              level={1}
              path={String(i)}
              onView={handleView}
            />
          ))}
        </div>
      </div>

      <Dialog
        open={dialogState.open}
        onOpenChange={(open) => {
          if (!open) setDialogState({ open: false });
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Inner transaction</DialogTitle>
          </DialogHeader>
          {dialogState.txn ? (
            <InnerTransactionDetail
              txn={dialogState.txn}
              asset={dialogState.asset}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AppCallTxnInnerTxns;
