import "./AccountValidator.scss";
import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "../../../../../../../redux/store";
import { useNavigate } from "react-router-dom";
import CloseIcon from "@mui/icons-material/Close";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import WarningIcon from "@mui/icons-material/Warning";
import {
  Dialog,
  DialogContent,
  Button,
  ButtonGroup,
  DialogTitle,
} from "@mui/material";
import Copyable from "../../../../../../Common/Copyable/Copyable";
import AlgoIcon from "../../../../AlgoIcon/AlgoIcon";
import { NodeClient } from "../../../../../../../packages/core-sdk/clients/nodeClient";
import explorer from "../../../../../../../utils/dappflow";
import { BlockClient } from "../../../../../../../packages/core-sdk/clients/blockClient";
import { shortDuration } from "../../../../../../../utils/common";
import LoadingTile from "../../../../../../Common/LoadingTile/LoadingTile";
import { loadValidator } from "../../../../../../../redux/explorer/actions/validator";
import {
  CalendarRange as CalendarIcon,
  Box as CubeIcon,
  Hand as HandIcon,
} from "lucide-react";
import { DataGrid, GridValueGetterParams } from "@mui/x-data-grid";
import { dataGridStyles } from "../../../../../../../theme/styles/datagrid";
import LinkToBlock from "../../../../Common/Links/LinkToBlock";
import CustomNoRowsOverlay from "../../../../Common/CustomNoRowsOverlay/CustomNoRowsOverlay";

const timeframeSteps = [30_000, 210_000, 900_000];

function microalgosToAlgos(num: number): string {
  return num
    ? (num / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 })
    : "";
}

function Row({
  label = "",
  value = 0,
  valueSuffix = <></>,
  copy = true,
}: {
  label: string;
  value: string | number;
  valueSuffix?: JSX.Element;
  copy?: boolean;
}) {
  return (
    <div className="row">
      <div className="label">{label}</div>
      <div className="row-value">
        <span style={{ position: "relative", top: "1px" }}>{value}</span>
        {valueSuffix}
        {copy ? <Copyable value={value} size="s" /> : null}
      </div>
    </div>
  );
}

function AccountValidator(): JSX.Element {
  const dispatch = useDispatch();
  const account = useSelector((state: RootState) => state.account);
  const validator = useSelector((state: RootState) => state.validator);
  const navigate = useNavigate();
  const [timeframe, setTimeframe] = useState<number>(0);
  const [lastRound, setLastRound] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [lastNow, setLastNow] = useState(0);
  const [dialog, setDialog] = useState<"blocks" | "suspensions" | undefined>();

  useEffect(() => {
    refreshLastRound();
  }, []);

  useEffect(() => {
    if (
      validator.raw.address &&
      validator.raw.address !== account.information.address
    ) {
      console.warn(
        "Stale validator data, wanted",
        account.information.address,
        "found",
        validator.raw.address
      );
      dispatch(loadValidator(account.information.address));
    }
  }, [account.information.address, validator.raw.address]);

  const {
    numBlocks,
    numPayouts: sumPayouts,
    numSuspensions,
    proposals,
    suspensions,
  } = useMemo(() => {
    let proposals = validator.raw.proposals;
    let suspensions = validator.raw.suspensions;
    if (timeframe) {
      proposals = proposals.filter(({ rnd }) => rnd >= lastRound - timeframe);
      suspensions = suspensions.filter((rnd) => rnd >= lastRound - timeframe);
      setStartTime(0);
      refreshStartTimeframeTime(Math.max(0, lastRound - timeframe));
    } else {
      if (proposals.length) refreshStartTimeframeTime(proposals[0].rnd);
    }
    const numBlocks = proposals.length;
    const numPayouts = proposals.reduce((out, { pp }) => out + (pp ?? 0), 0);
    const numSuspensions = suspensions.length;
    return {
      numBlocks,
      numPayouts,
      numSuspensions,
      proposals,
      suspensions: suspensions.map((r) => ({ rnd: r })),
    };
  }, [validator, timeframe, lastRound]);

  const hasData =
    (numBlocks || sumPayouts || numSuspensions) &&
    !validator.loading &&
    !validator.error;

  async function refreshLastRound() {
    setStartTime(0);
    const nodeClientInstance = new NodeClient(explorer.network);
    const status = await nodeClientInstance.status();
    setLastRound(status["last-round"]);
    setLastNow(Date.now() / 1000);
  }

  async function refreshStartTimeframeTime(rnd: number) {
    // console.log({ start: rnd });
    const blockClientInstance = new BlockClient(explorer.network);
    const block = await blockClientInstance.get(rnd);
    setStartTime(block.timestamp);
  }

  const goExternalCalendar = () => {
    if (
      window.confirm(
        "You are about leave algo.surf for a third party site. Press OK to continue."
      )
    ) {
      window.location.href = `https://algonoderewards.com/${validator.raw.address}`;
    }
  };

  const showBlocksProposed = () => setDialog("blocks");
  const showSuspensions = () => setDialog("suspensions");
  const closeDialog = () => setDialog(undefined);
  const colDefs = useMemo(() => {
    return dialog === "blocks"
      ? [
          {
            field: "rnd",
            headerName: "Block Proposed",
            flex: 1,
            renderCell: (params: GridValueGetterParams) => {
              return <LinkToBlock id={params.row.rnd} />;
            },
          },
          {
            field: "pp",
            headerName: "Rewards",
            flex: 1,
            renderCell: (params: GridValueGetterParams) => {
              const val = params.row.pp;
              return val ? (
                <>
                  {microalgosToAlgos(val)}&nbsp;
                  <AlgoIcon />
                </>
              ) : (
                <>-</>
              );
            },
          },
        ]
      : [
          {
            field: "rnd",
            headerName: "Suspension block",
            flex: 1,
            renderCell: (params: GridValueGetterParams) => {
              return <LinkToBlock id={params.row.rnd} />;
            },
            // renderCell: (params: GridValueGetterParams) => {
            //   return (
            //     <LinkToAccount
            //       copy="left"
            //       copySize="s"
            //       address={params.row.address}
            //       strip={30}
            //     ></LinkToAccount>
            //   );
            // },
          },
        ];
  }, [proposals, suspensions, dialog]);

  return (
    <>
      <div className={"account-validator-wrapper"}>
        <Dialog
          onClose={closeDialog}
          fullWidth={true}
          maxWidth={"md"}
          open={!!dialog}
        >
          <DialogTitle>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontWeight: "bold", fontSize: 18 }}>
                  {dialog === "blocks" ? (
                    <>Proposed Blocks</>
                  ) : dialog === "suspensions" ? (
                    <>Suspension Events</>
                  ) : null}
                </div>
              </div>
              <div>
                <CloseIcon
                  className="modal-close-button"
                  onClick={closeDialog}
                />
              </div>
            </div>
          </DialogTitle>
          <DialogContent>
            <div className="dialogflexgroup">
              <Row
                label="Block range"
                value={`${timeframe ? lastRound - timeframe : 0} - ${lastRound}`}
                copy={false}
              />
              <Row
                label="Range duration"
                value={startTime > 0 ? shortDuration(startTime, lastNow) : "-"}
                copy={false}
              />
            </div>
            <DataGrid
              rows={dialog === "blocks" ? proposals : suspensions}
              columns={colDefs}
              autoHeight
              pageSize={16}
              getRowId={(row) => {
                return row.rnd;
              }}
              initialState={{
                sorting: {
                  sortModel: [{ field: "rnd", sort: "desc" }],
                },
              }}
              density="compact"
              disableSelectionOnClick
              sx={dataGridStyles}
              components={{
                NoRowsOverlay: CustomNoRowsOverlay(
                  dialog === "blocks" ? "proposed blocks" : "suspensions"
                ),
              }}
            />
          </DialogContent>
        </Dialog>
        <div className={"account-validator-container"}>
          <div className="account-validator-body">
            <div className="timeline-selector">
              <div className="label">Time frame</div>
              <ButtonGroup
                className="buttongroup"
                variant="outlined"
                size={"small"}
                style={{ marginLeft: "0.5rem" }}
              >
                {timeframeSteps.map((step) => (
                  <Button
                    key={`tf-${step}`}
                    variant={timeframe === step ? "contained" : "outlined"}
                    onClick={() => {
                      setTimeframe(step);
                      refreshLastRound();
                    }}
                  >
                    {step.toLocaleString()}
                  </Button>
                ))}
                <Button
                  key={`tf-life`}
                  variant={timeframe === 0 ? "contained" : "outlined"}
                  onClick={() => {
                    setTimeframe(0);
                    refreshLastRound();
                  }}
                >
                  Lifetime
                </Button>

                <Button
                  key={`tf-custom`}
                  variant={
                    timeframe !== 0 && !timeframeSteps.includes(timeframe)
                      ? "contained"
                      : "outlined"
                  }
                  onClick={() => {
                    const duration = prompt("Enter time frame in blocks");
                    const numBlocks = parseInt(duration, 10);
                    if (Number.isFinite(numBlocks)) {
                      setTimeframe(numBlocks);
                      refreshLastRound();
                    }
                  }}
                >
                  Custom
                </Button>
              </ButtonGroup>
            </div>
            <>
              {hasData ? (
                <div className="body">
                  <div className="group">
                    <Row
                      label="Block Proposals"
                      value={numBlocks.toLocaleString()}
                    />
                    <Row
                      label="Rewards"
                      value={sumPayouts ? microalgosToAlgos(sumPayouts) : "-"}
                      valueSuffix={sumPayouts ? <AlgoIcon /> : <></>}
                      copy={!!sumPayouts}
                    />
                    <Row
                      label="Suspensions"
                      value={numSuspensions.toLocaleString()}
                      valueSuffix={
                        numSuspensions ? (
                          <WarningIcon
                            color="warning"
                            style={{ fontSize: "20px" }}
                          />
                        ) : null
                      }
                      copy={false}
                    />
                  </div>
                  <div className="group">
                    <Row
                      label="Avg blocks / day"
                      value={
                        startTime > 0
                          ? (
                              (numBlocks * 86400) /
                              (lastNow - startTime)
                            ).toLocaleString(undefined, {
                              maximumFractionDigits: 2,
                            })
                          : "-"
                      }
                      copy={false}
                    />
                    <Row
                      label="Time frame (in blocks)"
                      value={
                        timeframe ? timeframe.toLocaleString() : "Lifetime"
                      }
                      copy={false}
                    />
                    <Row
                      label="Time frame (duration)"
                      value={
                        startTime > 0 ? shortDuration(startTime, lastNow) : "-"
                      }
                      copy={false}
                    />
                  </div>
                </div>
              ) : null}
            </>
          </div>
          <div className="account-validator-footer">
            {hasData ? (
              <div className="row buttons">
                <div className="label">
                  <Button onClick={showBlocksProposed} startIcon={<CubeIcon />}>
                    Show Proposed Blocks
                  </Button>
                </div>
                <div className="label">
                  <Button onClick={showSuspensions} startIcon={<HandIcon />}>
                    Show Suspension Events
                  </Button>
                </div>
                <div className="label">
                  <Button
                    startIcon={<CalendarIcon />}
                    onClick={goExternalCalendar}
                    endIcon={<OpenInNewIcon />}
                  >
                    Calendar & Graphs
                  </Button>
                </div>
              </div>
            ) : validator.loading ? (
              <div className="loading">
                <LoadingTile
                  style={{ marginTop: "0" }}
                  lineStyle={{ height: "10px", margin: "5px 0" }}
                />
              </div>
            ) : validator.error ? (
              <div className="row grow">Error: {validator.error}</div>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}

export default AccountValidator;
