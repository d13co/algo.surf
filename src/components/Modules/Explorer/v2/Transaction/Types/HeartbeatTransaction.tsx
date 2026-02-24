import React from "react";
import { CoreTransaction } from "src/packages/core-sdk/classes/core/CoreTransaction";
import { bytesToBase64 } from "algosdk";
import LinkToAccount from "../../Links/LinkToAccount";
import Copyable from "src/components/v2/Copyable";

function HeartbeatTransaction({
  transaction,
}: {
  transaction: any;
}): JSX.Element {
  const txnInstance = new CoreTransaction(transaction);
  const heartbeatPayload = txnInstance.getHeartbeatPayload();

  const hbAddress = heartbeatPayload?.hbAddress;
  const hbVoteId = heartbeatPayload?.hbVoteId ? bytesToBase64(heartbeatPayload.hbVoteId) : "";
  const hbKd = heartbeatPayload?.hbKeyDilution != null ? Number(heartbeatPayload.hbKeyDilution) : undefined;
  const hbSeed = heartbeatPayload?.hbSeed ? bytesToBase64(heartbeatPayload.hbSeed) : "";
  const hbPk = heartbeatPayload?.hbProof?.hbPk ? bytesToBase64(heartbeatPayload.hbProof.hbPk) : "";
  const hbSig = heartbeatPayload?.hbProof?.hbSig ? bytesToBase64(heartbeatPayload.hbProof.hbSig) : "";
  const hbPk1Sig = heartbeatPayload?.hbProof?.hbPk1sig ? bytesToBase64(heartbeatPayload.hbProof.hbPk1sig) : "";
  const hbPk2 = heartbeatPayload?.hbProof?.hbPk2 ? bytesToBase64(heartbeatPayload.hbProof.hbPk2) : "";
  const hbPk2Sig = heartbeatPayload?.hbProof?.hbPk2sig ? bytesToBase64(heartbeatPayload.hbProof.hbPk2sig) : "";

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

          {hbAddress ? (
            <div className="col-span-12">
              <div className="text-muted-foreground">Heartbeating Account</div>
              <div className="mt-2.5 text-[13px] break-words overflow-hidden">
                <LinkToAccount address={hbAddress} copySize="m" />
              </div>
            </div>
          ) : null}

          {hbSeed ? (
            <div className="col-span-12">
              <div className="text-muted-foreground">Heartbeat Seed</div>
              <div className="mt-2.5 text-[13px] break-all inline-flex items-center group">
                {hbSeed}
                <Copyable className="opacity-60 group-hover:opacity-100" value={hbSeed} />
              </div>
            </div>
          ) : null}

          {hbVoteId ? (
            <div className="col-span-12">
              <div className="text-muted-foreground">Heartbeat Vote Key</div>
              <div className="mt-2.5 text-[13px] break-all inline-flex items-center group">
                {hbVoteId}
                <Copyable className="opacity-60 group-hover:opacity-100" value={hbVoteId} />
              </div>
            </div>
          ) : null}

          {hbKd ? (
            <div className="col-span-12">
              <div className="text-muted-foreground">
                Heartbeat Key Dilution
              </div>
              <div className="mt-2.5 text-[13px] break-all inline-flex items-center group">
                {hbKd}
                <Copyable className="opacity-60 group-hover:opacity-100" value={hbKd} />
              </div>
            </div>
          ) : null}
          </div>
        </div>
      </div>

      <div className="mt-7">
        <div className="rounded-lg p-5 bg-background-card">
          <div className="grid grid-cols-12 gap-4">
          {hbSig ? (
            <div className="col-span-12">
              <div className="text-muted-foreground">Heartbeat Proof Sig</div>
              <div className="mt-2.5 text-[13px] break-all inline-flex items-center group">
                {hbSig}
                <Copyable className="opacity-60 group-hover:opacity-100" value={hbSig} />
              </div>
            </div>
          ) : null}

          {hbPk ? (
            <div className="col-span-12">
              <div className="text-muted-foreground">Heartbeat Proof PK</div>
              <div className="mt-2.5 text-[13px] break-all inline-flex items-center group">
                {hbPk}
                <Copyable className="opacity-60 group-hover:opacity-100" value={hbPk} />
              </div>
            </div>
          ) : null}

          {hbPk1Sig ? (
            <div className="col-span-12">
              <div className="text-muted-foreground">
                Heartbeat Proof PK 1 Sig
              </div>
              <div className="mt-2.5 text-[13px] break-all inline-flex items-center group">
                {hbPk1Sig}
                <Copyable className="opacity-60 group-hover:opacity-100" value={hbPk1Sig} />
              </div>
            </div>
          ) : null}

          {hbPk2 ? (
            <div className="col-span-12">
              <div className="text-muted-foreground">Heartbeat Proof PK 2</div>
              <div className="mt-2.5 text-[13px] break-all inline-flex items-center group">
                {hbPk2}
                <Copyable className="opacity-60 group-hover:opacity-100" value={hbPk2} />
              </div>
            </div>
          ) : null}

          {hbPk2Sig ? (
            <div className="col-span-12">
              <div className="text-muted-foreground">
                Heartbeat Proof PK 2 Sig
              </div>
              <div className="mt-2.5 text-[13px] break-all inline-flex items-center group">
                {hbPk2Sig}
                <Copyable className="opacity-60 group-hover:opacity-100" value={hbPk2Sig} />
              </div>
            </div>
          ) : null}
          </div>
        </div>
      </div>
    </>
  );
}

export default HeartbeatTransaction;
