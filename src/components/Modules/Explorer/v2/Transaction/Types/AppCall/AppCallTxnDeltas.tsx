import React from "react";
import { CoreTransaction } from "src/packages/core-sdk/classes/core/CoreTransaction";
import AppCallTxnGlobalStateDelta from "./AppCallTxnGlobalStateDelta";
import AppCallTxnLocalStateDelta from "./AppCallTxnLocalStateDelta";
import AppCallTxnStateChanges from "./AppCallTxnStateChanges";

/**
 * The accounts whose local state an app call touched: those with a local
 * state delta, and the sender of an opt-in, close-out or clear, which opens or
 * closes its local state without necessarily writing a key.
 */
function localStateAddresses(txn: CoreTransaction, onCompletion: string | undefined): string[] {
  const addresses = (txn.get().localStateDelta ?? []).map((d) => String(d.address));
  if (onCompletion === "optin" || onCompletion === "closeout" || onCompletion === "clear") addresses.push(txn.getFrom());
  return [...new Set(addresses)];
}

/**
 * An app call's apply data deltas, and the round's net change from the
 * time-travel node: what shows where the node doesn't serve exact per-txn
 * state changes.
 */
export default function AppCallTxnDeltas({ transaction }: { transaction: any }): JSX.Element {
  const txnInstance = new CoreTransaction(transaction);
  return (
    <>
      {txnInstance.hasGlobalStateDelta() ? <AppCallTxnGlobalStateDelta state={txnInstance.get().globalStateDelta} /> : null}

      {txnInstance.hasLocalStateDelta() ? (
        <AppCallTxnLocalStateDelta appId={txnInstance.getAppId()} state={txnInstance.get().localStateDelta} />
      ) : null}

      {/* Top-level calls only: an inner call's effect is its parent's. */}
      {txnInstance.getId() && txnInstance.getBlock() ? (
        <AppCallTxnStateChanges
          appId={txnInstance.getAppId()}
          round={txnInstance.getBlock()}
          txId={txnInstance.getId()}
          localAddresses={localStateAddresses(txnInstance, txnInstance.getAppCallPayload()?.onCompletion)}
        />
      ) : null}
    </>
  );
}
