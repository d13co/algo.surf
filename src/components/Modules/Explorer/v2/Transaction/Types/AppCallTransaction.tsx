import React from "react";
import { CoreTransaction } from "src/packages/core-sdk/classes/core/CoreTransaction";
import { CoreAppCall } from "src/packages/core-sdk/classes/core/CoreAppCall";
import { capitalizeFirst } from "src/utils/common";
import { bytesToBase64 } from "algosdk";
import { ChevronDown } from "lucide-react";
import { usePersistenBooleanState } from "src/utils/usePersistenBooleanState";
import LinkToAccount from "../../Links/LinkToAccount";
import LinkToApplication from "../../Links/LinkToApplication";
import ApplicationProgram from "../../ApplicationProgram";
import TabsUnderline from "src/components/v2/shadcn-studio/tabs/tabs-11";
import AppCallTxnArguments from "./AppCall/AppCallTxnArguments";
import AppCallTxnForeignAssets from "./AppCall/AppCallTxnForeignAssets";
import AppCallTxnForeignApps from "./AppCall/AppCallTxnForeignApps";
import AppCallTxnForeignAccounts from "./AppCall/AppCallTxnForeignAccounts";
import AppCallTxnGlobalStateDelta from "./AppCall/AppCallTxnGlobalStateDelta";
import AppCallTxnLocalStateDelta from "./AppCall/AppCallTxnLocalStateDelta";
import AppCallTxnLogs from "./AppCall/AppCallTxnLogs";
import AppCallTxnInnerTxns from "./AppCall/AppCallTxnInnerTxns";

function AppCallTransaction({
  transaction,
  hideInnerTxns = false,
}: {
  transaction: any;
  hideInnerTxns?: boolean;
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

  return (
    <div>
      <div className="mt-7">
        <div className="rounded-lg p-5 bg-background-card">
          <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 sm:col-span-6 md:col-span-4">
            <div className="text-muted-foreground">Application ID</div>
            <div className="mt-2.5">
              <LinkToApplication
                id={txnInstance.getAppId()}
                copy="right"
                copySize="s"
              />
            </div>
          </div>

          <div className="col-span-12 sm:col-span-6 md:col-span-4">
            <div className="text-muted-foreground">Action</div>
            <div className="mt-2.5">{isCreate ? "Creation" : "Call"}</div>
          </div>

          <div className="col-span-12 sm:col-span-6 md:col-span-4">
            <div className="text-muted-foreground">On completion</div>
            <div className="mt-2.5">
              {capitalizeFirst(appCallPayload?.onCompletion)}
            </div>
          </div>

          <div className="col-span-12">
            <div className="text-muted-foreground">Sender</div>
            <div className="mt-2.5 text-[13px] break-words overflow-hidden">
              <LinkToAccount copySize="m" address={txnInstance.getFrom()} />
            </div>
          </div>
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

      {txnInstance.hasGlobalStateDelta() ? (
        <AppCallTxnGlobalStateDelta
          state={txnInstance.get().globalStateDelta}
        />
      ) : null}

      {txnInstance.hasLocalStateDelta() ? (
        <AppCallTxnLocalStateDelta
          appId={txnInstance.getAppId()}
          state={txnInstance.get().localStateDelta}
        />
      ) : null}

      {txnInstance.hasInnerTransactions() && !hideInnerTxns ? (
        <AppCallTxnInnerTxns transaction={transaction} />
      ) : null}

      {txnInstance.hasLogs() ? (
        <AppCallTxnLogs logs={txnInstance.getLogs()} />
      ) : null}

    </div>
  );
}

export default AppCallTransaction;
