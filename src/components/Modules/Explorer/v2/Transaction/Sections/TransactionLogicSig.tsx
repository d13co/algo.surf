import React, { useEffect, useMemo } from "react";
import { CoreTransaction } from "src/packages/core-sdk/classes/core/CoreTransaction";
import { Address, PROGRAM_TAG, bytesToBase64 } from "algosdk";
import { sha512_256 } from "js-sha512";
import { ChevronDown } from "lucide-react";
import { usePersistenBooleanState } from "src/utils/usePersistenBooleanState";
import ApplicationProgram from "../../ApplicationProgram";
import LinkToAccount from "../../Links/LinkToAccount";
import LinkToLsigTemplate from "../../Links/LinkToLsigTemplate";
import { useLsig } from "src/hooks/useLsig";

import MultiFormatViewer from "src/components/v2/MultiFormatViewer";

/**
 * The program's address, Hash("Program" || program): the escrow, or the delegated program's id.
 * Hashed here, not by LogicSigAccount, whose sanity check throws on valid programs that happen to
 * be all printable bytes (TEAL v10's version byte is "\n").
 */
function programAddress(logic: Uint8Array): string {
  const bytes = new Uint8Array(PROGRAM_TAG.length + logic.length);
  bytes.set(PROGRAM_TAG);
  bytes.set(logic, PROGRAM_TAG.length);
  return new Address(new Uint8Array(sha512_256.arrayBuffer(bytes))).toString();
}

function TransactionLogicSig({
  transaction,
}: {
  transaction: any;
}): JSX.Element | null {
  const txnInstance = new CoreTransaction(transaction);
  const sig = txnInstance.getSig();

  const logic = sig?.logicsig?.logic;
  const lsigAddress = useMemo(() => (logic ? programAddress(logic) : undefined), [logic]);
  const { data: lsig } = useLsig(lsigAddress);
  const ls = sig?.logicsig;
  const delegated = !!(ls?.signature || ls?.multisigSignature || ls?.logicMultisigSignature || ls?.pqsig);

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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {lsigAddress ? (
              <div>
                <div className="text-muted-foreground">Program address</div>
                <div className="mt-2.5 text-[13px] break-words overflow-hidden">
                  <LinkToAccount copySize="m" strip={9} address={lsigAddress} />
                </div>
              </div>
            ) : null}
            <div>
              <div className="text-muted-foreground">Kind</div>
              <div className="mt-2.5" title={delegated
                ? "The txn's authorizing key signed this program, delegating its authority: the txn is valid if the program approves it."
                : "No key signed this program: its own address is the txn's authorizer, the sender or the account the sender is rekeyed to."}>
                {delegated ? "Delegated" : "Escrow"}
              </div>
            </div>
            {lsig ? (
              <div>
                <div className="text-muted-foreground">Template</div>
                <div className="mt-2.5 inline-flex items-center gap-1.5 max-w-full min-w-0">
                  <LinkToLsigTemplate template={lsig.template} name={lsig.name} />
                  <span className="text-muted-foreground shrink-0">
                    {lsig.programs.toLocaleString()} program{lsig.programs === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
            ) : null}
          </div>
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
