import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import dateFormat from "dateformat";
import { ChevronDown, Loader2 } from "lucide-react";
import useTitle from "src/components/Common/UseTitle/UseTitle";
import ConsensusVersion from "src/components/v2/ConsensusVersion";
import VoteBar from "src/components/v2/VoteBar";
import { Chip } from "src/components/v2/Chips";
import { cn } from "src/lib/utils";
import { surfIdxSupported } from "src/utils/surfIdx";
import { surfIdxOffMessage, useSurfIdxCaps } from "src/hooks/useSurfIdxCaps";
import { useConsensusVersionLookup } from "src/hooks/useConsensusVersions";
import { ConsensusVersionInfo } from "src/packages/core-sdk/consensusVersions";
import { ConsensusUpgrade, useConsensusUpgrade } from "src/hooks/useConsensusUpgrade";
import {
  SurfUpgrade,
  UpgradeGroup,
  UpgradeGroupStatus,
  closedNoVotes,
  upgradeAnchor,
  useUpgradeGroups,
} from "src/hooks/useUpgrades";
import LinkToBlock from "../Links/LinkToBlock";
import UpgradeEta from "../../LiveUpgrade/UpgradeEta";
import VoteProgress from "../../LiveUpgrade/VoteProgress";
import { VoteStatus, roundsLeft, voteStatus } from "../../LiveUpgrade/voteStatus";

const STATUS_LABEL: Record<UpgradeGroupStatus, string> = {
  applied: "Applied",
  approved: "Approved",
  voting: "Voting",
  rejected: "Rejected",
  superseded: "Superseded",
};

const MUTED_CHIP = "border-border text-muted-foreground";

function StatusChip({ status }: { status: UpgradeGroupStatus }): JSX.Element {
  return (
    <Chip
      variant={status === "applied" || status === "approved" ? "success" : "default"}
      className={status === "rejected" || status === "superseded" ? MUTED_CHIP : undefined}
    >
      {STATUS_LABEL[status]}
    </Chip>
  );
}

function day(ts: number): string {
  return ts ? dateFormat(new Date(ts * 1000), "d mmm yyyy") : "";
}

/** "9,198 / 10,000 · 9,000 needed", or the bare count when the vote rules are unknown. */
/** `short` leaves out the threshold, for attempt rows under a card that already says it. */
function Tally({ u, from, short }: { u: SurfUpgrade; from: ConsensusVersionInfo; short?: boolean }): JSX.Element {
  if (u.approvals == null) return <span className="text-muted-foreground">counting</span>;
  return (
    <span>
      <span className="text-foreground">{u.approvals.toLocaleString()}</span>
      <span className="text-muted-foreground">
        {from.voteRounds ? ` / ${from.voteRounds.toLocaleString()}` : " approvals"}
        {from.threshold && !short ? ` · ${from.threshold.toLocaleString()} needed` : ""}
      </span>
      {/* Read from a block header, which only refreshes on pages following the chain. */}
      {u.asOf && u.status === "voting" ? (
        <span className="block whitespace-nowrap text-muted-foreground">at round {u.asOf.toLocaleString()}</span>
      ) : null}
    </span>
  );
}

function Attempt({
  u,
  n,
  from,
  liveNoVotes,
}: {
  u: SurfUpgrade;
  n: number;
  from: ConsensusVersionInfo;
  /** No votes so far, for the attempt being voted on. */
  liveNoVotes?: number | null;
}): JSX.Element {
  return (
    <div className="grid grid-cols-12 gap-x-4 gap-y-1 py-2 border-b border-border last:border-0 text-[13px] items-center">
      <div className="col-span-8 sm:col-span-3">
        {/* Fixed width, so rounds and dates line up past #9. */}
        <span className="inline-block w-8 tabular-nums text-muted-foreground">#{n}</span>
        <LinkToBlock id={u.round} />
        {u.ts ? <span className="text-muted-foreground ml-2 whitespace-nowrap">{day(u.ts)}</span> : null}
      </div>
      <div className="col-span-4 sm:col-span-2 text-right sm:text-left">
        <span className={u.status === "rejected" ? "text-muted-foreground" : "text-primary"}>
          {STATUS_LABEL[u.status]}
        </span>
      </div>
      <div className="col-span-12 sm:col-span-4">
        <VoteBar
          approvals={u.approvals ?? 0}
          noVotes={closedNoVotes(u, from.voteRounds) ?? liveNoVotes ?? null}
          voteRounds={from.voteRounds}
          threshold={from.threshold}
        />
      </div>
      <div className="col-span-12 sm:col-span-3 sm:text-right">
        <Tally u={u} from={from} short />
      </div>
    </div>
  );
}

/** Rounds and estimated time to the round the live upgrade's phase ends on. */
function Countdown({ live }: { live: ConsensusUpgrade }): JSX.Element {
  // To the round shown above it, as the ETA counts: roundsRemaining stops a round short while voting,
  // the close round casting no vote.
  const end = live.phase === "voting" ? live.nextProtocolVoteBefore : live.nextProtocolSwitchOn;
  return (
    <span className="block text-muted-foreground">
      {roundsLeft(Math.max(0, end - live.round))} · <UpgradeEta targetEpoch={live.targetEpoch} />
    </span>
  );
}

/**
 * Where the group's final attempt stands: when it switched, will switch, or stops voting. With the
 * live upgrade, also how long until then.
 */
function Outcome({ g, live }: { g: UpgradeGroup; live: ConsensusUpgrade | null }): JSX.Element | null {
  const u = g.final;
  switch (u.status) {
    case "applied":
      return (
        <span>
          Switched on at round <LinkToBlock id={u.switchOn} />
          {u.switchTs ? <span className="text-muted-foreground"> · <span className="whitespace-nowrap">{day(u.switchTs)}</span></span> : null}
        </span>
      );
    case "approved":
      // The switch round is still ahead, so not a link: the block page would 404.
      return (
        <span>
          Switches on at round {u.switchOn.toLocaleString()}
          {live?.phase === "waiting" ? <Countdown live={live} /> : null}
        </span>
      );
    case "voting":
      return (
        <span>
          Voting closes at round {u.voteBefore.toLocaleString()}
          {live?.phase === "voting" ? <Countdown live={live} /> : null}
        </span>
      );
    default:
      return u.ts ? <span className="text-muted-foreground">Last proposed {day(u.ts)}</span> : null;
  }
}

function GroupCard({
  g,
  linked,
  upgrade,
}: {
  g: UpgradeGroup;
  linked: boolean;
  /** The upgrade in flight on the chain, if any. */
  upgrade: ConsensusUpgrade | null;
}): JSX.Element {
  const { anchor } = g;
  const lookup = useConsensusVersionLookup();
  const proto = lookup(g.proto);
  const from = lookup(g.from);
  // The live header, when it's this group's final attempt. The vote runs under the rules of the
  // protocol it was proposed on.
  const live = upgrade?.nextProtocolVoteBefore === g.final.voteBefore ? upgrade : null;
  const vote: VoteStatus | null = live?.phase === "voting" ? voteStatus(live, from.voteRounds, from.threshold) : null;
  // An open vote is what visitors come for; a deep link opens its target.
  const [open, setOpen] = useState(g.status === "voting" || g.status === "approved" || linked);
  // Also when linked to from this same page, which changes the hash without remounting.
  useEffect(() => {
    if (linked) setOpen(true);
  }, [linked]);
  const avmChanged = from.avm != null && proto.avm != null && from.avm !== proto.avm;
  const n = g.attempts.length;

  return (
    <div id={anchor} className="mt-4 rounded-lg p-5 bg-background-card scroll-mt-4 leading-5">
      {/* The chip stays top right at every width. The outcome sits under it from sm up, and on a
          phone, where it would crowd the name, under the "from" line instead. */}
      <div className="flex justify-between items-start gap-x-4">
        <div className="min-w-0">
          <ConsensusVersion info={proto} showLink showAvm={false} size="lg" descriptionShown />
          <div className="text-muted-foreground text-[13px] mt-1">
            from {from.name}
            {avmChanged ? ` · AVM ${from.avm} → ${proto.avm}` : proto.avm != null ? ` · AVM ${proto.avm}` : ""}
          </div>
          <div className="sm:hidden mt-1 text-[13px]">
            <Outcome g={g} live={live} />
          </div>
        </div>
        <div className="flex flex-col items-end text-right gap-1 text-[13px] shrink-0 sm:shrink">
          <StatusChip status={g.status} />
          <div className="hidden sm:block">
            <Outcome g={g} live={live} />
          </div>
        </div>
      </div>

      {proto.description ? <p className="mt-3 text-[13px] text-muted-foreground">{proto.description}</p> : null}

      {live && vote ? (
        <div className="mt-4">
          <div className="text-[13px] text-muted-foreground mb-1">Vote so far{n > 1 ? `, attempt ${n}` : ""}</div>
          <VoteProgress vote={vote} roundsRemaining={live.roundsRemaining} explain showRoundsLeft={false} />
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-12 gap-x-4 gap-y-2 items-center text-[13px]">
          <div className="col-span-12 sm:col-span-5 text-muted-foreground">
            {g.final.status === "voting" ? "Vote so far" : "Final vote"}
            {n > 1 ? `, attempt ${n}` : ""}
          </div>
          <div className="col-span-12 sm:col-span-4">
            <VoteBar
              approvals={g.final.approvals ?? 0}
              noVotes={closedNoVotes(g.final, from.voteRounds)}
              voteRounds={from.voteRounds}
              threshold={from.threshold}
            />
          </div>
          <div className="col-span-12 sm:col-span-3 sm:text-right">
            <Tally u={g.final} from={from} />
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="mt-2 py-1 inline-flex items-center gap-1 text-[13px] text-primary hover:underline"
        aria-expanded={open}
      >
        {n === 1 ? "Proposal" : `${n} attempts`}
        <ChevronDown size={14} className={cn("transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="mt-2">
          {g.attempts.map((u, i) => (
            <Attempt
              key={u.voteBefore}
              u={u}
              n={i + 1}
              from={from}
              liveNoVotes={u === g.final ? vote?.noVotes : undefined}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Consensus upgrade proposals and their votes, from surf idx, grouped by the protocol proposed. */
function Upgrades(): JSX.Element {
  useTitle("Upgrades");
  const caps = useSurfIdxCaps();
  const lookup = useConsensusVersionLookup();
  const { groups, isError, error } = useUpgradeGroups();
  const upgrade = useConsensusUpgrade();
  const { hash } = useLocation();

  const cards = useMemo(() => groups?.slice().reverse(), [groups]);
  // The vote rules of the newest vote, for the intro.
  const rules = cards?.length ? lookup(cards[0].from) : null;
  const [showHow, setShowHow] = useState(false);

  // The linked group's anchor. A protocol no proposal introduced (the genesis one) has no card:
  // link to the upgrade away from it.
  const linked = useMemo(() => {
    if (!cards || !hash) return undefined;
    const id = decodeURIComponent(hash.slice(1));
    return (
      cards.find((g) => g.anchor === id)?.anchor ??
      cards.find((g) => g.status === "applied" && upgradeAnchor(lookup(g.from).name) === id)?.anchor
    );
  }, [cards, hash, lookup]);

  // Scroll to it once per link, not again whenever the groups rebuild. Not marked done until it is
  // found: anchors are short hashes until the version names load.
  const scrolledTo = useRef<string | null>(null);
  useEffect(() => {
    if (!linked || scrolledTo.current === hash) return;
    const target = document.getElementById(linked);
    if (!target) return;
    scrolledTo.current = hash;
    target.scrollIntoView({ block: "start" });
  }, [linked, hash]);

  if (!surfIdxSupported) return <div className="mt-6 text-muted-foreground">Network not supported</div>;
  if (caps?.unavailable) return <div className="mt-6 text-muted-foreground">{surfIdxOffMessage(caps)}</div>;

  return (
    <div>
      <button
        type="button"
        onClick={() => setShowHow((o) => !o)}
        className="mt-1 py-1 inline-flex items-center gap-1 text-sm text-primary hover:underline"
        aria-expanded={showHow}
      >
        How protocol upgrades work
        <ChevronDown size={14} className={cn("transition-transform", showHow && "rotate-180")} />
      </button>
      {showHow ? (
        <p className="mt-2 text-sm text-muted-foreground">
          A block proposer can propose a new consensus protocol. The blocks that follow vote on it, one vote per block
          {rules?.voteRounds && rules.threshold
            ? `: ${rules.threshold.toLocaleString()} yes votes in the next ${rules.voteRounds.toLocaleString()} blocks approve it`
            : ""}
          . An approved protocol switches on after a delay set by the proposal. Most proposals are rejected while node
          runners are still upgrading, and get proposed again right away.
        </p>
      ) : null}
      {/* A failed background refetch keeps the cards it has. */}
      {isError && !cards ? (
        <div className="py-16 text-center text-muted-foreground">{(error as Error).message}</div>
      ) : !cards ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading upgrades...</span>
        </div>
      ) : cards.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">No upgrades proposed yet</div>
      ) : (
        // Keyed by the first attempt: a new attempt mustn't remount the card and close it.
        cards.map((g) => <GroupCard key={g.attempts[0].voteBefore} g={g} linked={g.anchor === linked} upgrade={upgrade} />)
      )}
    </div>
  );
}

export default Upgrades;
