import React, { Suspense } from "react";
import { CoreTransaction } from "src/packages/core-sdk/classes/core/CoreTransaction";
import { toPlainJson } from "src/packages/core-sdk/utils/serialize";
const ReactJson = React.lazy(() => import("react-json-view"));
import LinkToAccount from "../../Links/LinkToAccount";

function StateProofTransaction({
  transaction,
}: {
  transaction: any;
}): JSX.Element {
  const txnInstance = new CoreTransaction(transaction);
  const stateProofPayload = txnInstance.getStateProofPayload();

  return (
    <>
      <div className="mt-7">
        <div className="rounded-lg p-5 bg-background-card">
          <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12">
            <div className="text-muted-foreground">Sender</div>
            <div className="mt-2.5 text-[13px] break-words overflow-hidden">
              <LinkToAccount copySize="m" address={txnInstance.getFrom()} />
            </div>
          </div>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-lg p-5 bg-background-card">
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12">
            <div className="text-muted-foreground">Message</div>
            <div className="mt-2.5 rounded-lg overflow-hidden">
              <Suspense fallback={<div className="p-4 text-muted-foreground">Loading...</div>}>
                <ReactJson
                  theme="apathy"
                  style={{ width: "100%", borderRadius: "7px" }}
                  src={toPlainJson(stateProofPayload.message)}
                  name={false}
                  displayObjectSize={false}
                  displayDataTypes={false}
                  enableClipboard={false}
                  iconStyle="square"
                />
              </Suspense>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-lg p-5 bg-background-card">
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12">
            <div className="text-muted-foreground">Proof</div>
            <div className="mt-2.5 rounded-lg overflow-hidden">
              <Suspense fallback={<div className="p-4 text-muted-foreground">Loading...</div>}>
                <ReactJson
                  theme="apathy"
                  style={{ width: "100%", borderRadius: "7px" }}
                  src={toPlainJson(stateProofPayload.stateProof) as any}
                  name={false}
                  collapsed={2}
                  displayObjectSize={false}
                  displayDataTypes={false}
                  enableClipboard={false}
                  iconStyle="square"
                />
              </Suspense>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default StateProofTransaction;
