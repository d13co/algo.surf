import "./AppCallTransaction.scss";
import React from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Grid,
  Tab,
  Typography,
} from "@mui/material";
import { CoreTransaction } from "../../../../../../../packages/core-sdk/classes/core/CoreTransaction";
import AppCallTxnGlobalStateDelta from "./Sections/AppCallTxnGlobalStateDelta/AppCallTxnGlobalStateDelta";
import LinkToAccount from "../../../../Common/Links/LinkToAccount";
import LinkToApplication from "../../../../Common/Links/LinkToApplication";
import { capitalizeFirst, shadedClr } from "../../../../../../../utils/common";
import AppCallTxnLocalStateDelta from "./Sections/AppCallTxnLocalStateDelta/AppCallTxnLocalStateDelta";
import AppCallTxnInnerTxns from "./Sections/AppCallTxnInnerTxns/AppCallTxnInnerTxns";
import AppCallTxnArguments from "./Sections/AppCallTxnArguments/AppCallTxnArguments";
import AppCallTxnForeignAssets from "./Sections/AppCallTxnForeignAssets/AppCallTxnForeignAssets";
import AppCallTxnForeignApps from "./Sections/AppCallTxnForeignApps/AppCallTxnForeignApps";
import AppCallTxnForeignAccounts from "./Sections/AppCallTxnForeignAccounts/AppCallTxnForeignAccounts";
import AppCallTxnLogs from "./Sections/AppCallTxnLogs/AppCallTxnLogs";
import ApplicationProgram from "../../../Application/Sections/ApplicationProgram/ApplicationProgram";
import { CoreAppCall } from "../../../../../../../packages/core-sdk/classes/core/CoreAppCall";
import { ExpandMore } from "@mui/icons-material";
import { TabContext, TabList, TabPanel } from "@mui/lab";

function AppCallTransaction(props): JSX.Element {
  const { transaction } = props;

  const txnInstance = new CoreTransaction(transaction);
  const appCallPayload = txnInstance.getAppCallPayload();

  const callInstance = new CoreAppCall(appCallPayload);
  const isCreate = callInstance.isCreate();
  const id = appCallPayload["application-id"];

  const [codeTabValue, setCodeTabValue] = React.useState("approval");

  const handleCodeTabChange = (
    event: React.SyntheticEvent,
    newValue: string
  ) => {
    setCodeTabValue(newValue);
  };

  return (
    <div className={"app-call-transaction-wrapper"}>
      <div className={"app-call-transaction-container"}>
        <div className="app-call-transaction-header">Application call</div>
        <div className="app-call-transaction-body">
          <div className="props" style={{ background: shadedClr }}>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={4} lg={4} xl={4}>
                <div className="property">
                  <div className="key">Application ID</div>
                  <div className="value">
                    <LinkToApplication
                      id={txnInstance.getAppId()}
                      copy="right"
                      copySize="s"
                    ></LinkToApplication>
                  </div>
                </div>
              </Grid>

              <Grid item xs={12} sm={6} md={4} lg={4} xl={4}>
                <div className="property">
                  <div className="key">Action</div>
                  <div className="value">{isCreate ? "Creation" : "Call"}</div>
                </div>
              </Grid>

              <Grid item xs={12} sm={6} md={4} lg={4} xl={4}>
                <div className="property">
                  <div className="key">On completion</div>
                  <div className="value">{capitalizeFirst(appCallPayload["on-completion"])}</div>
                </div>
              </Grid>

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
            </Grid>
          </div>

          {appCallPayload["approval-program"] ? (
            <div>
              <div
                className="props"
                style={{ background: shadedClr, padding: "8px", marginTop: "30px", }}
              >
                <Accordion
                  defaultExpanded={false}
                  className="transparent rounded"
                >
                  <AccordionSummary expandIcon={<ExpandMore />} id="code-state">
                    <Typography>Application Programs</Typography>
                  </AccordionSummary>
                  <AccordionDetails
                    style={{ paddingTop: 0, marginTop: "-10px" }}
                  >
                    <TabContext value={codeTabValue}>
                      <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
                        <TabList
                          variant="scrollable"
                          onChange={handleCodeTabChange}
                          aria-label="lab API tabs example"
                        >
                          <Tab label="Approval Program" value="approval" />
                          <Tab label="Clear State Program" value="clear" />
                          {/* <Tab label="Program Hashes" value="hashes" /> */}
                          { isCreate ? <Tab label="Schema" value="schema" /> : null }
                          
                        </TabList>
                      </Box>
                      <TabPanel value="approval" className="code-tab-panel">
                        <ApplicationProgram
                          name="Approval program"
                          id={Number(id)}
                          program={appCallPayload["approval-program"]}
                        />
                      </TabPanel>
                      <TabPanel value="clear" className="code-tab-panel">
                        <ApplicationProgram
                          name="Clear state program"
                          id={Number(id)}
                          program={appCallPayload["clear-state-program"]}
                        ></ApplicationProgram>
                      </TabPanel>
                      { isCreate ? <TabPanel
                          value="schema"
                          className="code-tab-panel padded"
                        >
                          <Grid container spacing={2}>
                            <Grid item xs={12} sm={6} md={3} lg={3} xl={3}>
                              <div className="property center">
                                <div className="key">Global state byte</div>
                                <div className="value">
                                  {appCallPayload["global-state-schema"]["num-byte-slice"] ?? 0}
                                </div>
                              </div>
                            </Grid>
                            <Grid item xs={12} sm={6} md={3} lg={3} xl={3}>
                              <div className="property center">
                                <div className="key">Global state uint</div>
                                <div className="value">
                                {appCallPayload["global-state-schema"]["num-uint"] ?? 0}
                                </div>
                              </div>
                            </Grid>

                            <Grid item xs={12} sm={6} md={3} lg={3} xl={3}>
                              <div className="property center">
                                <div className="key">Local state byte</div>
                                <div className="value">
                                  {appCallPayload["local-state-schema"]["num-byte-slice"] ?? 0}
                                </div>
                              </div>
                            </Grid>
                            <Grid item xs={12} sm={6} md={3} lg={3} xl={3}>
                              <div className="property center">
                                <div className="key">Local state uint</div>
                                <div className="value">
                                  {appCallPayload["local-state-schema"]["num-uint"] ?? 0}
                                </div>
                              </div>
                            </Grid>

                            <Grid
                              item
                              xs={12}
                              sm={6}
                              md={6}
                              lg={6}
                              xl={6}
                            ></Grid>
                          </Grid>
                        </TabPanel> : null }
                      {/* <TabPanel
                          value="hashes"
                          className="code-tab-panel padded"
                        >
                          <div className="hashtitle">Approval SHA512/256</div>
                          <div className="hash small">
                            <span>{application.hashes.sha512_256.approval}</span>
                            <Copyable
                              value={application.hashes.sha512_256.approval}
                            />
                          </div>

                          {application.hashes.sha512_256.approvalPages.length >
                          1 ? (
                            <>
                              <div className="hashtitle">
                                Approval pages SHA512/256 <Tooltip title="Approval program hashed in 4 KB chunks"><CircleHelp color={primaryColor} size={16} fontSize={16} /></Tooltip>
                              </div>
                              {application.hashes.sha512_256.approvalPages.map(
                                (pageHash, i) => (
                                  <div className="hash small">
                                    <span>
                                      <span style={{ fontWeight: "bold", color: primaryColor }}>
                                        {i + 1}/
                                      </span>{" "}
                                      {pageHash}
                                    </span>
                                    <Copyable
                                      value={
                                        pageHash
                                      }
                                    />
                                  </div>
                                )
                              )}
                            </>
                          ) : null}

                          <div className="hashtitle">
                            Clear State SHA512/256
                          </div>
                          <div className="hash small">
                            <span>{application.hashes.sha512_256.clear}</span>
                            <Copyable
                              value={application.hashes.sha512_256.clear}
                            />
                          </div>
                        </TabPanel> */}
                    </TabContext>
                  </AccordionDetails>
                </Accordion>
              </div>
            </div>
          ) : null}

          {txnInstance.hasAppCallArguments() ? (
            <div>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={12} md={12} lg={12} xl={12}>
                  <AppCallTxnArguments
                    transaction={transaction}
                  ></AppCallTxnArguments>
                </Grid>
              </Grid>
            </div>
          ) : (
            ""
          )}

          {txnInstance.hasAppCallForeignAssets() ? (
            <div>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={12} md={12} lg={12} xl={12}>
                  <AppCallTxnForeignAssets
                    assets={appCallPayload["foreign-assets"]}
                  ></AppCallTxnForeignAssets>
                </Grid>
              </Grid>
            </div>
          ) : (
            ""
          )}

          {txnInstance.hasAppCallForeignApps() ? (
            <div>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={12} md={12} lg={12} xl={12}>
                  <AppCallTxnForeignApps
                    apps={appCallPayload["foreign-apps"]}
                  ></AppCallTxnForeignApps>
                </Grid>
              </Grid>
            </div>
          ) : (
            ""
          )}

          {txnInstance.hasAppCallForeignAccounts() ? (
            <div>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={12} md={12} lg={12} xl={12}>
                  <AppCallTxnForeignAccounts
                    accounts={appCallPayload["accounts"]}
                  ></AppCallTxnForeignAccounts>
                </Grid>
              </Grid>
            </div>
          ) : (
            ""
          )}

          {txnInstance.hasGlobalStateDelta() ? (
            <div>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={12} md={12} lg={12} xl={12}>
                  <AppCallTxnGlobalStateDelta
                    state={transaction["global-state-delta"]}
                  ></AppCallTxnGlobalStateDelta>
                </Grid>
              </Grid>
            </div>
          ) : (
            ""
          )}

          {txnInstance.hasLocalStateDelta() ? (
            <div>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={12} md={12} lg={12} xl={12}>
                  <AppCallTxnLocalStateDelta
                    state={transaction["local-state-delta"]}
                  ></AppCallTxnLocalStateDelta>
                </Grid>
              </Grid>
            </div>
          ) : (
            ""
          )}

          {txnInstance.hasInnerTransactions() ? (
            <div>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={12} md={12} lg={12} xl={12}>
                  <AppCallTxnInnerTxns
                    transaction={transaction}
                  ></AppCallTxnInnerTxns>
                </Grid>
              </Grid>
            </div>
          ) : (
            ""
          )}

          {txnInstance.hasLogs() ? (
            <div>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={12} md={12} lg={12} xl={12}>
                  <AppCallTxnLogs logs={transaction.logs}></AppCallTxnLogs>
                </Grid>
              </Grid>
            </div>
          ) : (
            ""
          )}
        </div>
      </div>
    </div>
  );
}

export default AppCallTransaction;
