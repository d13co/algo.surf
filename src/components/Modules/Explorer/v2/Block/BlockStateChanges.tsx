import React, { useMemo, useState } from "react";
import { Navigate, useLocation, useParams } from "react-router-dom";
import { useQueries, useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, History } from "lucide-react";
import NumberFormat from "react-number-format";
import { accountFields, getBlockDelta, DeltaAccount, DeltaBox, DeltaObject } from "src/utils/blockDelta";
import { getAbelAt } from "src/packages/abel/abelAt";
import { useTimeTravelStatus } from "src/hooks/useTimeTravel";
import { getTimeTravelNode, readAtRound } from "src/utils/timeTravel";
import { baselineRequest, Change, diff, formatPath } from "src/utils/versionDelta";
import { microalgosToAlgos } from "src/utils/common";
import { Chip } from "src/components/v2/Chips";
import LoadingTile from "src/components/v2/LoadingTile";
import MultiFormatViewer from "src/components/v2/MultiFormatViewer";
import AlgoIcon from "../../AlgoIcon/AlgoIcon";
import LinkToAccount from "../Links/LinkToAccount";
import LinkToApplication from "../Links/LinkToApplication";
import LinkToAsset from "../Links/LinkToAsset";
import ObjectRoundDiff, { Pending } from "../Versions/ObjectRoundDiff";
import { BoxValueDiff, SizeNote } from "../Application/BoxValueDiff";

const PAGE = 50;
const meta = { noPersist: true };

/** A row that shows `o`'s before → after once expanded. */
function Row({ o, round, children }: { o: DeltaObject; round: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border py-2">
      <button
        type="button"
        className="flex w-full min-w-0 items-center gap-2 text-left text-sm"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">{children}</div>
      </button>
      {open ? (
        <div className="mt-2 pl-1 sm:pl-6 text-sm">
          {/* The delta lists every object the block wrote, also those written with the value they had. */}
          <ObjectRoundDiff ctx={o.ctx} objRef={o.ref} round={round} unchangedLabel="written, same value" />
        </div>
      ) : null}
    </div>
  );
}

/** A titled list, `PAGE` rows at a time. */
function Section<T>({
  title,
  items,
  render,
  loading,
}: {
  title: string;
  items: T[];
  render: (item: T) => React.ReactNode;
  /** Its rows aren't sorted out yet: a placeholder instead. */
  loading?: boolean;
}) {
  const [shown, setShown] = useState(PAGE);
  if (loading) {
    return (
      <div className="mt-6">
        <div className="text-base font-medium">{title}</div>
        <Pending className="mt-2 h-5 w-64" />
      </div>
    );
  }
  if (!items.length) return null;
  return (
    <div className="mt-6">
      <div className="text-base font-medium">
        {title} <span className="text-muted-foreground">({items.length.toLocaleString()})</span>
      </div>
      <div className="mt-1">{items.slice(0, shown).map(render)}</div>
      {items.length > shown ? (
        <button type="button" className="mt-2 text-sm text-primary hover:underline" onClick={() => setShown(shown + PAGE * 4)}>
          Show more ({(items.length - shown).toLocaleString()} left)
        </button>
      ) : null}
    </div>
  );
}

const Algo = ({ micro }: { micro: bigint }) => (
  <span className="inline-flex items-center gap-0.5">
    <AlgoIcon />
    <NumberFormat value={microalgosToAlgos(Number(micro))} displayType="text" thousandSeparator={true} />
  </span>
);

function BoxRow({ box }: { box: DeltaBox }) {
  const [open, setOpen] = useState(false);
  const status = box.before === null ? "created" : box.after === null ? "deleted" : undefined;
  return (
    <div className="border-b border-border py-2">
      <button type="button" className="flex w-full min-w-0 items-center gap-2 text-left text-sm" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
          <span onClick={(e) => e.stopPropagation()}>
            <LinkToApplication id={box.appId} />
          </span>
          <span className="min-w-0 max-w-full truncate" onClick={(e) => e.stopPropagation()}>
            <MultiFormatViewer view="auto" value={box.name} side="left" />
          </span>
          {status ? (
            <Chip className={status === "created" ? "border-green-400 text-green-400" : "border-red-400 text-red-400"}>{status}</Chip>
          ) : null}
          <SizeNote before={box.before} after={box.after} />
        </div>
      </button>
      {open ? (
        <div className="mt-2 pl-1 sm:pl-6 text-sm">
          <BoxValueDiff before={box.before} after={box.after} />
        </div>
      ) : null}
    </div>
  );
}

/** What the delta and the balances before tell about an account's row, before reading anything else. */
type AccountRow = {
  account: DeltaAccount;
  before?: bigint;
  balanceChanged: boolean;
  proposed: boolean;
  heartbeat: boolean;
  /** For an account whose change the delta doesn't show: what changed, from a read at R-1. */
  changes?: Change[];
};

/**
 * Sorts the block's accounts into rows. The delta lists every account the
 * block wrote, even unchanged ones (the rewards pool, every block). One whose
 * balance, proposal or heartbeat didn't change is read at R-1, compared with
 * its record in the delta, and left out if nothing changed. Without the balances before (block 1, or a failed
 * read), every account is a row.
 */
function useAccountRows(accounts: DeltaAccount[], round: number, balances: Map<string, { balance: bigint }> | undefined, node?: string) {
  const rows = useMemo(
    () =>
      accounts.map((account): AccountRow => {
        const before = balances?.get(account.address)?.balance;
        return {
          account,
          before,
          balanceChanged: before !== undefined && before !== account.microAlgos,
          proposed: account.lastProposed === round,
          heartbeat: account.lastHeartbeat === round,
        };
      }),
    [accounts, balances, round],
  );
  const unexplained = balances ? rows.filter((r) => !r.balanceChanged && !r.proposed && !r.heartbeat) : [];
  const reads = useQueries({
    queries: unexplained.map((r) => {
      const req = baselineRequest(r.account.ctx, r.account.ref, round - 1);
      // readAtRound's cache key (see useObjectAt), so an expanded row reuses the read.
      return { queryKey: ["timetravel-at-round", node, req], queryFn: () => readAtRound(req), staleTime: Infinity, meta };
    }),
  });
  const checked = new Map<string, Change[] | "pending">();
  unexplained.forEach((r, i) => {
    const read = reads[i];
    if (read.isError) return; // shown, unsorted
    if (!read.isSuccess) return void checked.set(r.account.key, "pending");
    checked.set(r.account.key, diff(accountFields(read.data as Record<string, unknown> | null), r.account.fields));
  });
  const shown = rows.flatMap((r) => {
    const c = checked.get(r.account.key);
    if (c === "pending" || c?.length === 0) return [];
    return [c ? { ...r, changes: c } : r];
  });
  // Until every read is in, which accounts to show isn't known.
  return { rows: shown, pending: [...checked.values()].includes("pending") };
}

/**
 * The "State changes" tab of a block: every account, app, local state, asset,
 * holding and box round R changed, from the time-travel node's ledger delta.
 * Each row expands to its state before (R-1) and after (R); account balances
 * before are read for all of them at once.
 */
export default function BlockStateChanges(): JSX.Element {
  const { id } = useParams();
  const { search } = useLocation();
  const round = Number(id);
  const node = getTimeTravelNode()?.baseUrl;
  const status = useTimeTravelStatus();
  const supported = status === "supported";

  const { data: delta, error, isLoading } = useQuery({
    queryKey: ["block-delta", node, round],
    queryFn: ({ signal }) => getBlockDelta(round, signal),
    enabled: supported && Number.isSafeInteger(round) && round > 0,
    staleTime: Infinity,
    retry: false,
    meta,
  });

  const addresses = useMemo(() => delta?.accounts.map((a) => a.address) ?? [], [delta]);
  // Every account's balance before the block, in one read. Block 1 follows genesis, which has none to read.
  const { data: balancesBefore, isError: balancesFailed } = useQuery({
    queryKey: ["block-delta-balances-before", node, round],
    queryFn: () => {
      const abel = getAbelAt();
      if (!abel) throw new Error("No time travel node configured");
      return abel.getBalanceInfo(addresses, { round: round - 1 });
    },
    enabled: addresses.length > 0 && round > 1,
    staleTime: Infinity,
    meta,
  });

  const { rows: accountRows, pending: accountChecksPending } = useAccountRows(delta?.accounts ?? [], round, balancesBefore, node);
  const accountsLoading = (!!delta?.accounts.length && round > 1 && !balancesBefore && !balancesFailed) || accountChecksPending;

  // Only a time-travel node has deltas: without one, the block's transactions.
  if (status === "none" || status === "unsupported") return <Navigate replace to={`/block/${id}/transactions${search}`} />;
  if (isLoading || status === "checking") return <LoadingTile />;
  if (error || !delta) {
    return (
      <div className="mt-5 flex items-center gap-2.5 p-5 rounded-[10px] border-l-2 border-l-yellow-500 bg-yellow-500/10 text-sm">
        <History className="h-5 w-5 text-yellow-500 shrink-0" />
        <div>{(error as Error | null)?.message ?? "No state changes"}</div>
      </div>
    );
  }

  const total =
    accountRows.length + delta.apps.length + delta.locals.length + delta.assets.length + delta.holdings.length + delta.boxes.length;

  return (
    <div className="mt-4">
      <div className="text-sm text-muted-foreground">
        {accountsLoading ? (
          <Pending className="inline-block h-4 w-24 align-middle" />
        ) : (
          `${total.toLocaleString()} object${total === 1 ? "" : "s"} changed in this block.`
        )}{" "}
        Expand a row for its state before and after.
      </div>

      <Section
        title="Accounts"
        items={accountRows}
        loading={accountsLoading}
        render={({ account: a, before, balanceChanged, proposed, heartbeat, changes }) => {
          const change = before === undefined ? undefined : a.microAlgos - before;
          return (
            <Row key={a.key} o={a} round={round}>
              <span className="min-w-0 text-[13px]" onClick={(e) => e.stopPropagation()}>
                <LinkToAccount address={a.address} strip={9} copySize="m" />
              </span>
              {balanceChanged || before === undefined ? (
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  {before !== undefined ? (
                    <Algo micro={before} />
                  ) : (
                    <span title={round <= 1 ? "Block 1 follows genesis" : "The balances before this block couldn't be read"}>?</span>
                  )}
                  <span>→</span>
                  <span className="text-foreground">
                    <Algo micro={a.microAlgos} />
                  </span>
                </span>
              ) : null}
              {balanceChanged && change !== undefined ? (
                <span className={change > 0n ? "text-green-400" : "text-red-400"}>
                  {change > 0n ? "+" : "−"}
                  {microalgosToAlgos(Number(change > 0n ? change : -change)).toLocaleString(undefined, { maximumFractionDigits: 6 })}
                </span>
              ) : null}
              {proposed ? <Chip title="It proposed this block (last-proposed)">proposer</Chip> : null}
              {heartbeat ? <Chip title="It sent a heartbeat in this block (last-heartbeat)">heartbeat</Chip> : null}
              {changes?.slice(0, 3).map((c) => (
                <Chip key={formatPath(c.path)} variant="success" className="font-mono">
                  {formatPath(c.path)}
                </Chip>
              ))}
            </Row>
          );
        }}
      />

      <Section
        title="Applications"
        items={delta.apps}
        render={(a) => (
          <Row key={a.key} o={a} round={round}>
            <span onClick={(e) => e.stopPropagation()}>
              <LinkToApplication id={a.appId} />
            </span>
            {a.created ? <Chip className="border-green-400 text-green-400">created</Chip> : null}
            {a.deleted ? <Chip className="border-red-400 text-red-400">deleted</Chip> : null}
          </Row>
        )}
      />

      <Section
        title="Local states"
        items={delta.locals}
        render={(l) => (
          <Row key={l.key} o={l} round={round}>
            <span onClick={(e) => e.stopPropagation()}>
              <LinkToApplication id={l.appId} />
            </span>
            <span className="min-w-0 text-[13px]" onClick={(e) => e.stopPropagation()}>
              <LinkToAccount address={l.address} strip={9} />
            </span>
            {l.deleted ? <Chip className="border-red-400 text-red-400">closed out</Chip> : null}
          </Row>
        )}
      />

      <Section
        title="Assets"
        items={delta.assets}
        render={(a) => (
          <Row key={a.key} o={a} round={round}>
            <span onClick={(e) => e.stopPropagation()}>
              <LinkToAsset id={a.assetId} />
            </span>
            {a.created ? <Chip className="border-green-400 text-green-400">created</Chip> : null}
            {a.deleted ? <Chip className="border-red-400 text-red-400">destroyed</Chip> : null}
          </Row>
        )}
      />

      <Section
        title="Asset holdings"
        items={delta.holdings}
        render={(h) => (
          <Row key={h.key} o={h} round={round}>
            <span onClick={(e) => e.stopPropagation()}>
              <LinkToAsset id={h.assetId} />
            </span>
            <span className="min-w-0 text-[13px]" onClick={(e) => e.stopPropagation()}>
              <LinkToAccount address={h.address} strip={9} />
            </span>
            {h.deleted ? <Chip className="border-red-400 text-red-400">opted out</Chip> : null}
          </Row>
        )}
      />

      <Section title="Boxes" items={delta.boxes} render={(b) => <BoxRow key={b.key} box={b} />} />
    </div>
  );
}
