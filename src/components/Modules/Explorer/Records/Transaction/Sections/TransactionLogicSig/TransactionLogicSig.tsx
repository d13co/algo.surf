import "./TransactionLogicSig.scss";
import React from "react";
import { CoreTransaction } from "../../../../../../../packages/core-sdk/classes/core/CoreTransaction";
import ApplicationProgram from "../../../Application/Sections/ApplicationProgram/ApplicationProgram";
import { ExpandMore } from "@mui/icons-material";
import { Accordion, AccordionSummary, Typography, AccordionDetails } from "@mui/material";
import { shadedClr } from "../../../../../../../theme";

function TransactionLogicSig(props): JSX.Element {
  const { transaction } = props;
  const txnInstance = new CoreTransaction(transaction);
  const sig = txnInstance.getSig();

  return (
    <div className={"transaction-logic-sig-wrapper"}>
      <div className={"transaction-logic-sig-container"}>
        {txnInstance.isLogicSig() ? (
          <div
            className="props"
            style={{ background: shadedClr, padding: "10px" }}
          >
            <Accordion defaultExpanded={true} className="transparent rounded">
              <AccordionSummary expandIcon={<ExpandMore />} id="logicsig">
                <Typography>Logic Signature</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <div className="transaction-logic-sig-body">
                  <ApplicationProgram
                    id={0}
                    name="Logic program"
                    program={sig.logicsig.logic}
                  ></ApplicationProgram>
                </div>
              </AccordionDetails>
            </Accordion>
          </div>
        ) : (
          ""
        )}
      </div>
    </div>
  );
}

export default TransactionLogicSig;
