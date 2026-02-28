import React, { useEffect } from "react";
import { CoreTransaction } from "src/packages/core-sdk/classes/core/CoreTransaction";
import { bytesToBase64 } from "algosdk";
import { ChevronDown } from "lucide-react";
import { usePersistenBooleanState } from "src/utils/usePersistenBooleanState";
import ApplicationProgram from "../../ApplicationProgram";

import MultiFormatViewer from "src/components/v2/MultiFormatViewer";

function TransactionLogicSig({
  transaction,
}: {
  transaction: any;
}): JSX.Element | null {
  const txnInstance = new CoreTransaction(transaction);
  const sig = txnInstance.getSig();

  const [expanded, setExpanded] = usePersistenBooleanState(
    "txn-logicsig-expanded",
    true,
  );

  useEffect(() => {
    if (window.location.hash === "#logicsig") {
      setExpanded(true);
      document.getElementById("logicsig")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  if (!txnInstance.isLogicSig()) return null;

  const logicB64 = sig.logicsig?.logic ? bytesToBase64(sig.logicsig.logic) : "";
  const argsB64 = sig.logicsig?.args?.map(a => bytesToBase64(a));
  const hasArgs = argsB64 && argsB64.length > 0;

  return (
    <div className="mt-6 rounded-lg bg-background-card overflow-hidden" id="logicsig">
      <button
        type="button"
        className="w-full flex items-center justify-between p-5 cursor-pointer text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="font-medium">Logic Signature</span>
        <ChevronDown
          size={20}
          className={`transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded ? (
        <div className="px-5 pb-5">
          <ApplicationProgram
            id={0}
            name="Logic program"
            program={logicB64}
          />
          {hasArgs ? (
            <div className="mt-6">
              <div className="text-muted-foreground mb-2">
                Logic signature arguments
              </div>
              <div className="space-y-2">
                {argsB64.map(
                  (arg: string, index: number) => (
                    <div
                      key={arg + index}
                      className="flex items-center gap-2 text-[13px]"
                    >
                      <span className="shrink-0 tabular-nums">
                        {String(index).padStart(2, "0")}.
                      </span>
                      <div className="flex items-center gap-2">
                        <MultiFormatViewer
                          view="auto"
                          includeNum={
                            index === 0 ? undefined : "auto"
                          }
                          value={arg}
                        />
                        <span className="text-muted-foreground">
                          {Buffer.from(arg, "base64").length} bytes
                        </span>
                      </div>
                    </div>
                  ),
                )}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default TransactionLogicSig;
