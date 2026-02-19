import "./TransactionLogicSig.scss";
import React from "react";
import { CoreTransaction } from "../../../../../../../packages/core-sdk/classes/core/CoreTransaction";
import ApplicationProgram from "../../../Application/Sections/ApplicationProgram/ApplicationProgram";
import { ExpandMore } from "@mui/icons-material";
import {
  Accordion,
  AccordionSummary,
  Typography,
  AccordionDetails,
  Box,
  Tab,
} from "@mui/material";
import { TabContext, TabList, TabPanel } from "@mui/lab";
import { shadedClr } from "../../../../../../../theme";
import MultiFormatViewer from "../../../../../../Common/MultiFormatViewer/MultiFormatViewer";

function TransactionLogicSig(props): JSX.Element {
  const { transaction } = props;
  const txnInstance = new CoreTransaction(transaction);
  const sig = txnInstance.getSig();

  const [tabValue, setTabValue] = React.useState("program");

  const handleTabChange = (
    event: React.SyntheticEvent,
    newValue: string
  ) => {
    setTabValue(newValue);
  };

  const hasArgs = sig.logicsig?.args && sig.logicsig.args.length > 0;

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
                  <TabContext value={tabValue}>
                    <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
                      <TabList
                        variant="scrollable"
                        onChange={handleTabChange}
                        aria-label="logic signature tabs"
                      >
                        <Tab label="Logic Program" value="program" />
                        {hasArgs ? (
                          <Tab label="Arguments" value="args" />
                        ) : null}
                      </TabList>
                    </Box>
                    <TabPanel value="program" className="code-tab-panel">
                      <ApplicationProgram
                        id={0}
                        name="Logic program"
                        program={sig.logicsig.logic}
                      ></ApplicationProgram>
                    </TabPanel>
                    {hasArgs ? (
                      <TabPanel value="args" className="code-tab-panel">
                        <div className="lsig-args">
                          <div className="key">Logic signature arguments</div>
                          <ol className="value" start={0}>
                            {sig.logicsig.args.map((arg, index) => (
                              <li className="arg" key={arg + index}>
                                <MultiFormatViewer
                                  view="auto"
                                  includeNum={index === 0 ? undefined : "auto"}
                                  value={arg}
                                />
                                <span className="arg-length">{Buffer.from(arg, "base64").length} bytes</span>
                              </li>
                            ))}
                          </ol>
                        </div>
                      </TabPanel>
                    ) : null}
                  </TabContext>
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
