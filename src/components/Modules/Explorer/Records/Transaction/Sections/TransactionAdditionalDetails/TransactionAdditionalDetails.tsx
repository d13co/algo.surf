import "./TransactionAdditionalDetails.scss";
import React from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Grid,
  Typography,
} from "@mui/material";
import { ExpandMore } from "@mui/icons-material";
import NumberFormat from "react-number-format";
import AlgoIcon from "../../../../AlgoIcon/AlgoIcon";
import { CoreTransaction } from "../../../../../../../packages/core-sdk/classes/core/CoreTransaction";
import {
  shadedClr,
  microalgosToAlgos,
} from "../../../../../../../utils/common";
import LinkToBlock from "../../../../Common/Links/LinkToBlock";

function TransactionAdditionalDetails(props): JSX.Element {
  const { transaction } = props;
  const txnInstance = new CoreTransaction(transaction);

  return (
    <div className={"transaction-additional-details-wrapper"}>
      <div className={"transaction-additional-details-container"}>
        <div
          className="props"
          style={{ background: shadedClr, padding: "10px" }}
        >
          <Accordion className="transparent rounded">
            <AccordionSummary
              expandIcon={<ExpandMore />}
              id="additional-information"
            >
              <Typography>Additional information</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6} md={6} lg={3} xl={3}>
                  <div className="property">
                    <div className="key">First round</div>
                    <div className="value">
                      <LinkToBlock id={txnInstance.getFirstRound()} /><span className="rnddelta">({txnInstance.getFirstRound() - txnInstance.getBlock()})</span>
                    </div>
                  </div>
                </Grid>
                <Grid item xs={12} sm={6} md={6} lg={3} xl={3}>
                  <div className="property">
                    <div className="key">Last round</div>
                    <div className="value">
                      <LinkToBlock id={txnInstance.getLastRound()} /><span className="rnddelta">(+{txnInstance.getLastRound() - txnInstance.getBlock()})</span>
                    </div>
                  </div>
                </Grid>

                <Grid item xs={12} sm={6} md={6} lg={3} xl={3}>
                  <div className="property">
                    <div className="key">Sender rewards</div>
                    <div className="value">
                      <NumberFormat
                        value={microalgosToAlgos(
                          txnInstance.getSenderRewards()
                        )}
                        displayType={"text"}
                        thousandSeparator={true}
                        style={{ marginRight: 5 }}
                      ></NumberFormat>
                      <AlgoIcon></AlgoIcon>
                    </div>
                  </div>
                </Grid>

                <Grid item xs={12} sm={6} md={6} lg={3} xl={3}>
                  <div className="property">
                    <div className="key">Receiver rewards</div>
                    <div className="value">
                      <NumberFormat
                        value={microalgosToAlgos(
                          txnInstance.getReceiverRewards()
                        )}
                        displayType={"text"}
                        thousandSeparator={true}
                        style={{ marginRight: 5 }}
                      ></NumberFormat>
                      <AlgoIcon></AlgoIcon>
                    </div>
                  </div>
                </Grid>
              </Grid>
            </AccordionDetails>
          </Accordion>
        </div>
      </div>
    </div>
  );
}

export default TransactionAdditionalDetails;
