import React, { useRef } from "react";
import { Link } from "react-router-dom";
import { useLiveBlocks } from "../../../../hooks/useLiveBlocks";
import { CSSTransition, TransitionGroup } from 'react-transition-group';
import { ellipseString } from "src/packages/core-sdk/utils";
import { TransactionType } from "algosdk";
import type { modelsv2, Transaction } from "algosdk";

type SignedTxnInBlock = modelsv2.BlockResponse["block"]["payset"][number];

function getTypeDisplayValue(txn: Transaction): string {
    const type = txn.type;
    if (type === TransactionType.hb) return "Heartbeat";
    if (type === TransactionType.pay) return "Payment";
    if (type === TransactionType.keyreg) return "Key registration";
    if (type === TransactionType.acfg) {
        return txn.assetConfig?.assetIndex === 0n ? "Asset create" : "Asset config";
    }
    if (type === TransactionType.afrz) return "Asset freeze";
    if (type === TransactionType.axfer) return "Transfer";
    if (type === TransactionType.appl) {
        const appCall = txn.applicationCall;
        const onCompletion = appCall?.onComplete;
        switch (onCompletion) {
            case 1: return "App optin";
            case 2: return "App close out";
            case 3: return "App clear";
            case 4: return "App update";
            case 5: return appCall?.appIndex ? "App delete" : "OpUp";
            case 0:
            default:
                return appCall?.appIndex ? "App call" : "App create";
        }
    }
    if (type === TransactionType.stpf) return "State proof";
    return type;
}

function getTo(txn: Transaction): string {
    if (txn.type === TransactionType.pay) {
        return txn.payment?.receiver?.toString() ?? "";
    }
    if (txn.type === TransactionType.axfer) {
        return txn.assetTransfer?.receiver?.toString() ?? "";
    }
    return "";
}

function getAppId(txn: Transaction): number {
    if (txn.type === TransactionType.appl) {
        return Number(txn.applicationCall?.appIndex ?? 0n);
    }
    return 0;
}

function TransactionItem({ stib, ...transitionProps }: { stib: SignedTxnInBlock } & Record<string, unknown>) {
    const nodeRef = useRef<HTMLAnchorElement>(null);
    const txn = stib.signedTxn.signedTxn.txn;
    const txId = txn.txID();
    const type = txn.type;
    const to = getTo(txn);
    const appId = getAppId(txn);

    return (
        <CSSTransition {...transitionProps} timeout={700} classNames="item" nodeRef={nodeRef}>
            <Link ref={nodeRef} to={"/transaction/" + txId} className="block bg-background-card text-muted-foreground p-4 my-3 border-l-[6px] border-primary rounded overflow-hidden hover:bg-background-card/80">
                <div className="flex justify-between items-center">
                    <span>{getTypeDisplayValue(txn)}</span>
                    <span className="text-primary font-mono text-sm">{ellipseString(txId, 8)}</span>
                </div>
                <div className="mt-1.5 text-[13px] flex justify-between items-center">
                    <span>From:</span>
                    <span className="font-mono text-xs">{ellipseString(txn.sender.toString(), 8)}</span>
                </div>
                {type === TransactionType.pay || type === TransactionType.axfer ? (
                    <div className="mt-1.5 text-[13px] flex justify-between items-center">
                        <span>To:</span>
                        <span className="font-mono text-xs">{ellipseString(to, 8)}</span>
                    </div>
                ) : null}
                {type === TransactionType.appl ? (
                    <div className="mt-1.5 text-[13px] flex justify-between items-center">
                        <span>Application:</span>
                        <span>{appId}</span>
                    </div>
                ) : null}
            </Link>
        </CSSTransition>
    );
}

function LiveTransactions(): JSX.Element {
    const { transactions } = useLiveBlocks();

    return (
        <div>
            <div className="text-left">
                <div className="text-xl text-primary">
                    Transactions
                </div>
                <div className="mt-5">
                    <TransitionGroup component="div">
                        {transactions.map((stib) => (
                            <TransactionItem key={stib.signedTxn.signedTxn.txn.txID()} stib={stib} />
                        ))}
                    </TransitionGroup>
                </div>
            </div>
        </div>
    );
}

export default LiveTransactions;
