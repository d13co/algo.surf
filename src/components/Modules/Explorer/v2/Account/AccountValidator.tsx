import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  useValidator,
  useValidatorStats,
  validatorStatsSupported,
} from "src/hooks/useValidator";
import { useAccount } from "src/hooks/useAccount";
import { useLiveBlocks } from "src/hooks/useLiveBlocks";
import { useAverageRoundTime } from "@d13co/algo-metrics-react";
import { BLOCK_TIME } from "src/packages/core-sdk/constants";
import { partkeyIntegrityHash } from "src/utils/partkeyIntegrityHash";
import { bytesToBase64 } from "algosdk";
import Copyable from "src/components/v2/Copyable";
import AlgoIcon from "../../AlgoIcon/AlgoIcon";
import { NodeClient } from "src/packages/core-sdk/clients/nodeClient";
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
  value: React.ReactNode;
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
      <div className="flex items-center gap-1 text-foreground text-right">
        <span>{value}</span>
        {valueSuffix}
        {copy ? <Copyable value={value as string | number} size="s" /> : null}
      </div>
    </div>
  );
}

function KeyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 w-full text-muted-foreground leading-[1.5]">
      <div>{label}</div>
      <div className="flex items-center gap-1 text-foreground text-[13px] break-all">
        <span>{value}</span>
        <Copyable value={value} size="s" />
      </div>
    </div>
  );
}

function ValidatorInfo({ address }: { address: string }): JSX.Element {
  const { data: account, isLoading } = useAccount(address);
  const { blocks } = useLiveBlocks();
  const avgRoundTime = useAverageRoundTime() ?? BLOCK_TIME;
  const latest = blocks[0]?.header;
  const part = account?.participation;

  if (isLoading) {
    return (
      <div className="w-full">
        <LoadingTile
          style={{ marginTop: "0" }}
          lineStyle={{ height: "10px", margin: "5px 0" }}
        />
      </div>
    );
  }
  if (!part || account?.status !== "Online") {
    return <div className="text-muted-foreground">Account is offline</div>;
  }

  const lastValid = Number(part.voteLastValid);
  const round = latest ? Number(latest.round) : 0;
  const roundsLeft = lastValid - round;
  const expiresAt = latest
    ? Number(latest.timestamp) + roundsLeft * avgRoundTime
    : 0;
  const integrityHash = latest?.genesisHash
    ? partkeyIntegrityHash({
        genesisHash: latest.genesisHash,
        address,
        selectionKey: part.selectionParticipationKey,
        voteKey: part.voteParticipationKey,
        stateProofKey: part.stateProofKey,
        voteFirstValid: part.voteFirstValid,
        voteLastValid: part.voteLastValid,
        voteKeyDilution: part.voteKeyDilution,
      })
    : "";

  return (
    <div className="w-full flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Row
          label="Integrity hash (ARC-81)"
          value={integrityHash || "-"}
          copy={!!integrityHash}
        />
        <Row
          label="Vote first valid"
          value={Number(part.voteFirstValid).toLocaleString()}
          copy={false}
        />
        <Row
          label="Vote last valid"
          value={lastValid.toLocaleString()}
          copy={false}
        />
        <Row
          label="Key dilution"
          value={Number(part.voteKeyDilution).toLocaleString()}
          copy={false}
        />
        <Row
          label="Estimated expiration"
          value={
            !latest ? (
              "-"
            ) : roundsLeft <= 0 ? (
              "Expired"
            ) : (
              <MultiDateViewer timestamp={Math.floor(expiresAt)} switcherSide="right" noCopy />
            )
          }
          copy={false}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <KeyRow label="Vote key" value={bytesToBase64(part.voteParticipationKey)} />
        <KeyRow
          label="Selection key"
          value={bytesToBase64(part.selectionParticipationKey)}
        />
        {part.stateProofKey ? (
          <KeyRow label="State proof key" value={bytesToBase64(part.stateProofKey)} />
        ) : null}
      </div>
    </div>
  );
}

function AccountValidator(): JSX.Element {
  const { address } = useParams();
  const [timeframe, setTimeframe] = useState<number>(0);
  const [lastRound, setLastRound] = useState(0);
  const [dialog, setDialog] = useState<"blocks" | "suspensions" | undefined>();
  const [page, setPage] = useState(0);

  const minRound = timeframe && lastRound ? Math.max(0, lastRound - timeframe) : 0;
  const {
    data: stats,
    isLoading: statsLoading,
    error: statsError,
  } = useValidatorStats(address, minRound);
  const {
    data: validatorData,
    isLoading: validatorLoading,
    error: validatorError,
  } = useValidator(address, !!dialog);

  const { proposals, suspensions } = useMemo(() => {
    let proposals = validatorData?.proposals ?? [];
    let suspensions = validatorData?.suspensions ?? [];
    if (minRound) {
      proposals = proposals.filter(({ rnd }) => rnd >= minRound);
      suspensions = suspensions.filter((rnd) => rnd >= minRound);
    }
    return { proposals, suspensions: suspensions.map((r) => ({ rnd: r })) };
  }, [validatorData, minRound]);

  const hasData = !!stats && !statsLoading && !statsError;
  const range = stats?.range;
  const rangeDuration = range ? shortDuration(range.firstTs, range.lastTs) : "-";

  async function refreshLastRound() {
    const status = await new NodeClient(explorer.network).status();
    setLastRound(status["last-round"]);
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
      <div className="mt-6 px-1 flex flex-col lg:flex-row lg:justify-center gap-8 lg:gap-12">
        {/* Participation info */}
        <div className="w-full lg:max-w-[480px] flex flex-col gap-6">
          <div className="flex items-end border-b border-primary pb-2 text-sm text-primary h-9">
            Participation
          </div>
          <ValidatorInfo address={address!} />
        </div>

        {/* Stats */}
        <div className="w-full lg:max-w-[480px] flex flex-col gap-6">
          <div className="flex items-stretch gap-3 h-9 border-b border-primary">
            <div className="flex items-end shrink-0 pb-2 text-sm text-primary">
              Rounds
            </div>
            <div className="flex-1 min-w-0 overflow-hidden">
              <TabsUnderline
                listClassName="flex-nowrap md:justify-end h-9 border-b-0"
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

          {!validatorStatsSupported ? (
            <div className="text-muted-foreground">Network not supported</div>
          ) : hasData ? (
            <>
              <div className="w-full flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Row
                    label="Block Proposals"
                    value={stats.blocks.toLocaleString()}
                  />
                  <Row
                    label="Rewards"
                    value={stats.payouts ? microalgosToAlgosStr(stats.payouts) : "-"}
                    valueSuffix={stats.payouts ? <AlgoIcon /> : null}
                    copy={!!stats.payouts}
                  />
                  <Row
                    label="Suspensions"
                    value={stats.suspensions.toLocaleString()}
                    valueSuffix={
                      stats.suspensions ? (
                        <TriangleAlert className="text-yellow-500" size={16} />
                      ) : null
                    }
                    copy={false}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Row
                    label="Avg blocks / day"
                    value={stats.avgBlocksPerDay.toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}
                    copy={false}
                  />
                  <Row
                    label="Time frame (in blocks)"
                    value={timeframe ? timeframe.toLocaleString() : "Lifetime"}
                    copy={false}
                  />
                  <Row
                    label="Time frame (duration)"
                    value={rangeDuration}
                    copy={false}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-primary text-primary hover:bg-primary hover:text-background"
                  onClick={showBlocksProposed}
                  disabled={!stats.blocks}
                >
                  <CubeIcon size={16} />
                  Show Proposed Blocks
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-primary text-primary hover:bg-primary hover:text-background"
                  onClick={showSuspensions}
                  disabled={!stats.suspensions}
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
            </>
          ) : statsLoading ? (
            <div className="w-full">
              <LoadingTile
                style={{ marginTop: "0" }}
                lineStyle={{ height: "10px", margin: "5px 0" }}
              />
            </div>
          ) : statsError ? (
            <div className="text-muted-foreground">
              Error: {(statsError as Error).message}
            </div>
          ) : (
            <div className="text-muted-foreground">No stats available</div>
          )}
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
              value={range ? `${range.firstRound} - ${range.lastRound}` : "-"}
              copy={false}
            />
            <Row
              label="Range duration"
              className="max-w-xs"
              value={rangeDuration}
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
              {validatorLoading || validatorError ? (
                <TableRow>
                  <TableCell
                    colSpan={dialog === "blocks" ? 3 : 1}
                    className="text-center text-muted-foreground py-8"
                  >
                    {validatorError
                      ? `Error: ${(validatorError as Error).message}`
                      : "Loading…"}
                  </TableCell>
                </TableRow>
              ) : dialogItems.length === 0 ? (
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
