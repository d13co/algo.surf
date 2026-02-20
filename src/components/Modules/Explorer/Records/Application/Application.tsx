import "./Application.scss";
import React, { useEffect, useMemo } from "react";
import {
  matchPath,
  Outlet,
  useLocation,
  useNavigate,
  useSearchParams,
  useParams,
} from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "../../../../../redux/store";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Grid,
  Tab,
  Tabs,
  Tooltip,
  Typography,
} from "@mui/material";
import { loadApplication } from "../../../../../redux/explorer/actions/application";
import { CoreApplication } from "../../../../../packages/core-sdk/classes/core/CoreApplication";
import ApplicationGlobalState from "./Sections/ApplicationGlobalState/ApplicationGlobalState";
import LinkToAccount from "../../Common/Links/LinkToAccount";
import LoadingTile from "../../../../Common/LoadingTile/LoadingTile";
import { shadedClr } from "../../../../../utils/common";
import ApplicationProgram from "./Sections/ApplicationProgram/ApplicationProgram";
import CustomError from "../../Common/CustomError/CustomError";
import ApplicationActions from "./Sections/ApplicationActions/ApplicationActions";
import Dym from "../Dym";
import useTitle from "../../../../Common/UseTitle/UseTitle";
import { ExpandMore } from "@mui/icons-material";
import { TabContext, TabList, TabPanel } from "@mui/lab";
import Copyable from "../../../../Common/Copyable/Copyable";
import { primaryColor } from "../../../../../theme/index";
import { CircleHelp } from "lucide-react";
import { usePersistenBooleanState } from "../../../../../utils/usePersistenBooleanState";

const isDevNet = process.env.REACT_APP_NETWORK !== "Mainnet";

function Application(): JSX.Element {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const { id } = params;

  let tabValue = "transactions";
  const { pathname } = useLocation();

  if (matchPath("/application/:id/transactions", pathname)) {
    tabValue = "transactions";
  } else if (matchPath("/application/:id/boxes", pathname)) {
    tabValue = "boxes";
  }

  const [codeTabValue, setCodeTabValue] = React.useState("global");
  const [expanded, setExpanded] = usePersistenBooleanState(
    "application-code-expanded",
    isDevNet
  );

  const application = useSelector((state: RootState) => state.application);
  const applicationInstance = new CoreApplication(application.information);

  const dym = searchParams.get("dym");
  const [dymString, dymLink] = useMemo(() => {
    if (dym) {
      const blockNum = dym.split(":")[1];
      return [`Block ${blockNum}`, `/block/${blockNum}`];
    } else {
      return [];
    }
  }, [dym]);

  useTitle(`App ${id}`);

  useEffect(() => {
    if (
      codeTabValue === "global" &&
      application.information.id &&
      application.information.params["clear-state-program"] &&
      !application.information.params["global-state"]
    ) {
      setCodeTabValue("approval");
    }
  }, [
    application.information.id,
    application.information.params["clear-state-program"],
  ]);

  useEffect(() => {
    dispatch(loadApplication(Number(id)));
  }, [dispatch, id]);

  const handleCodeTabChange = (
    event: React.SyntheticEvent,
    newValue: string
  ) => {
    setCodeTabValue(newValue);
  };

  const [approvalSize, clearSize] = useMemo(() => {
    const approval = Buffer.from(
      application.information.params["approval-program"] || "",
      "base64"
    );
    const clear = Buffer.from(
      application.information.params["clear-state-program"] || "",
      "base64"
    );
    return [approval.length, clear.length];
  }, [application]);

  return (
    <div className={"application-wrapper"}>
      <div className={"application-container"}>
        {dym ? <Dym text={dymString} link={dymLink} /> : null}

        {application.error ? (
          <CustomError></CustomError>
        ) : (
          <div>
            <div className="application-header">
              <div>Application overview</div>
              <div>
                <ApplicationActions
                  application={application}
                ></ApplicationActions>
              </div>
            </div>

            {application.loading ? (
              <LoadingTile></LoadingTile>
            ) : (
              <div className="application-body">
                <div className="id">
                  <span className="no-select">#</span>
                  {applicationInstance.getId()}
                  <Copyable value={applicationInstance.getId()} />
                </div>

                <div className="props" style={{ background: shadedClr }}>
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={12} md={12} lg={12} xl={12}>
                      <div className="property">
                        <div className="key">Creator</div>
                        <div className="value small">
                          <LinkToAccount
                            copySize="m"
                            address={applicationInstance.getCreator()}
                          ></LinkToAccount>
                        </div>
                      </div>
                    </Grid>
                    <Grid item xs={12} sm={12} md={12} lg={12} xl={12}>
                      <div className="property">
                        <div className="key">Application escrow account</div>
                        <div className="value small">
                          <LinkToAccount
                            copySize="m"
                            address={applicationInstance.getApplicationAddress()}
                          ></LinkToAccount>
                        </div>
                      </div>
                    </Grid>
                  </Grid>
                </div>

                {/* <ApplicationAbi application={application}></ApplicationAbi> TODO put back */}
                <div
                  className="props"
                  style={{ background: shadedClr, padding: "8px" }}
                >
                  <Accordion
                    defaultExpanded={expanded}
                    onChange={(_, expanded) => {
                      setExpanded(expanded);
                    }}
                    className="transparent rounded"
                  >
                    <AccordionSummary
                      expandIcon={<ExpandMore />}
                      id="code-state"
                    >
                      <Typography>Application State</Typography>
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
                            <Tab label="Global State" value="global" />
                            <Tab label="Approval Program" value="approval" />
                            <Tab label="Clear State Program" value="clear" />
                            <Tab label="Program Hashes" value="hashes" />
                            <Tab label="Schema & Size" value="schema" />
                          </TabList>
                        </Box>
                        <TabPanel value="global" className="code-tab-panel">
                          <ApplicationGlobalState></ApplicationGlobalState>
                        </TabPanel>
                        <TabPanel value="approval" className="code-tab-panel">
                          <ApplicationProgram
                            name="Approval program"
                            id={Number(id)}
                            program={applicationInstance.getApprovalProgram()}
                          />
                        </TabPanel>
                        <TabPanel value="clear" className="code-tab-panel">
                          <ApplicationProgram
                            name="Clear state program"
                            id={Number(id)}
                            program={applicationInstance.getClearProgram()}
                          ></ApplicationProgram>
                        </TabPanel>
                        <TabPanel
                          value="schema"
                          className="code-tab-panel padded"
                        >
                          <Grid container spacing={2}>
                            <Grid item xs={12} sm={6} md={3} lg={3} xl={3}>
                              <div className="property center">
                                <div className="key">Global state byte</div>
                                <div className="value">
                                  {applicationInstance.getGlobalSchemaByte()}
                                </div>
                              </div>
                            </Grid>
                            <Grid item xs={12} sm={6} md={3} lg={3} xl={3}>
                              <div className="property center">
                                <div className="key">Global state uint</div>
                                <div className="value">
                                  {applicationInstance.getGlobalSchemaUint()}
                                </div>
                              </div>
                            </Grid>

                            <Grid item xs={12} sm={6} md={3} lg={3} xl={3}>
                              <div className="property center">
                                <div className="key">Local state byte</div>
                                <div className="value">
                                  {applicationInstance.getLocalSchemaByte()}
                                </div>
                              </div>
                            </Grid>
                            <Grid item xs={12} sm={6} md={3} lg={3} xl={3}>
                              <div className="property center">
                                <div className="key">Local state uint</div>
                                <div className="value">
                                  {applicationInstance.getLocalSchemaUint()}
                                </div>
                              </div>
                            </Grid>

                            <Grid item xs={12} sm={6} md={6} lg={3} xl={3}>
                              <div className="property center">
                                <div className="key">Approval program size</div>
                                <div className="value">
                                  {approvalSize} bytes
                                </div>
                              </div>
                            </Grid>

                            <Grid item xs={12} sm={6} md={6} lg={3} xl={3}>
                              <div className="property center">
                                <div className="key">Clear program size</div>
                                <div className="value">{clearSize} bytes</div>
                              </div>
                            </Grid>

                            <Grid item xs={12} sm={6} md={6} lg={3} xl={3}>
                              <div className="property center">
                                <div className="key">Extra Program Pages</div>
                                <div className="value">
                                  {
                                    application.information.params[
                                      "extra-program-pages"
                                    ]
                                  }
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
                        </TabPanel>
                        <TabPanel
                          value="hashes"
                          className="code-tab-panel padded"
                        >
                          <div className="hashtitle">Approval SHA512/256</div>
                          <div className="hash small">
                            <span>
                              {application.hashes.sha512_256.approval}
                            </span>
                            <Copyable
                              value={application.hashes.sha512_256.approval}
                            />
                          </div>

                          {application.hashes.sha512_256.approvalPages.length >
                          1 ? (
                            <>
                              <div className="hashtitle">
                                Approval pages SHA512/256{" "}
                                <Tooltip title="Approval program hashed in 4 KB chunks">
                                  <CircleHelp
                                    color={primaryColor}
                                    size={16}
                                    fontSize={16}
                                  />
                                </Tooltip>
                              </div>
                              {application.hashes.sha512_256.approvalPages.map(
                                (pageHash, i) => (
                                  <div className="hash small">
                                    <span>
                                      <span
                                        style={{
                                          fontWeight: "bold",
                                          color: primaryColor,
                                        }}
                                      >
                                        {i + 1}/
                                      </span>{" "}
                                      {pageHash}
                                    </span>
                                    <Copyable value={pageHash} />
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
                        </TabPanel>
                      </TabContext>
                    </AccordionDetails>
                  </Accordion>
                </div>

                <div className="application-tabs">
                  <Tabs
                    TabIndicatorProps={{
                      children: <span className="MuiTabs-indicatorSpan" />,
                    }}
                    value={tabValue}
                    className="related-list"
                  >
                    <Tab
                      label="Transactions"
                      value="transactions"
                      onClick={() => {
                        navigate("/application/" + id + "/transactions");
                      }}
                    />
                    {application.boxNames.length || application.boxError ? (
                      <Tab
                        label="Boxes"
                        value="boxes"
                        onClick={() => {
                          navigate("/application/" + id + "/boxes");
                        }}
                      />
                    ) : null}
                  </Tabs>
                  <Outlet />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default Application;
