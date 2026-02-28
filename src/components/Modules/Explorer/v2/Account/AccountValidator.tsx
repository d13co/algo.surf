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
import TabsUnderline from "src/components/v2/shadcn-studio/tabs/tabs-11";
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
} from "lucide-react";
import TablePagination from "src/components/v2/TablePagination";
import MultiDateViewer from "src/components/v2/MultiDateViewer";
import { cx } from "class-variance-authority";

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
  className = "",
}: {
  label: string;
  value: string | number;
  valueSuffix?: React.ReactNode;
  copy?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cx(
        `flex justify-between items-center w-full text-muted-foreground leading-[1.5]`,
        className,
      )}
    >
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
  const {
    data: validatorData,
    isLoading: validatorLoading,
    error: validatorError,
  } = useValidator(address);

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
        "You are about leave algo.surf for a third party site. Press OK to continue.",
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
    [proposals],
  );
  const sortedSuspensions = useMemo(
    () => [...suspensions].sort((a, b) => b.rnd - a.rnd),
    [suspensions],
  );

  const dialogItems = dialog === "blocks" ? sortedProposals : sortedSuspensions;
  const totalPages = Math.ceil(dialogItems.length / PAGE_SIZE);
  const pagedProposals =
    dialog === "blocks"
      ? sortedProposals.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
      : [];
  const pagedSuspensions =
    dialog === "suspensions"
      ? sortedSuspensions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
      : [];

  return (
    <>
      <div className="mt-6 px-1">
        <div className="flex flex-col items-center gap-6">
          {/* Time frame switcher */}
          <div className="w-full max-w-[420px] flex items-center gap-3">
            <span className="text-sm text-primary shrink-0">
              Rounds
            </span>
            <div className="flex-1 min-w-0">
              <TabsUnderline
                value={
                  timeframe === 0
                    ? "lifetime"
                    : timeframeSteps.includes(timeframe)
                      ? String(timeframe)
                      : "custom"
                }
                onValueChange={(v) => {
                  if (v === "custom") return;
                  const next = v === "lifetime" ? 0 : Number(v);
                  setTimeframe(next);
                  refreshLastRound();
                }}
                tabs={[
                  ...timeframeSteps.map((step) => ({
                    name: step.toLocaleString(),
                    value: String(step),
                  })),
                  { name: "Lifetime", value: "lifetime" },
                  {
                    name: "Custom",
                    value: "custom",
                    onClick: () => {
                      const duration = prompt("Enter time frame in blocks");
                      const numBlocks = parseInt(duration, 10);
                      if (Number.isFinite(numBlocks)) {
                        setTimeframe(numBlocks);
                        refreshLastRound();
                      }
                    },
                  },
                ]}
              />
            </div>
          </div>

          {/* Stats */}
          {hasData ? (
            <div className="w-full max-w-[420px] flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Row
                  label="Block Proposals"
                  value={numBlocks.toLocaleString()}
                />
                <Row
                  label="Rewards"
                  value={sumPayouts ? microalgosToAlgosStr(sumPayouts) : "-"}
                  valueSuffix={sumPayouts ? <AlgoIcon /> : null}
                  copy={!!sumPayouts}
                />
                <Row
                  label="Suspensions"
                  value={numSuspensions.toLocaleString()}
                  valueSuffix={
                    numSuspensions ? (
                      <TriangleAlert className="text-yellow-500" size={16} />
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
                  value={timeframe ? timeframe.toLocaleString() : "Lifetime"}
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
          ) : validatorLoading ? (
            <div className="w-full max-w-[420px]">
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

        <div className="flex justify-center mt-8">
          {hasData ? (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="border-primary text-primary hover:bg-primary hover:text-background"
                onClick={showBlocksProposed}
              >
                <CubeIcon size={16} />
                Show Proposed Blocks
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-primary text-primary hover:bg-primary hover:text-background"
                onClick={showSuspensions}
              >
                <HandIcon size={16} />
                Show Suspension Events
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-primary text-primary hover:bg-primary hover:text-background"
                onClick={goExternalCalendar}
              >
                <CalendarIcon size={16} />
                Calendar & Graphs
                <ExternalLink size={14} />
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <Dialog open={!!dialog} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {dialog === "blocks" ? "Proposed Blocks" : "Suspension Events"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex justify-center items-start  mb-1 flex-wrap">
            <Row
              label="Block range"
              className="max-w-xs"
              value={`${timeframe ? lastRound - timeframe : 0} - ${lastRound}`}
              copy={false}
            />
            <Row
              label="Range duration"
              className="max-w-xs"
              value={startTime > 0 ? shortDuration(startTime, lastNow) : "-"}
              copy={false}
            />
          </div>
          <TablePagination
            pageIndex={page}
            pageCount={totalPages}
            canPreviousPage={page > 0}
            canNextPage={page < totalPages - 1}
            onFirst={() => setPage(0)}
            onPrev={() => setPage((p) => p - 1)}
            onNext={() => setPage((p) => p + 1)}
            onLast={() => setPage(totalPages - 1)}
          />

          <Table>
            <TableHeader className="[&_tr]:border-primary">
              <TableRow>
                <TableHead>
                  {dialog === "blocks" ? "Block Proposed" : "Suspension block"}
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
                      <MultiDateViewer timestamp={row.ts} />
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
        </DialogContent>
      </Dialog>
    </>
  );
}

export default AccountValidator;
