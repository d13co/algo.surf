import "./HeartbeatTransaction.scss";
import React from "react";
import { Grid } from "@mui/material";
import { CoreTransaction } from "../../../../../../../packages/core-sdk/classes/core/CoreTransaction";
import LinkToAccount from "../../../../Common/Links/LinkToAccount";
import LinkToBlock from "../../../../Common/Links/LinkToBlock";
import { shadedClr } from "../../../../../../../utils/common";
import Copyable from "../../../../../../Common/Copyable/Copyable";

function HeartbeatTransaction(props): JSX.Element {
  const { transaction } = props;
  const txnInstance = new CoreTransaction(transaction);
  const heartbeatPayload = txnInstance.getHeartbeatPayload();

  const {
    "hb-address": hbAddress,
    "hb-vote-id": hbVoteId,
    "hb-key-dilution": hbKd,
    "hb-seed": hbSeed,

    "hb-proof": {
      "hb-pk": hbPk,
      "hb-sig": hbSig,
      "hb-pk1sig": hbPk1Sig,
      "hb-pk2": hbPk2,
      "hb-pk2sig": hbPk2Sig,
    },
  } = heartbeatPayload ?? {};

  return (
    <>
      <div className={"heartbeat-transaction-wrapper"}>
        <div className={"heartbeat-transaction-container"}>
          <div className="heartbeat-transaction-header">Heartbeat</div>
          <div className="heartbeat-transaction-body">
            <div className="props" style={{ background: shadedClr }}>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={12} md={12} lg={12} xl={12}>
                  <div className="property">
                    <div className="key">Sender</div>
                    <div className="value small">
                      <LinkToAccount
                        copySize="m"
                        address={txnInstance.getFrom()}
                      ></LinkToAccount>
                    </div>
                  </div>
                </Grid>

                {hbAddress ? (
                  <Grid item xs={12} sm={12} md={12} lg={12} xl={12}>
                    <div className="property">
                      <div className="key">Heartbeating Account</div>
                      <div className="value small">
                        <LinkToAccount address={hbAddress} copySize="m" />
                      </div>
                    </div>
                  </Grid>
                ) : (
                  ""
                )}

                {hbSeed ? (
                  <Grid item xs={12} sm={12} md={12} lg={12} xl={12}>
                    <div className="property">
                      <div className="key">Heartbeat Seed</div>
                      <div className="value small">
                        {hbSeed}
                        <Copyable value={hbSeed} />
                      </div>
                    </div>
                  </Grid>
                ) : (
                  ""
                )}

                {hbVoteId ? (
                  <Grid item xs={12} sm={12} md={12} lg={12} xl={12}>
                    <div className="property">
                      <div className="key">Heartbeat Vote Key</div>
                      <div className="value small">
                        {hbVoteId}
                        <Copyable value={hbVoteId} />
                      </div>
                    </div>
                  </Grid>
                ) : (
                  ""
                )}

                {hbKd ? (
                  <Grid item xs={12} sm={12} md={12} lg={12} xl={12}>
                    <div className="property">
                      <div className="key">Heartbeat Key Dilution</div>
                      <div className="value small">
                        {hbKd}
                        <Copyable value={hbKd} />
                      </div>
                    </div>
                  </Grid>
                ) : (
                  ""
                )}
              </Grid>
            </div>
          </div>
        </div>
      </div>

      <div className={"heartbeat-transaction-wrapper"}>
        <div className={"heartbeat-transaction-container"}>
          <div className="heartbeat-transaction-header">Heartbeat Proof</div>
          <div className="heartbeat-transaction-body">
            <div className="props" style={{ background: shadedClr }}>
              <Grid container spacing={2}>
                {hbSig ? (
                  <Grid item xs={12} sm={12} md={12} lg={12} xl={12}>
                    <div className="property">
                      <div className="key">Heartbeat Proof Sig</div>
                      <div className="value small">
                        {hbSig}
                        <Copyable value={hbSig} />
                      </div>
                    </div>
                  </Grid>
                ) : (
                  ""
                )}
                {hbPk ? (
                  <Grid item xs={12} sm={12} md={12} lg={12} xl={12}>
                    <div className="property">
                      <div className="key">Heartbeat Proof PK</div>
                      <div className="value small">
                        {hbPk}
                        <Copyable value={hbPk} />
                      </div>
                    </div>
                  </Grid>
                ) : (
                  ""
                )}

                {hbPk1Sig ? (
                  <Grid item xs={12} sm={12} md={12} lg={12} xl={12}>
                    <div className="property">
                      <div className="key">Heartbeat Proof PK 1 Sig</div>
                      <div className="value small">
                        {hbPk1Sig}
                        <Copyable value={hbPk1Sig} />
                      </div>
                    </div>
                  </Grid>
                ) : (
                  ""
                )}

                {hbPk2 ? (
                  <Grid item xs={12} sm={12} md={12} lg={12} xl={12}>
                    <div className="property">
                      <div className="key">Heartbeat Proof PK 2</div>
                      <div className="value small">
                        {hbPk2}
                        <Copyable value={hbPk2} />
                      </div>
                    </div>
                  </Grid>
                ) : (
                  ""
                )}

                {hbPk2Sig ? (
                  <Grid item xs={12} sm={12} md={12} lg={12} xl={12}>
                    <div className="property">
                      <div className="key">Heartbeat Proof PK 2 Sig</div>
                      <div className="value small">
                        {hbPk2Sig}
                        <Copyable value={hbPk2Sig} />
                      </div>
                    </div>
                  </Grid>
                ) : (
                  ""
                )}
              </Grid>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default HeartbeatTransaction;
