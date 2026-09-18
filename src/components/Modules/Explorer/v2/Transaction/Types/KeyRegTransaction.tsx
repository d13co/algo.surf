import React from "react";
import { CoreTransaction } from "src/packages/core-sdk/classes/core/CoreTransaction";
import { bytesToBase64 } from "algosdk";
import LinkToAccount from "../../Links/LinkToAccount";
import LinkToBlock from "../../Links/LinkToBlock";
import XChainOwnerField from "../Sections/XChainOwner";
import { partkeyIntegrityHash } from "src/utils/partkeyIntegrityHash";
import Copyable from "src/components/v2/Copyable";

function KeyRegTransaction({
  transaction,
}: {
  transaction: any;
}): JSX.Element {
  const txnInstance = new CoreTransaction(transaction);
  const keyRegPayload = txnInstance.getKeyRegPayload();
  const genesisHash = txnInstance.getGenesisHashBytes();
  const integrityHash = genesisHash
    ? partkeyIntegrityHash({
        genesisHash,
        address: txnInstance.getFrom(),
        selectionKey: keyRegPayload?.selectionParticipationKey,
        voteKey: keyRegPayload?.voteParticipationKey,
        stateProofKey: keyRegPayload?.stateProofKey,
        voteFirstValid: keyRegPayload?.voteFirstValid,
        voteLastValid: keyRegPayload?.voteLastValid,
        voteKeyDilution: keyRegPayload?.voteKeyDilution,
      })
    : "";

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

        <XChainOwnerField transaction={transaction} className="col-span-12" />

        {integrityHash ? (
          <div className="col-span-12">
            <div className="text-muted-foreground">
              Integrity hash{" "}
              <span className="text-xs">(ARC-81)</span>
            </div>
            <div className="mt-2.5 text-[13px] font-mono flex items-center gap-1">
              {integrityHash}
              <Copyable size="m" value={integrityHash} />
            </div>
          </div>
        ) : null}

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
