import "./Block.scss";
import React, { useEffect } from "react";
import { Outlet, useNavigate, useParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "../../../../../redux/store";
import { Grid, IconButton, Tab, Tabs, Tooltip } from "@mui/material";
import { loadBlock } from "../../../../../redux/explorer/actions/block";
import LoadingTile from "../../../../Common/LoadingTile/LoadingTile";
import { CoreBlock } from "../../../../../packages/core-sdk/classes/core/CoreBlock";
import CustomError from "../../Common/CustomError/CustomError";
import LinkToBlock from "../../Common/Links/LinkToBlock";
import JsonViewer from "../../../../Common/JsonViewer/JsonViewer";
import LinkToAccount from "../../Common/Links/LinkToAccount";
import Copyable from "../../../../Common/Copyable/Copyable";
import useTitle from "../../../../Common/UseTitle/UseTitle";
import TxnTypeChip from "../../Common/TxnTypeChip/TxnTypeChip";
import { microalgosToAlgos } from "algosdk";
import NumberFormat from "react-number-format";
import AlgoIcon from "../../AlgoIcon/AlgoIcon";
import { Box, ArrowLeftFromLine, ArrowRightFromLine } from "lucide-react";
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { primaryColor } from "../../../../../theme";
import { Info as InfoIcon } from "lucide-react";
import WarningIcon from "@mui/icons-material/Warning";
import OpenInMenu from "../../../../Common/OpenIn/OpenInMenu";

const network = process.env.REACT_APP_NETWORK;

function Block(): JSX.Element {
  const theme = useTheme();
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const params = useParams();
  const { id } = params;

  const block = useSelector((state: RootState) => state.block);

  const blockInstance = new CoreBlock(block.information);
  const txnTypes = blockInstance.getTransactionsTypesCount();

  const txnTypesList = React.useMemo(() => Object.keys(txnTypes), [txnTypes]);

  useEffect(() => {
    dispatch(loadBlock(Number(id)));
  }, [dispatch, id]);

  useTitle(`Block ${id}`);

  return (
    <div className={"block-wrapper"}>
      <div className={"block-container"}>
        {block.error ? (
          <CustomError></CustomError>
        ) : (
          <div>
            <div className="block-header">
              <div className="title">
                <Box />
                {!isSmallScreen && <span>Block</span>}
                <span>
                  <span className="no-select">#</span>
                  {blockInstance.getRound()}{" "}
                </span>
                <Copyable
                  style={{ color: primaryColor }}
                  value={blockInstance.getRound()}
                />
              </div>
              <div className="navigate">
                <LinkToBlock
                  name={
                    <Tooltip title="Previous block">
                      <IconButton style={{ color: primaryColor }}>
                        <ArrowLeftFromLine />
                      </IconButton>
                    </Tooltip>
                  }
                  id={blockInstance.getRound() - 1}
                ></LinkToBlock>
                <LinkToBlock
                  name={
                    <Tooltip title="Next block">
                      <IconButton style={{ color: primaryColor }}>
                        <ArrowRightFromLine />
                      </IconButton>
                    </Tooltip>
                  }
                  id={blockInstance.getRound() + 1}
                ></LinkToBlock>
              </div>
              <div className="block-header-right">
                <JsonViewer
                  filename={`block-${id}.json`}
                  obj={block.information}
                  title={`Block ${id}`}
                ></JsonViewer>
                <OpenInMenu pageType={"block"} id={id} />
              </div>
            </div>

            {block.loading ? (
              <LoadingTile></LoadingTile>
            ) : (
              <div className="block-body">
                <div className="address"></div>

                <div className="props">
                  <Grid container spacing={1}>
                    <Grid item xs={12} sm={12} md={12} lg={12} xl={12}>
                      <div className="property">
                        <div className="key">
                          Total transactions:{" "}
                          {blockInstance.getTransactionsCount()}
                        </div>
                        <div className="value">
                          {blockInstance.getTransactionsCount() > 0 ? (
                            <div style={{ display: "flex", gap: "5px" }}>
                              {txnTypesList.map((type) => (
                                <TxnTypeChip
                                  type={type}
                                  count={txnTypes[type]}
                                />
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </Grid>

                    <Grid item xs={12} sm={5} md={6} lg={6} xl={6}>
                      <div className="property">
                        <div className="key">Age</div>
                        <div className="value">
                          {blockInstance.getTimestampDuration()} Ago
                        </div>
                      </div>
                    </Grid>

                    <Grid item xs={12} sm={7} md={6} lg={6} xl={6}>
                      <div className="property">
                        <div className="key">Timestamp</div>
                        <div className="value">
                          {blockInstance.getTimestampDisplayValue()}
                          <Copyable
                            value={blockInstance.getTimestampDisplayValue()}
                          />
                        </div>
                      </div>
                    </Grid>

                    <Grid item xs={12} sm={12} md={12} lg={12} xl={12}>
                      <div className="property">
                        <div className="key">Hash</div>
                        <div className="value">
                          <span className="long-id">{block.hash}</span>{" "}
                          <Copyable value={block.hash} />
                        </div>
                      </div>
                    </Grid>

                    <Grid item xs={12} sm={12} md={12} lg={12} xl={12}>
                      <div className="property">
                        <div className="key">Proposer</div>
                        <div className="value">
                          <LinkToAccount
                            copySize="m"
                            subPage="validator"
                            address={block.proposer}
                          />
                        </div>
                      </div>
                    </Grid>

                    {block.information["bonus"] ? (
                      <>
                        <Grid item xs={4} sm={3} md={3} lg={3} xl={3}>
                          <div className="property">
                            <div className="key">Block Reward</div>
                            <div className="value">
                              <AlgoIcon />
                              <NumberFormat
                                value={microalgosToAlgos(
                                  block.information["proposer-payout"] ?? 0
                                )}
                                displayType={"text"}
                                thousandSeparator={true}
                                style={{ marginLeft: 5 }}
                              ></NumberFormat>
                            </div>
                          </div>
                        </Grid>
                        <Grid item xs={4} sm={3} md={3} lg={3} xl={3}>
                          <div className="property">
                            <div className="key">Block Bonus</div>
                            <div className="value">
                              <AlgoIcon />
                              <NumberFormat
                                value={microalgosToAlgos(
                                  block.information["bonus"] ?? 0
                                )}
                                displayType={"text"}
                                thousandSeparator={true}
                                style={{ marginLeft: 5 }}
                              ></NumberFormat>
                            </div>
                          </div>
                        </Grid>
                        <Grid item xs={4} sm={3} md={3} lg={3} xl={3}>
                          <div className="property">
                            <div className="key">Block Fees</div>
                            <div className="value">
                              <AlgoIcon />
                              <NumberFormat
                                value={microalgosToAlgos(
                                  block.information["fees-collected"] ?? 0
                                )}
                                displayType={"text"}
                                thousandSeparator={true}
                                style={{ marginLeft: 5 }}
                              ></NumberFormat>
                            </div>
                          </div>
                        </Grid>
                      </>
                    ) : null}

                    {block.information["participation-updates"] ? (
                      <Grid item xs={12} sm={12} md={12} lg={12} xl={12}>
                        <div className="property">
                          <div className="key">
                            <Tooltip title="Account suspended from consensus for non-participation">
                              <div className="flex">
                                <WarningIcon
                                  color="warning"
                                  style={{ fontSize: "20px" }}
                                />
                                Suspended Accounts
                                <InfoIcon
                                  size="16"
                                  style={{ marginLeft: "0.5rem" }}
                                />{" "}
                              </div>
                            </Tooltip>
                          </div>
                          {block.information["participation-updates"][
                            "absent-participation-accounts"
                          ].map((acct) => (
                            <div key={`sus${acct}`} className="value">
                              <LinkToAccount
                                copySize="m"
                                subPage="validator"
                                address={acct}
                              />
                            </div>
                          ))}
                        </div>
                      </Grid>
                    ) : null}
                  </Grid>
                </div>

                <div className="block-tabs">
                  <Tabs
                    TabIndicatorProps={{
                      children: <span className="MuiTabs-indicatorSpan" />,
                    }}
                    value="transactions"
                    className="related-list"
                  >
                    <Tab
                      label="Transactions"
                      value="transactions"
                      onClick={() => {
                        navigate("/block/" + id + "/transactions");
                      }}
                    />
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

export default Block;
