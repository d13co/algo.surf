import React from "react";
import { CoreTransaction } from "src/packages/core-sdk/classes/core/CoreTransaction";
import { bytesToBase64 } from "algosdk";
import LinkToAccount from "../../Links/LinkToAccount";
import LinkToBlock from "../../Links/LinkToBlock";

function KeyRegTransaction({
  transaction,
}: {
  transaction: any;
}): JSX.Element {
  const txnInstance = new CoreTransaction(transaction);
  const keyRegPayload = txnInstance.getKeyRegPayload();

  return (
    <div className="mt-7">
      <div className="rounded-lg p-5 bg-background-card">
        <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12">
          <div className="text-muted-foreground">Sender</div>
          <div className="mt-2.5 text-[13px] break-words overflow-hidden">
            <LinkToAccount copySize="m" address={txnInstance.getFrom()} />
          </div>
        </div>

        {keyRegPayload?.voteParticipationKey ? (
          <div className="col-span-12">
            <div className="text-muted-foreground">Vote participation key</div>
            <div className="mt-2.5 text-[13px] break-all">
              {bytesToBase64(keyRegPayload.voteParticipationKey)}
            </div>
          </div>
        ) : null}

        {keyRegPayload?.selectionParticipationKey ? (
          <div className="col-span-12">
            <div className="text-muted-foreground">
              Selection participation key
            </div>
            <div className="mt-2.5 text-[13px] break-all">
              {bytesToBase64(keyRegPayload.selectionParticipationKey)}
            </div>
          </div>
        ) : null}

        {keyRegPayload?.stateProofKey ? (
          <div className="col-span-12">
            <div className="text-muted-foreground">State proof key</div>
            <div className="mt-2.5 text-[13px] break-all">
              {bytesToBase64(keyRegPayload.stateProofKey)}
            </div>
          </div>
        ) : null}

        {keyRegPayload?.selectionParticipationKey ? (
          <>
            <div className="col-span-12 sm:col-span-4">
              <div className="text-muted-foreground">Vote first valid</div>
              <div className="mt-2.5">
                <LinkToBlock id={Number(keyRegPayload.voteFirstValid)} />
              </div>
            </div>

            <div className="col-span-12 sm:col-span-4">
              <div className="text-muted-foreground">Vote last valid</div>
              <div className="mt-2.5">
                <LinkToBlock id={Number(keyRegPayload.voteLastValid)} />
              </div>
            </div>

            <div className="col-span-12 sm:col-span-4">
              <div className="text-muted-foreground">Vote key dilution</div>
              <div className="mt-2.5">
                {Number(keyRegPayload.voteKeyDilution)}
              </div>
            </div>
          </>
        ) : (
          <div className="col-span-12 sm:col-span-4">
            <div className="text-muted-foreground">
              Key registration offline
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

export default KeyRegTransaction;
