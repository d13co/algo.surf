import React, { useMemo } from "react";
import { useAddressBook } from "src/hooks/useAddressBook";
import { CoreTransaction } from "src/packages/core-sdk/classes/core/CoreTransaction";
import { microalgosToAlgos } from "src/utils/common";
import NumberFormat from "react-number-format";
import Copyable from "src/components/v2/Copyable";
import AlgoIcon from "../../../AlgoIcon/AlgoIcon";
import LinkToAccount from "../../Links/LinkToAccount";

function PaymentTransaction({ transaction }: { transaction: any }): JSX.Element {
  const txnInstance = new CoreTransaction(transaction);

  const { data: addressBookData } = useAddressBook();
  const senderLabel = useMemo(
    () => addressBookData?.[transaction.sender],
    [transaction.sender, addressBookData],
  );
  const receiverLabel = useMemo(
    () =>
      transaction.paymentTransaction
        ? addressBookData?.[transaction.paymentTransaction.receiver]
        : false,
    [transaction, addressBookData],
  );
  const closeToLabel = useMemo(
    () =>
      transaction.paymentTransaction
        ? addressBookData?.[
            transaction.paymentTransaction.closeRemainderTo
          ]
        : false,
    [transaction, addressBookData],
  );

  return (
    <div className="mt-7">
      <div className="rounded-lg p-5 bg-background-card">
        <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 sm:col-span-6">
          <div className="text-muted-foreground">
            Sender{" "}
            {senderLabel ? (
              <span className="text-xs border rounded px-2 py-0.5 border-primary text-primary ml-1">
                {senderLabel}
              </span>
            ) : null}
          </div>
          <div className="mt-2.5 text-[13px] break-words overflow-hidden">
            <LinkToAccount copySize="m" address={txnInstance.getFrom()} />
          </div>
        </div>

        <div className="col-span-12 sm:col-span-6">
          <div className="text-muted-foreground">
            Receiver{" "}
            {receiverLabel ? (
              <span className="text-xs border rounded px-2 py-0.5 border-primary text-primary ml-1">
                {receiverLabel}
              </span>
            ) : null}
          </div>
          <div className="mt-2.5 text-[13px] break-words overflow-hidden">
            <LinkToAccount copySize="m" address={txnInstance.getTo()} />
          </div>
        </div>

        <div className="col-span-12 sm:col-span-6">
          <div className="text-muted-foreground">Amount</div>
          <div className="mt-2.5 group inline-flex items-center gap-1">
            <Copyable className="opacity-60 group-hover:opacity-100" value={microalgosToAlgos(txnInstance.getAmount())} />
            <AlgoIcon />
            <NumberFormat value={microalgosToAlgos(txnInstance.getAmount())} displayType="text" thousandSeparator={true} />
          </div>
        </div>

        {txnInstance.getCloseTo() ? (
          <div className="col-span-12 sm:col-span-6">
            <div className="text-muted-foreground">
              Close account{" "}
              {closeToLabel ? (
                <span className="text-xs border rounded px-2 py-0.5 border-primary text-primary ml-1">
                  {closeToLabel}
                </span>
              ) : null}
            </div>
            <div className="mt-2.5 text-[13px] break-words overflow-hidden">
              <LinkToAccount copySize="m" address={txnInstance.getCloseTo()} />
            </div>
          </div>
        ) : null}

        {txnInstance.getCloseTo() ? (
          <div className="col-span-12 sm:col-span-6">
            <div className="text-muted-foreground">Close amount</div>
            <div className="mt-2.5 group inline-flex items-center gap-1">
              <Copyable className="opacity-60 group-hover:opacity-100" value={microalgosToAlgos(txnInstance.getCloseAmount())} />
              <AlgoIcon />
              <NumberFormat value={microalgosToAlgos(txnInstance.getCloseAmount())} displayType="text" thousandSeparator={true} />
            </div>
          </div>
        ) : null}
        </div>
      </div>
    </div>
  );
}

export default PaymentTransaction;
