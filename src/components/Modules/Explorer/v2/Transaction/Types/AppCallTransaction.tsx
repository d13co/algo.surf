import React from "react";
import { useQuery } from "@tanstack/react-query";
import { calculateTransactionBalanceImpact } from "@d13co/algo-group-balance-impact";
import explorer from "src/utils/dappflow";
import { CoreTransaction } from "src/packages/core-sdk/classes/core/CoreTransaction";
import { CoreAppCall } from "src/packages/core-sdk/classes/core/CoreAppCall";
import { capitalizeFirst } from "src/utils/common";
import { bytesToBase64 } from "algosdk";
import { ChevronDown } from "lucide-react";
import { usePersistenBooleanState } from "src/utils/usePersistenBooleanState";
import LinkToAccount from "../../Links/LinkToAccount";
import LinkToApplication from "../../Links/LinkToApplication";
import ApplicationProgram from "../../ApplicationProgram";
import XChainOwnerField from "../Sections/XChainOwner";
import TabsUnderline from "src/components/v2/shadcn-studio/tabs/tabs-11";
import AppCallTxnArguments from "./AppCall/AppCallTxnArguments";
import AppCallTxnForeignAssets from "./AppCall/AppCallTxnForeignAssets";
import AppCallTxnForeignApps from "./AppCall/AppCallTxnForeignApps";
import AppCallTxnForeignAccounts from "./AppCall/AppCallTxnForeignAccounts";
import AppCallTxnLogs from "./AppCall/AppCallTxnLogs";
import AppCallTxnInnerTxns from "./AppCall/AppCallTxnInnerTxns";
import AppCallTxnDeltas from "./AppCall/AppCallTxnDeltas";
import AppCallTxnExactStateChanges, { StateChangesTarget } from "./AppCall/AppCallTxnExactStateChanges";
import BalanceImpact from "../../BalanceImpact";
import { useStateChangesCaps } from "src/hooks/useTxnStateChanges";

/** OnCompletion's value on chain, by the indexer's name for it. */
const ON_COMPLETION_VALUE: Record<string, number> = { noop: 0, optin: 1, closeout: 2, clear: 3, update: 4, delete: 5 };

function AppCallTransaction({
  transaction,
  hideInnerTxns = false,
  inner,
  developer,
}: {
  transaction: any;
  hideInnerTxns?: boolean;
  /** For an inner transaction: its top-level transaction, round and inner path. */
  inner?: StateChangesTarget;
  /** The page's Developer card, after the inner transactions. */
  developer?: React.ReactNode;
}): JSX.Element {
  const txnInstance = new CoreTransaction(transaction);
  const appCallPayload = txnInstance.getAppCallPayload();
  const callInstance = new CoreAppCall(appCallPayload);
  const isCreate = callInstance.isCreate();
  const id = Number(appCallPayload?.applicationId ?? 0);

  const approvalProgram = appCallPayload?.approvalProgram
    ? bytesToBase64(appCallPayload.approvalProgram)
    : "";
  const clearStateProgram = appCallPayload?.clearStateProgram
    ? bytesToBase64(appCallPayload.clearStateProgram)
    : "";

  const [expanded, setExpanded] = usePersistenBooleanState(
    "txn-appcall-code-expanded",
    false,
  );
  const [codeTabValue, setCodeTabValue] = React.useState("approval");
  // In the inner txn dialog the fields are short (an app sender shows as
  // "App <id> <addr…>"), so they sit evenly in a 2x2 / 4-up grid.
  const compact = hideInnerTxns;

  const { supported: exactSupported, full: fullDeltas } = useStateChangesCaps();

  // A grouped app call gets its balance impact from the group page; a lone one
  // has nowhere else to show what its inner txns moved, unless the Developer
  // card's Impact tab (the node's full deltas) already does. The txn is
  // already in hand, so this only walks it — no network.
  const showBalanceImpact = !hideInnerTxns && !txnInstance.getGroup() && (!developer || fullDeltas === false);
  const { data: balanceResult } = useQuery({
    queryKey: ["txn-balance-impact", txnInstance.getId()],
    queryFn: () =>
      calculateTransactionBalanceImpact({
        indexer: explorer.network.getIndexer(),
        txn: transaction,
        includeFees: true,
      }),
    enabled: showBalanceImpact,
  });

  const deltas = <AppCallTxnDeltas transaction={transaction} />;
  const onCompletion = appCallPayload?.onCompletion;

  return (
    <div>
      <div className="mt-7">
        <div className="rounded-lg p-5 bg-background-card">
          <div className={`grid gap-4 ${compact ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-12"}`}>
          <div className={compact ? "min-w-0" : "col-span-12 sm:col-span-6 md:col-span-4"}>
            <div className="text-muted-foreground">Application ID</div>
            <div className="mt-2.5">
              <LinkToApplication
                id={txnInstance.getAppId()}
                copy="right"
                copySize="s"
              />
            </div>
          </div>

          <div className={compact ? "min-w-0" : "col-span-12 sm:col-span-6 md:col-span-4"}>
            <div className="text-muted-foreground">Action</div>
            <div className="mt-2.5">{isCreate ? "Creation" : "Call"}</div>
          </div>

          <div className={compact ? "min-w-0" : "col-span-12 sm:col-span-6 md:col-span-4"}>
            <div className="text-muted-foreground">On completion</div>
            <div className="mt-2.5">
              {capitalizeFirst(onCompletion)}
              {onCompletion && Object.prototype.hasOwnProperty.call(ON_COMPLETION_VALUE, onCompletion) ? (
                <span className="ml-1.5 text-muted-foreground">({ON_COMPLETION_VALUE[onCompletion]})</span>
              ) : null}
            </div>
          </div>

          <div className={compact ? "min-w-0" : "col-span-12"}>
            <div className="text-muted-foreground">Sender</div>
            <div className="mt-2.5 text-[13px] break-words overflow-hidden">
              <LinkToAccount copySize="m" address={txnInstance.getFrom()} />
            </div>
          </div>

          <XChainOwnerField transaction={transaction} className={compact ? "col-span-2 sm:col-span-4" : "col-span-12"} />
          </div>
        </div>
      </div>

      {approvalProgram ? (
        <div className="mt-6 rounded-lg bg-background-card overflow-hidden">
          <button
            type="button"
            className="w-full flex items-center justify-between p-5 cursor-pointer text-left"
            onClick={() => setExpanded(!expanded)}
          >
            <span className="font-medium">Application Programs</span>
            <ChevronDown
              size={20}
              className={`transition-transform ${expanded ? "rotate-180" : ""}`}
            />
          </button>

          {expanded ? (
            <div className="px-5 pb-5">
              <TabsUnderline
                className="gap-6"
                value={codeTabValue}
                onValueChange={setCodeTabValue}
                tabs={[
                  {
                    name: "Approval Program",
                    value: "approval",
                    content: (
                      <div className="mt-6">
                        <ApplicationProgram
                          name="Approval program"
                          id={id}
                          program={approvalProgram}
                        />
                      </div>
                    ),
                  },
                  {
                    name: "Clear State Program",
                    value: "clear",
                    content: (
                      <div className="mt-6">
                        <ApplicationProgram
                          name="Clear state program"
                          id={id}
                          program={clearStateProgram}
                        />
                      </div>
                    ),
                  },
                  ...(isCreate
                    ? [
                        {
                          name: "Schema",
                          value: "schema",
                          content: (
                            <div className="px-3.5 mt-6">
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-5">
                                <div>
                                  <div className="text-muted-foreground text-sm">
                                    Global state byte
                                  </div>
                                  <div className="mt-2.5 text-foreground">
                                    {Number(appCallPayload?.globalStateSchema
                                      ?.numByteSlice ?? 0)}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-muted-foreground text-sm">
                                    Global state uint
                                  </div>
                                  <div className="mt-2.5 text-foreground">
                                    {Number(appCallPayload?.globalStateSchema
                                      ?.numUint ?? 0)}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-muted-foreground text-sm">
                                    Local state byte
                                  </div>
                                  <div className="mt-2.5 text-foreground">
                                    {Number(appCallPayload?.localStateSchema
                                      ?.numByteSlice ?? 0)}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-muted-foreground text-sm">
                                    Local state uint
                                  </div>
                                  <div className="mt-2.5 text-foreground">
                                    {Number(appCallPayload?.localStateSchema
                                      ?.numUint ?? 0)}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ),
                        },
                      ]
                    : []),
                ]}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {txnInstance.hasAppCallArguments() ? (
        <AppCallTxnArguments transaction={transaction} />
      ) : null}

      {txnInstance.hasAppCallForeignAssets() && txnInstance.hasAppCallForeignApps() ? (
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <AppCallTxnForeignAssets assets={appCallPayload?.foreignAssets?.map(Number)} />
          <AppCallTxnForeignApps apps={appCallPayload?.foreignApps?.map(Number)} />
        </div>
      ) : (
        <>
          {txnInstance.hasAppCallForeignAssets() ? (
            <div className="mt-6">
              <AppCallTxnForeignAssets assets={appCallPayload?.foreignAssets?.map(Number)} />
            </div>
          ) : null}
          {txnInstance.hasAppCallForeignApps() ? (
            <div className="mt-6">
              <AppCallTxnForeignApps apps={appCallPayload?.foreignApps?.map(Number)} />
            </div>
          ) : null}
        </>
      )}

      {txnInstance.hasAppCallForeignAccounts() ? (
        <AppCallTxnForeignAccounts accounts={appCallPayload?.accounts?.map(String)} />
      ) : null}

      {/* A top-level call's exact state changes and Impact are tabs of the page's Developer card. */}
      {inner ? (
        <AppCallTxnExactStateChanges target={inner} hasInnerTxns={txnInstance.hasInnerTransactions()} fallback={deltas} />
      ) : hideInnerTxns || !exactSupported || !developer ? (
        deltas
      ) : null}

      {txnInstance.hasInnerTransactions() && !hideInnerTxns ? (
        <AppCallTxnInnerTxns transaction={transaction} />
      ) : null}

      {developer}

      {showBalanceImpact ? (
        <BalanceImpact
          balanceImpact={balanceResult?.balanceImpact}
          className="mt-6"
        />
      ) : null}

      {txnInstance.hasLogs() ? (
        <AppCallTxnLogs logs={txnInstance.getLogs()} />
      ) : null}

    </div>
  );
}

export default AppCallTransaction;
