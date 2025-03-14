import "./AccountValidator.scss";
import React, { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "../../../../../../../redux/store";
import ApplicationsList from "../../../../Lists/ApplicationsList/ApplicationsList";
import { useNavigate, useParams } from "react-router-dom";
import CloseIcon from "@mui/icons-material/Close";
import WarningIcon from "@mui/icons-material/Warning";
import {
  Dialog,
  DialogContent,
  DialogActions,
  Button,
  ButtonGroup,
} from "@mui/material";
import LinkToAccount from "../../../../Common/Links/LinkToAccount";
import LinkToApplication from "../../../../Common/Links/LinkToApplication";
import ApplicationLocalState from "../../../Application/Sections/ApplicationLocalState/ApplicationLocalState";
import Copyable from "../../../../../../Common/Copyable/Copyable";
import AlgoIcon from "../../../../AlgoIcon/AlgoIcon";
import { NodeClient } from "../../../../../../../packages/core-sdk/clients/nodeClient";
import explorer from "../../../../../../../utils/dappflow";
import { BlockClient } from "../../../../../../../packages/core-sdk/clients/blockClient";
import { shortDuration } from "../../../../../../../utils/common";
import LoadingTile from "../../../../../../Common/LoadingTile/LoadingTile";
import { loadValidator } from "../../../../../../../redux/explorer/actions/validator";

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

  useEffect(() => {
    refreshLastRound();
  }, []);

  useEffect(() => {
    if (validator.raw.address && validator.raw.address !== account.information.address) {
      console.warn("Stale validator data, wanted", account.information.address, "found", validator.raw.address);
      dispatch(loadValidator(account.information.address));
    }
  }, [account.information.address, validator.raw.address]);

  const { numBlocks, numPayouts, numSuspensions } = useMemo(() => {
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
    return { numBlocks, numPayouts, numSuspensions };
  }, [validator, timeframe, lastRound]);

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

  return (
    <div className={"account-validator-wrapper"}>
      <div className={"account-validator-container"}>
        <div className="account-validator-body">
          <div className="timeline-selector">
            <div className="label">Timeframe (blocks)</div>
            <ButtonGroup
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
                  const duration = prompt("Enter timeframe in blocks");
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
          {validator.loading ? (
            <LoadingTile count={2} />
          ) : (
            <>
              <Row label="Block Proposals" value={numBlocks.toLocaleString()} />
              <Row
                label="Rewards"
                value={numPayouts ? microalgosToAlgos(numPayouts) : "-"}
                valueSuffix={numPayouts ? <AlgoIcon /> : <></>}
                copy={!!numPayouts}
              />
              <Row
                label="Suspensions"
                value={numSuspensions.toLocaleString()}
                valueSuffix={numSuspensions ? <WarningIcon color="warning" style={{fontSize: "20px"}} /> : null }
                copy={false}
              />
              <Row
                label="Timeframe (in blocks)"
                value={timeframe ? timeframe.toLocaleString() : "Lifetime"}
                copy={false}
              />
              <Row
                label="Timeframe (duration)"
                value={startTime > 0 ? shortDuration(startTime, lastNow) : "-"}
                copy={false}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default AccountValidator;
