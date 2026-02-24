import React from "react";
import { CoreTransaction } from "src/packages/core-sdk/classes/core/CoreTransaction";
import { microalgosToAlgos } from "src/utils/common";
import { ChevronDown } from "lucide-react";
import { usePersistenBooleanState } from "src/utils/usePersistenBooleanState";
import NumberFormat from "react-number-format";
import Copyable from "src/components/v2/Copyable";
import AlgoIcon from "../../../AlgoIcon/AlgoIcon";
import LinkToBlock from "../../Links/LinkToBlock";

function TransactionAdditionalDetails({
  transaction,
}: {
  transaction: any;
}): JSX.Element {
  const txnInstance = new CoreTransaction(transaction);

  const [expanded, setExpanded] = usePersistenBooleanState(
    "txn-additional-details-expanded",
    false,
  );

  return (
    <div className="mt-6 rounded-lg bg-background-card overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between p-5 cursor-pointer text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="font-medium">Additional information</span>
        <ChevronDown
          size={20}
          className={`transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded ? (
        <div className="px-5 pb-5">
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12 sm:col-span-6 lg:col-span-3">
              <div className="text-muted-foreground">First round</div>
              <div className="mt-2.5 inline-flex items-center gap-1">
                <LinkToBlock id={txnInstance.getFirstRound()} />
                <span className="text-muted-foreground text-xs">
                  ({txnInstance.getFirstRound() - txnInstance.getBlock()})
                </span>
              </div>
            </div>

            <div className="col-span-12 sm:col-span-6 lg:col-span-3">
              <div className="text-muted-foreground">Last round</div>
              <div className="mt-2.5 inline-flex items-center gap-1">
                <LinkToBlock id={txnInstance.getLastRound()} />
                <span className="text-muted-foreground text-xs">
                  (+{txnInstance.getLastRound() - txnInstance.getBlock()})
                </span>
              </div>
            </div>

            <div className="col-span-12 sm:col-span-6 lg:col-span-3">
              <div className="text-muted-foreground">Sender rewards</div>
              <div className="mt-2.5 group inline-flex items-center gap-1">
                <Copyable className="opacity-60 group-hover:opacity-100" value={microalgosToAlgos(txnInstance.getSenderRewards())} />
                <AlgoIcon />
                <NumberFormat value={microalgosToAlgos(txnInstance.getSenderRewards())} displayType="text" thousandSeparator={true} />
              </div>
            </div>

            <div className="col-span-12 sm:col-span-6 lg:col-span-3">
              <div className="text-muted-foreground">Receiver rewards</div>
              <div className="mt-2.5 group inline-flex items-center gap-1">
                <Copyable className="opacity-60 group-hover:opacity-100" value={microalgosToAlgos(txnInstance.getReceiverRewards())} />
                <AlgoIcon />
                <NumberFormat value={microalgosToAlgos(txnInstance.getReceiverRewards())} displayType="text" thousandSeparator={true} />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default TransactionAdditionalDetails;
