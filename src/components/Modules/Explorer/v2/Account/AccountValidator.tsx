import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useValidator } from "src/hooks/useValidator";
import Copyable from "src/components/v2/Copyable";
import AlgoIcon from "../../AlgoIcon/AlgoIcon";
import { NodeClient } from "src/packages/core-sdk/clients/nodeClient";
import { BlockClient } from "src/packages/core-sdk/clients/blockClient";
import explorer from "src/utils/dappflow";
import { shortDuration } from "src/utils/common";
import LoadingTile from "src/components/v2/LoadingTile";
import LinkToBlock from "../Links/LinkToBlock";
import { Button } from "src/components/v2/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "src/components/v2/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "src/components/v2/ui/table";
import {
  CalendarRange as CalendarIcon,
  Box as CubeIcon,
  Hand as HandIcon,
  ExternalLink,
  TriangleAlert,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const timeframeSteps = [30_000, 210_000, 900_000];
const PAGE_SIZE = 16;

function microalgosToAlgosStr(num: number): string {
  return num
    ? (num / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 })
    : "";
}

function Row({
  label = "",
  value,
  valueSuffix = null,
  copy = true,
}: {
  label: string;
  value: string | number;
  valueSuffix?: React.ReactNode;
  copy?: boolean;
}) {
  return (
    <div className="flex justify-between items-center min-w-[min(90%,375px)] max-w-[450px] text-muted-foreground">
      <div>{label}</div>
      <div className="flex items-center gap-1 text-foreground">
        <span>{value}</span>
        {valueSuffix}
        {copy ? <Copyable value={value} size="s" /> : null}
      </div>
    </div>
  );
}

function AccountValidator(): JSX.Element {
  const { address } = useParams();
  const { data: validatorData, isLoading: validatorLoading, error: validatorError } = useValidator(address);

  const [timeframe, setTimeframe] = useState<number>(0);
  const [lastRound, setLastRound] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [lastNow, setLastNow] = useState(0);
  const [dialog, setDialog] = useState<"blocks" | "suspensions" | undefined>();
  const [page, setPage] = useState(0);

  useEffect(() => {
    refreshLastRound();
  }, []);

  const {
    numBlocks,
    numPayouts: sumPayouts,
    numSuspensions,
    proposals,
    suspensions,
  } = useMemo(() => {
    if (!validatorData) {
      return {
        numBlocks: 0,
        numPayouts: 0,
        numSuspensions: 0,
        proposals: [],
        suspensions: [],
      };
    }

    let proposals = validatorData.proposals;
    let suspensions = validatorData.suspensions;

    if (timeframe && lastRound) {
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
  }, [validatorData, timeframe, lastRound]);

  const hasData =
    (numBlocks || sumPayouts || numSuspensions) &&
    !validatorLoading &&
    !validatorError;

  async function refreshLastRound() {
    setStartTime(0);
    const nodeClientInstance = new NodeClient(explorer.network);
    const status = await nodeClientInstance.status();
    setLastRound(status["last-round"]);
    setLastNow(Date.now() / 1000);
  }

  async function refreshStartTimeframeTime(rnd: number) {
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
      window.location.href = `https://algonoderewards.com/${address}`;
    }
  };

  const showBlocksProposed = () => {
    setPage(0);
    setDialog("blocks");
  };
  const showSuspensions = () => {
    setPage(0);
    setDialog("suspensions");
  };
  const closeDialog = () => setDialog(undefined);

  const sortedProposals = useMemo(
    () => [...proposals].sort((a, b) => b.rnd - a.rnd),
    [proposals]
  );
  const sortedSuspensions = useMemo(
    () => [...suspensions].sort((a, b) => b.rnd - a.rnd),
    [suspensions]
  );

  const dialogItems = dialog === "blocks" ? sortedProposals : sortedSuspensions;
  const totalPages = Math.ceil(dialogItems.length / PAGE_SIZE);
  const pagedProposals = dialog === "blocks"
    ? sortedProposals.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
    : [];
  const pagedSuspensions = dialog === "suspensions"
    ? sortedSuspensions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
    : [];

  return (
    <>
      <div className="mt-6 px-1">
        <div className="flex flex-col-reverse md:flex-row">
          <div className="flex-grow mt-4 flex flex-col gap-4">
            {hasData ? (
              <>
                <div className="flex flex-col gap-1.5">
                  <Row
                    label="Block Proposals"
                    value={numBlocks.toLocaleString()}
                  />
                  <Row
                    label="Rewards"
                    value={
                      sumPayouts ? microalgosToAlgosStr(sumPayouts) : "-"
                    }
                    valueSuffix={sumPayouts ? <AlgoIcon /> : null}
                    copy={!!sumPayouts}
                  />
                  <Row
                    label="Suspensions"
                    value={numSuspensions.toLocaleString()}
                    valueSuffix={
                      numSuspensions ? (
                        <TriangleAlert
                          className="text-yellow-500"
                          size={16}
                        />
                      ) : null
                    }
                    copy={false}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
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
                      startTime > 0
                        ? shortDuration(startTime, lastNow)
                        : "-"
                    }
                    copy={false}
                  />
                </div>
              </>
            ) : null}
          </div>

          <div className="flex items-start gap-2 flex-wrap text-sm text-muted-foreground">
            <span className="mt-1.5">Time frame</span>
            <div className="flex flex-wrap gap-0">
              {timeframeSteps.map((step) => (
                <Button
                  key={`tf-${step}`}
                  variant={timeframe === step ? "default" : "outline"}
                  size="sm"
                  className="rounded-none first:rounded-l-md last:rounded-r-md border-r-0 last:border-r"
                  onClick={() => {
                    setTimeframe(step);
                    refreshLastRound();
                  }}
                >
                  {step.toLocaleString()}
                </Button>
              ))}
              <Button
                variant={timeframe === 0 ? "default" : "outline"}
                size="sm"
                className="rounded-none border-r-0"
                onClick={() => {
                  setTimeframe(0);
                  refreshLastRound();
                }}
              >
                Lifetime
              </Button>
              <Button
                variant={
                  timeframe !== 0 && !timeframeSteps.includes(timeframe)
                    ? "default"
                    : "outline"
                }
                size="sm"
                className="rounded-none rounded-r-md"
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
            </div>
          </div>
        </div>

        <div className="flex justify-center mt-6">
          {hasData ? (
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="ghost"
                size="sm"
                onClick={showBlocksProposed}
              >
                <CubeIcon size={16} />
                Show Proposed Blocks
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={showSuspensions}
              >
                <HandIcon size={16} />
                Show Suspension Events
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={goExternalCalendar}
              >
                <CalendarIcon size={16} />
                Calendar & Graphs
                <ExternalLink size={14} />
              </Button>
            </div>
          ) : validatorLoading ? (
            <div className="w-full">
              <LoadingTile
                style={{ marginTop: "0" }}
                lineStyle={{ height: "10px", margin: "5px 0" }}
              />
            </div>
          ) : validatorError ? (
            <div className="text-muted-foreground">
              Error: {(validatorError as Error).message}
            </div>
          ) : null}
        </div>
      </div>

      <Dialog open={!!dialog} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {dialog === "blocks"
                ? "Proposed Blocks"
                : "Suspension Events"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex justify-between items-start gap-4 mb-4 flex-wrap">
            <Row
              label="Block range"
              value={`${timeframe ? lastRound - timeframe : 0} - ${lastRound}`}
              copy={false}
            />
            <Row
              label="Range duration"
              value={
                startTime > 0
                  ? shortDuration(startTime, lastNow)
                  : "-"
              }
              copy={false}
            />
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  {dialog === "blocks"
                    ? "Block Proposed"
                    : "Suspension block"}
                </TableHead>
                {dialog === "blocks" ? (
                  <>
                    <TableHead>Date & time</TableHead>
                    <TableHead>Rewards</TableHead>
                  </>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {dialogItems.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={dialog === "blocks" ? 3 : 1}
                    className="text-center text-muted-foreground py-8"
                  >
                    No {dialog === "blocks" ? "proposed blocks" : "suspensions"}
                  </TableCell>
                </TableRow>
              ) : dialog === "blocks" ? (
                pagedProposals.map((row) => (
                  <TableRow key={row.rnd}>
                    <TableCell>
                      <LinkToBlock id={row.rnd} />
                    </TableCell>
                    <TableCell>
                      {row.pp
                        ? new Date(row.rnd).toLocaleString()
                        : "-"}
                    </TableCell>
                    <TableCell>
                      {row.pp ? (
                        <span className="inline-flex items-center gap-1">
                          {microalgosToAlgosStr(row.pp)}
                          <AlgoIcon />
                        </span>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                pagedSuspensions.map((row) => (
                  <TableRow key={row.rnd}>
                    <TableCell>
                      <LinkToBlock id={row.rnd} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {totalPages > 1 ? (
            <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
              <span>
                Page {page + 1} of {totalPages}
              </span>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft size={16} />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight size={16} />
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default AccountValidator;
