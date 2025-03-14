import "./Account.scss";
import React, { useRef, useCallback, useEffect } from "react";
import {
  matchPath,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { loadAccount } from "../../../../../redux/explorer/actions/account";
import { RootState } from "../../../../../redux/store";
import { Chip, Link, Grid, Tooltip, Tab, Tabs } from "@mui/material";
import NumberFormat from "react-number-format";
import { microalgosToAlgos } from "../../../../../utils/common";
import AlgoIcon from "../../AlgoIcon/AlgoIcon";
import { CoreAccount } from "../../../../../packages/core-sdk/classes/core/CoreAccount";
import LoadingTile from "../../../../Common/LoadingTile/LoadingTile";
import JsonViewer from "../../../../Common/JsonViewer/JsonViewer";
import CustomError from "../../Common/CustomError/CustomError";
import Copyable from "../../../../Common/Copyable/Copyable";
import AccountLabelChip from "../../../../Common/AccountLabelChip/AccountLabelChip";
import LinkToApplication from "../../Common/Links/LinkToApplication";
import LinkToAccount from "../../Common/Links/LinkToAccount";
import useTitle from "../../../../Common/UseTitle/UseTitle";
import LinkToTransaction from "../../Common/Links/LinkToTransaction";
import { loadValidator } from "../../../../../redux/explorer/actions/validator";

const network = process.env.REACT_APP_NETWORK;
const isMainnet = network === "Mainnet";

function plural(num: number): string {
  return num !== 1 ? "s" : "";
}

function Account(): JSX.Element {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const params = useParams();
  const { address } = params;

  const account = useSelector((state: RootState) => state.account);
  const addressBook = useSelector((state: RootState) => state.addressBook);
  const validatorData = useSelector((state: RootState) => state.validator);

  const addressLabel = React.useMemo(
    () => addressBook.data[address],
    [address, addressBook.data]
  );
  const tinymanPool = React.useMemo(() => {
    const { "auth-addr": auth } = account.information;
    if (auth !== "XSKED5VKZZCSYNDWXZJI65JM2HP7HZFJWCOBIMOONKHTK5UVKENBNVDEYM") {
      return false;
    }
    const type = (account.optedAssets ?? []).find(
      ({ params: { "unit-name": u } }) => u === "TMPOOL2"
    );
    return type ? type.params.name.replace("TinymanPool2.0 ", "") : false;
  }, [address, account?.optedAssets, account.information]);

  let tabValue = "transactions";
  const { pathname } = useLocation();

  const hasOptedAssets = account.optedAssets.length;
  const hasCreatedAssets = account.createdAssets.length;
  const hasOptedApps = account.optedApplications.length;
  const hasCreatedApps = account.createdApplications.length;
  const numControlledAccounts = account.controllingAccounts.accounts.length;
  const hasAssetOrAppInfo =
    hasOptedAssets || hasCreatedAssets || hasOptedApps || hasCreatedApps;
  const hasValidatorData = validatorData.raw.proposals.length || validatorData.raw.suspensions.length;

  const tabsRef = useRef<HTMLDivElement>();

  const scrollToControllerTo = useCallback(
    (e) => {
      navigate(`/account/${address}/controller`);
      if (tabsRef?.current) tabsRef.current.scrollIntoView();
      e.preventDefault();
      return false;
    },
    [tabsRef?.current, address]
  );

  const scrollToValidator = useCallback(
    (e) => {
      navigate(`/account/${address}/validator`);
      if (tabsRef?.current) tabsRef.current.scrollIntoView();
      e.preventDefault();
      return false;
    },
    [tabsRef?.current, address]
  );

  if (hasOptedAssets && matchPath("/account/:address/assets", pathname)) {
    tabValue = "assets";
  } else if (
    hasCreatedAssets &&
    matchPath("/account/:address/created-assets", pathname)
  ) {
    tabValue = "created-assets";
  } else if (
    hasCreatedApps &&
    matchPath("/account/:address/created-applications", pathname)
  ) {
    tabValue = "created-applications";
  } else if (
    hasOptedApps &&
    (matchPath("/account/:address/opted-applications", pathname) ||
      matchPath("/account/:address/opted-applications/:id", pathname))
  ) {
    tabValue = "opted-applications";
  } else if (
    numControlledAccounts &&
    matchPath("/account/:address/controller", pathname)
  ) {
    tabValue = "controlling-accounts";
  } else if (
    hasValidatorData &&
    matchPath("/account/:address/validator", pathname)
  ) {
    tabValue = "validator";
  }

  const [lastSent, isMultiSig, isLogicSig, isClosed] = React.useMemo(() => {
    const lastSent = account.transactionsDetails.transactions.find(
      ({ sender }) => sender === address
    );
    const isMultiSig = !!lastSent?.signature?.multisig;
    const isLogicSig = !!lastSent?.signature?.logicsig;
    const isClosed = account.information.amount === 0 && !!lastSent;
    return [lastSent, isMultiSig, isLogicSig, isClosed];
  }, [
    address,
    account.information.amount,
    account.transactionsDetails?.transactions,
  ]);

  useEffect(() => {
    dispatch(loadAccount(address));
    if (isMainnet) {
      dispatch(loadValidator(address));
    }
  }, [dispatch, address]);

  useTitle(`Account ${address}`);

  return (
    <div className={"account-wrapper"}>
      <div className={"account-container"}>
        {account.error ? (
          <CustomError />
        ) : (
          <div>
            <div className="account-header">
              <div>Account overview</div>
              <div>
                <JsonViewer
                  obj={account.information}
                  filename={`account-${address}.json`}
                  title={`Account ${address.slice(0, 16)}..`}
                ></JsonViewer>
              </div>
            </div>

            {account.loading ? (
              <LoadingTile></LoadingTile>
            ) : (
              <div className="account-body">
                <div className="address">
                  <div className="id">
                    <div className="long-id">{account.information.address}</div>{" "}
                    <Copyable value={account.information.address} />
                  </div>
                  <div
                    style={{
                      marginTop: 10,
                      display: "flex",
                      alignItems: "center",
                      gap: "5px",
                    }}
                  >
                    {addressLabel ? (
                      <div>
                        <AccountLabelChip
                          color="success"
                          variant="filled"
                          label={addressLabel}
                          size="medium"
                        />
                      </div>
                    ) : null}
                    {tinymanPool ? (
                      <div>
                        <Tooltip
                          title={`This account is the Tinyman 2 liquidity pool for ${tinymanPool}`}
                        >
                          <Chip
                            style={{
                              backgroundColor: "#f1fe68",
                              color: "#0e0b1c",
                            }}
                            label={`Tinyman 2 · ${tinymanPool}`}
                            size={"medium"}
                          ></Chip>
                        </Tooltip>
                      </div>
                    ) : null}
                    {account.information.status === "Online" ? (
                      <Tooltip title={`Click to view validator information.`}>
                        <Link
                          href="#"
                          onClick={scrollToValidator}
                          style={{ marginTop: "-2px" }}
                        >
                          <Chip
                            color={"success"}
                            variant={"outlined"}
                            label="Validator"
                            size={"small"}
                            className="hover-cursor-pointer"
                          ></Chip>
                        </Link>
                      </Tooltip>
                    ) : null}
                    {account.information.status === "Not Participating" ? (
                      <Chip
                        color={"warning"}
                        variant={"outlined"}
                        label="Not Participating"
                        size={"small"}
                      ></Chip>
                    ) : null}
                    {account.information["incentive-eligible"] === true ? (
                      <Chip
                        color={"success"}
                        variant={"outlined"}
                        label="Incentives Eligible"
                        size={"small"}
                      ></Chip>
                    ) : null}
                    {account.escrowOf ? (
                      <LinkToApplication
                        className="no-underline"
                        id={account.escrowOf}
                      >
                        <Tooltip
                          title={`This is an application escrow account. Click to view parent application.`}
                        >
                          <Chip
                            className="hover-cursor-pointer"
                            color={"success"}
                            variant="outlined"
                            label={`App Escrow`}
                            size="small"
                            style={{ marginRight: "4px" }}
                          />
                        </Tooltip>
                      </LinkToApplication>
                    ) : null}
                    {isMultiSig ? (
                      <LinkToTransaction
                        id={lastSent?.id}
                        fragment="multisig"
                        label={
                          <Tooltip
                            title={`This is a multi-signature account. Click to view configuration.`}
                          >
                            <Chip
                              color={"success"}
                              className="hover-cursor-pointer"
                              variant={"outlined"}
                              label="MultiSig"
                              size={"small"}
                            ></Chip>
                          </Tooltip>
                        }
                      />
                    ) : null}
                    {isLogicSig ? (
                      <LinkToTransaction
                        id={lastSent?.id}
                        fragment="logicsig"
                        label={
                          <Tooltip
                            title={`This account is controlled by a stateless smart contract (logic sig). Click to view program source.`}
                          >
                            <Chip
                              color={"success"}
                              className="hover-cursor-pointer"
                              variant={"outlined"}
                              label="LogicSig"
                              size={"small"}
                            ></Chip>
                          </Tooltip>
                        }
                      />
                    ) : null}
                    {isClosed ? (
                      <Chip
                        color={"warning"}
                        variant={"outlined"}
                        label="Closed"
                        size={"small"}
                      ></Chip>
                    ) : null}
                  </div>
                </div>

                <div className="props">
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6} md={6} lg={4} xl={4}>
                      <div className="property">
                        <div className="key">Balance</div>
                        <div className="value">
                          <NumberFormat
                            value={microalgosToAlgos(
                              new CoreAccount(account.information).getBalance()
                            )}
                            displayType={"text"}
                            thousandSeparator={true}
                          ></NumberFormat>
                          <AlgoIcon></AlgoIcon>
                          <Copyable
                            value={microalgosToAlgos(
                              new CoreAccount(account.information).getBalance()
                            )}
                          />
                        </div>
                      </div>
                    </Grid>
                    {account.escrowOf ? (
                      <>
                        <Grid item xs={12} sm={6} md={6} lg={4} xl={4}>
                          <div className="property">
                            <div className="key">Application Escrow</div>
                            <div className="value">
                              <LinkToApplication id={account.escrowOf} />
                              <Copyable value={account.escrowOf} />
                            </div>
                          </div>
                        </Grid>
                      </>
                    ) : null}
                    {numControlledAccounts ||
                    account.information["auth-addr"] ? (
                      <>
                        <Grid item xs={12} sm={6} md={6} lg={4} xl={4}>
                          {numControlledAccounts ? (
                            <div className="property">
                              <div className="key">Controller of</div>
                              <div className="value">
                                <Link href="#" onClick={scrollToControllerTo}>
                                  {numControlledAccounts} account
                                  {plural(numControlledAccounts)}
                                </Link>
                              </div>
                            </div>
                          ) : null}
                          {account.information["auth-addr"] ? (
                            <>
                              <div className="property">
                                <div className="key">Rekeyed to</div>
                                <div className="value">
                                  <LinkToAccount
                                    copySize="m"
                                    strip={9}
                                    address={account.information["auth-addr"]}
                                  />
                                </div>
                              </div>
                            </>
                          ) : null}
                        </Grid>
                      </>
                    ) : null}
                  </Grid>

                  {account.information.amount ? (
                    <Grid container spacing={2}>
                      <Grid item xs={12} sm={6} md={6} lg={4} xl={4}>
                        <div className="property">
                          <div className="key">Minimum balance</div>
                          <div className="value">
                            <NumberFormat
                              value={microalgosToAlgos(
                                new CoreAccount(
                                  account.information
                                ).getMinBalance()
                              )}
                              displayType={"text"}
                              thousandSeparator={true}
                            ></NumberFormat>
                            <AlgoIcon></AlgoIcon>
                            <Copyable
                              value={microalgosToAlgos(
                                new CoreAccount(
                                  account.information
                                ).getMinBalance()
                              )}
                            />
                          </div>
                        </div>
                      </Grid>
                    </Grid>
                  ) : null}

                  {hasAssetOrAppInfo ? (
                    <Grid container spacing={2}>
                      <Grid item xs={12} sm={6} md={6} lg={4} xl={4}>
                        {hasOptedApps ? (
                          <div className="property">
                            <div className="key">Holding assets</div>
                            <div className="value padded">
                              {account.optedAssets.length}
                            </div>
                          </div>
                        ) : null}

                        {hasCreatedAssets ? (
                          <div className="property">
                            <div className="key">Created assets</div>
                            <div className="value padded">
                              {account.createdAssets.length}
                            </div>
                          </div>
                        ) : null}

                        {hasCreatedApps ? (
                          <div className="property">
                            <div className="key">Created applications</div>
                            <div className="value padded">
                              {account.createdApplications.length}
                            </div>
                          </div>
                        ) : null}

                        {hasOptedApps ? (
                          <div className="property">
                            <div className="key">Opted applications</div>
                            <div className="value padded">
                              {account.optedApplications.length}
                            </div>
                          </div>
                        ) : null}
                      </Grid>
                    </Grid>
                  ) : null}
                </div>

                <div className="account-tabs" ref={tabsRef}>
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
                        navigate("/account/" + address + "/transactions");
                      }}
                    />
                    {account.optedAssets.length ? (
                      <Tab
                        label="Assets"
                        value="assets"
                        onClick={() => {
                          navigate("/account/" + address + "/assets");
                        }}
                      />
                    ) : null}
                    {account.createdAssets.length ? (
                      <Tab
                        label="Created assets"
                        value="created-assets"
                        onClick={() => {
                          navigate("/account/" + address + "/created-assets");
                        }}
                      />
                    ) : null}
                    {account.createdApplications.length ? (
                      <Tab
                        label="Created applications"
                        value="created-applications"
                        onClick={() => {
                          navigate(
                            "/account/" + address + "/created-applications"
                          );
                        }}
                      />
                    ) : null}
                    {account.optedApplications.length ? (
                      <Tab
                        label="Opted applications"
                        value="opted-applications"
                        onClick={() => {
                          navigate(
                            "/account/" + address + "/opted-applications"
                          );
                        }}
                      />
                    ) : null}
                    {account.controllingAccounts.accounts.length ? (
                      <Tab
                        label="Controlling accounts"
                        value="controlling-accounts"
                        onClick={() => {
                          navigate("/account/" + address + "/controller");
                        }}
                      />
                    ) : null}
                    {hasValidatorData ? (
                      <Tab
                        label="Validator info"
                        value="validator"
                        onClick={() => {
                          navigate("/account/" + address + "/validator");
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

export default Account;
