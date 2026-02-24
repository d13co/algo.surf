import React, { useEffect } from "react";
import { useLocation, useParams } from "react-router-dom";
import { CoreTransaction } from "src/packages/core-sdk/classes/core/CoreTransaction";
import { TXN_TYPES } from "src/packages/core-sdk/constants";
import { useTransaction, useTransactionAsset } from "src/hooks/useTransaction";
import { microalgosToAlgos } from "src/utils/common";
import LoadingTile from "src/components/v2/LoadingTile";
import JsonViewer from "src/components/v2/JsonViewer";
import CustomError from "../CustomError";
import Copyable from "src/components/v2/Copyable";
import OpenInMenu from "src/components/v2/OpenInMenu";
import AlgoIcon from "../../AlgoIcon/AlgoIcon";
import useTitle from "src/components/Common/UseTitle/UseTitle";
import LinkToBlock from "../Links/LinkToBlock";
import LinkToGroup from "../Links/LinkToGroup";
import MultiDateViewer, { DateSwitcher } from "src/components/v2/MultiDateViewer";
import PaymentTransaction from "./Types/PaymentTransaction";
import AssetTransferTransaction from "./Types/AssetTransferTransaction";
import AssetFreezeTransaction from "./Types/AssetFreezeTransaction";
import AssetConfigTransaction from "./Types/AssetConfigTransaction";
import KeyRegTransaction from "./Types/KeyRegTransaction";
import AppCallTransaction from "./Types/AppCallTransaction";
import StateProofTransaction from "./Types/StateProofTransaction";
import HeartbeatTransaction from "./Types/HeartbeatTransaction";
import TransactionRekey from "./Sections/TransactionRekey";
import TransactionNote from "./Sections/TransactionNote";
import TransactionMultiSig from "./Sections/TransactionMultiSig";
import TransactionLogicSig from "./Sections/TransactionLogicSig";
import TransactionAdditionalDetails from "./Sections/TransactionAdditionalDetails";

function Chip({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center text-xs border rounded px-2.5 py-0.5 border-yellow-500 text-yellow-500 cursor-default ${className}`}
    >
      {children}
    </span>
  );
}

function Transaction(): JSX.Element {
  const params = useParams();
  const location = useLocation();
  const { id } = params;

  const {
    data: txnObj,
    isLoading,
    isError,
    error,
  } = useTransaction(id);
  const { data: asset } = useTransactionAsset(txnObj);

  const txnInstance = txnObj ? new CoreTransaction(txnObj) : null;

  useTitle(`Txn ${id}`);

  useEffect(() => {
    if (isLoading || !txnInstance) return;
    let elem: HTMLElement | null = null;
    if (location.hash === "#multisig" && txnInstance.isMultiSig()) {
      elem = document.getElementById("multisig");
    } else if (location.hash === "#logicsig" && txnInstance.isLogicSig()) {
      elem = document.getElementById("logicsig");
    }
    if (elem) {
      setTimeout(
        () => elem.scrollIntoView({ behavior: "smooth", block: "start" }),
        500,
      );
    }
  }, [isLoading, location.hash]);

  return (
    <div className="mt-5">
      <div>
        {isError ? (
          <CustomError error={error?.message} />
        ) : (
          <div>
            <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 text-xl">
              <div className="group flex items-center gap-2 min-w-0">
                <span className="shrink-0">Transaction</span>
                <span className="truncate min-w-0">{id}</span>
                <Copyable className="opacity-60 group-hover:opacity-100" value={id!} />
              </div>
              <div className="flex items-center gap-2.5 shrink-0 ml-auto">
                <JsonViewer
                  filename={`txn-${id}.json`}
                  obj={txnInstance?.toJSON() ?? txnObj ?? {}}
                  title={`Transaction ${id?.slice(0, 24)}..`}
                />
                <OpenInMenu pageType="transaction" id={id} />
              </div>
            </div>

            {isLoading || !txnInstance ? (
              <LoadingTile />
            ) : (
              <div className="mt-6">
                <div className="mb-5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Chip>{txnInstance.getTypeDisplayValue()}</Chip>
                    {txnInstance.getType() === "keyreg" &&
                    !txnInstance.getKeyRegPayload()
                      ?.selectionParticipationKey ? (
                      <Chip>Register offline</Chip>
                    ) : null}
                    {txnInstance.isMultiSig() ? <Chip>MultiSig</Chip> : null}
                    {txnInstance.isLogicSig() ? <Chip>LogicSig</Chip> : null}
                    {txnInstance.getRekeyTo() ? <Chip>Rekey</Chip> : null}
                  </div>
                </div>

                <div className="rounded-lg p-5 pt-2.5 bg-background-card">
                  <div className="grid grid-cols-12 gap-4">
                    <div className="col-span-12 sm:col-span-6">
                      <div className="mt-2.5">
                        <div className="text-muted-foreground">Type</div>
                        <div className="mt-2.5">
                          {txnInstance.getTypeDisplayValue()}
                        </div>
                      </div>
                    </div>

                    <div className="col-span-12 sm:col-span-6">
                      <div className="mt-2.5">
                        <div className="text-muted-foreground">Block</div>
                        <div className="mt-2.5 inline-flex items-center gap-1">
                          <LinkToBlock id={txnInstance.getBlock()} />
                          <Copyable value={txnInstance.getBlock()} />
                        </div>
                      </div>
                    </div>

                    <div className="col-span-12 sm:col-span-6">
                      <div className="mt-2.5">
                        <div className="text-muted-foreground">Fee</div>
                        <div className="mt-2.5 inline-flex items-center gap-1">
                          {microalgosToAlgos(txnInstance.getFee())}
                          <AlgoIcon />
                        </div>
                      </div>
                    </div>

                    <div className="col-span-12 sm:col-span-6">
                      <div className="mt-2.5">
                        <div className="text-muted-foreground inline-flex items-center gap-1">
                          Timestamp <DateSwitcher />
                        </div>
                        <div className="mt-2.5">
                          <MultiDateViewer
                            timestamp={txnInstance.getTimestamp()}
                            variant="value"
                          />
                        </div>
                      </div>
                    </div>

                    {txnInstance.getGroup() ? (
                      <div className="col-span-12">
                        <div className="mt-2.5">
                          <div className="text-foreground">Group</div>
                          <div className="mt-2.5 text-[13px] break-words overflow-hidden inline-flex items-center">
                            <LinkToGroup
                              id={txnInstance.getGroup()}
                              blockId={txnInstance.getBlock()}
                            />
                            <Copyable value={txnInstance.getGroup()} />
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                {txnInstance.getType() === TXN_TYPES.PAYMENT ? (
                  <PaymentTransaction transaction={txnObj} />
                ) : null}
                {txnInstance.getType() === TXN_TYPES.ASSET_TRANSFER && asset ? (
                  <AssetTransferTransaction
                    transaction={txnObj}
                    asset={asset}
                  />
                ) : null}
                {txnInstance.getType() === TXN_TYPES.ASSET_FREEZE && asset ? (
                  <AssetFreezeTransaction transaction={txnObj} asset={asset} />
                ) : null}
                {txnInstance.getType() === TXN_TYPES.ASSET_CONFIG ? (
                  <AssetConfigTransaction transaction={txnObj} asset={asset} />
                ) : null}
                {txnInstance.getType() === TXN_TYPES.KEY_REGISTRATION ? (
                  <KeyRegTransaction transaction={txnObj} />
                ) : null}
                {txnInstance.getType() === TXN_TYPES.APP_CALL ? (
                  <AppCallTransaction transaction={txnObj} />
                ) : null}
                {txnInstance.getType() === TXN_TYPES.STATE_PROOF ? (
                  <StateProofTransaction transaction={txnObj} />
                ) : null}
                {txnInstance.getType() === TXN_TYPES.HEARTBEAT ? (
                  <HeartbeatTransaction transaction={txnObj} />
                ) : null}

                <TransactionRekey transaction={txnObj} />
                <TransactionNote transaction={txnObj} />
                <TransactionMultiSig transaction={txnObj} />
                <TransactionLogicSig transaction={txnObj} />
                <TransactionAdditionalDetails transaction={txnObj} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default Transaction;
