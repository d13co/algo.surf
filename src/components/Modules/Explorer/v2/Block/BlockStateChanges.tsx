import React, { useMemo, useState } from "react";
import { Navigate, useLocation, useParams } from "react-router-dom";
import { useQueries, useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, History } from "lucide-react";
import NumberFormat from "react-number-format";
import type { AssetHolding } from "abel-ghost-sdk";
import { accountFields, getBlockDelta, DeltaAccount, DeltaBox, DeltaHolding, DeltaObject } from "src/utils/blockDelta";
import { getAbelAt } from "src/packages/abel/abelAt";
import { isDeletedAssetTiny } from "src/packages/abel/abel";
import { useTinyAssetsAtRound } from "src/components/Common/UseTinyAsset";
import { formatUnits } from "src/utils/formatUnits";
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

type Units = { decimals: number; unit: string };

/** Each holding's state before the block, by `${assetId}:${address}`; undefined where it wasn't opted in. */
type HoldingsBefore = { holdings: Map<string, AssetHolding | undefined>; failed: Set<number> };

/**
 * The block's holdings as they were at R-1, one abel read per asset (it reads
 * one asset's holdings of many accounts), a few at a time. An asset the block
 * created had none. An asset whose read fails is in `failed`.
 */
async function readHoldingsBefore(holdings: DeltaHolding[], createdAssets: Set<number>, round: number): Promise<HoldingsBefore> {
  const abel = getAbelAt();
  if (!abel) throw new Error("No time travel node configured");
  const byAsset = new Map<number, string[]>();
  for (const h of holdings) {
    if (createdAssets.has(h.assetId)) continue;
    const addresses = byAsset.get(h.assetId);
    if (addresses) addresses.push(h.address);
    else byAsset.set(h.assetId, [h.address]);
  }
  const out: HoldingsBefore = { holdings: new Map(), failed: new Set() };
  const queue = [...byAsset];
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const [assetId, addresses] = next;
      for (let attempt = 1; ; attempt++) {
        try {
          const read = await abel.getAssetHoldings(assetId, addresses, { round: round - 1 });
          for (const a of addresses) out.holdings.set(`${assetId}:${a}`, read.get(a));
          break;
        } catch {
          if (attempt === 3) {
            out.failed.add(assetId);
            break;
          }
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, queue.length) }, worker));
  return out;
}

/** An amount in the asset's units (its link names the unit), or in base units when they aren't known (a deleted asset). */
function Amount({ value, units, loading }: { value: bigint; units?: Units; loading?: boolean }) {
  if (!units && loading) return <Pending className="inline-block h-4 w-12 align-middle" />;
  return units ? (
    <span>{formatUnits(value, units.decimals)}</span>
  ) : (
    <span title="The asset's decimals aren't known: base units">{formatUnits(value, 0)}</span>
  );
}

/**
 * One of an account's holdings the block wrote: its amount before → after
 * and the change, opt-ins, opt-outs and freezes. Expands to its state before
 * and after. `before` is "pending" until read, "unknown" without it (block 1,
 * a failed read).
 */
function HoldingLine({
  h,
  round,
  units,
  unitsLoading,
  name,
  before,
}: {
  h: DeltaHolding;
  round: number;
  units?: Units;
  unitsLoading?: boolean;
  name?: string;
  before: AssetHolding | undefined | "pending" | "unknown";
}) {
  const [open, setOpen] = useState(false);
  const known = before !== "pending" && before !== "unknown";
  // BigInt(): a read can decode a small uint64 as a number.
  const was = known ? BigInt(before?.balance ?? 0) : undefined;
  const now = BigInt(h.amount ?? 0);
  const change = was === undefined ? undefined : now - was;
  const optedIn = known && !before && !h.deleted;
  const frozeChanged = known && !!before && h.frozen !== null && before.frozen !== h.frozen;
  return (
    <div className="py-1">
      <button type="button" className="flex w-full min-w-0 items-center gap-2 text-left text-sm" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
          <span className="min-w-0 max-w-[24ch] truncate" onClick={(e) => e.stopPropagation()}>
            <LinkToAsset id={h.assetId} name={name} />
          </span>
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            {before === "pending" ? (
              <Pending className="inline-block h-4 w-16 align-middle" />
            ) : was !== undefined ? (
              <Amount value={was} units={units} loading={unitsLoading} />
            ) : (
              <span title={round <= 1 ? "Block 1 follows genesis" : "The holdings before this block couldn't be read"}>?</span>
            )}
            <span>→</span>
            <span className="text-foreground">
              {h.deleted ? <span className="text-muted-foreground">—</span> : <Amount value={now} units={units} loading={unitsLoading} />}
            </span>
          </span>
          {change ? (
            <span className={change > 0n ? "text-green-400" : "text-red-400"}>
              {change > 0n ? "+" : "−"}
              {unitsLoading && !units ? <Pending className="inline-block h-4 w-8 align-middle" /> : formatUnits(change > 0n ? change : -change, units?.decimals ?? 0)}
            </span>
          ) : null}
          {optedIn ? <Chip className="border-green-400 text-green-400">opted in</Chip> : null}
          {h.deleted ? <Chip className="border-red-400 text-red-400">opted out</Chip> : null}
          {frozeChanged ? <Chip>{h.frozen ? "frozen" : "unfrozen"}</Chip> : null}
        </div>
      </button>
      {open ? (
        <div className="mt-2 pl-1 sm:pl-6 text-sm">
          <ObjectRoundDiff ctx={h.ctx} objRef={h.ref} round={round} unchangedLabel="written, same value" />
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

/** An account's row: its base record's change (when it has one to show) and the holdings the block wrote. */
type MergedRow = { address: string; base?: AccountRow; holdings: DeltaHolding[] };

/** The ALGO balance, proposer and heartbeat marks and changed fields of an account's base record. */
function BaseSummary({ base, round }: { base: AccountRow; round: number }) {
  const { account: a, before, balanceChanged, proposed, heartbeat, changes } = base;
  const change = before === undefined ? undefined : a.microAlgos - before;
  return (
    <>
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
    </>
  );
}

function AccountHoldingsRow({
  row,
  round,
  assetUnits,
  unitsLoading,
  assetNames,
  holdingBefore,
}: {
  row: MergedRow;
  round: number;
  assetUnits: (assetId: number) => Units | undefined;
  unitsLoading: boolean;
  assetNames: (assetId: number) => string | undefined;
  holdingBefore: (h: DeltaHolding) => AssetHolding | undefined | "pending" | "unknown";
}) {
  const [open, setOpen] = useState(false);
  const address = (
    <span className="min-w-0 text-[13px]" onClick={(e) => e.stopPropagation()}>
      <LinkToAccount address={row.address} strip={9} copySize="m" />
    </span>
  );
  return (
    <div className="border-b border-border py-2">
      {row.base ? (
        <button type="button" className="flex w-full min-w-0 items-center gap-2 text-left text-sm" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
            {address}
            <BaseSummary base={row.base} round={round} />
          </div>
        </button>
      ) : (
        // Only holdings changed: nothing of the account's own to expand.
        <div className="flex w-full min-w-0 items-center gap-2 text-sm">
          <span className="h-4 w-4 shrink-0" />
          {address}
        </div>
      )}
      {open && row.base ? (
        <div className="mt-2 pl-1 sm:pl-6 text-sm">
          {/* The delta lists every object the block wrote, also those written with the value they had. */}
          <ObjectRoundDiff ctx={row.base.account.ctx} objRef={row.base.account.ref} round={round} unchangedLabel="written, same value" />
        </div>
      ) : null}
      {row.holdings.length ? (
        <div className="mt-1 pl-4 sm:pl-6">
          {row.holdings.map((h) => (
            <HoldingLine
              key={h.key}
              h={h}
              round={round}
              units={assetUnits(h.assetId)}
              unitsLoading={unitsLoading}
              name={assetNames(h.assetId)}
              before={holdingBefore(h)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
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

  // Holdings: their state before the block, and their assets' units. An
  // asset the delta holds params of has them there; the others are read
  // now, and a deleted one at R-1, where every asset the block touched but
  // didn't create existed.
  const deltaUnits = useMemo(() => new Map((delta?.assets ?? []).flatMap((a) => (a.units ? [[a.assetId, a.units]] : []))), [delta]);
  const createdAssets = useMemo(() => new Set((delta?.assets ?? []).filter((a) => a.created).map((a) => a.assetId)), [delta]);
  const lookupIds = useMemo(
    () => [...new Set((delta?.holdings ?? []).map((h) => h.assetId))].filter((id) => !deltaUnits.has(id)),
    [delta, deltaUnits],
  );
  const { data: tinies, isLoading: unitsLoading } = useTinyAssetsAtRound(lookupIds, round - 1);
  const assetUnits = (assetId: number): Units | undefined => {
    const fromDelta = deltaUnits.get(assetId);
    if (fromDelta) return fromDelta;
    const tiny = tinies?.get(assetId);
    return tiny && !isDeletedAssetTiny(tiny) ? { decimals: tiny.params.decimals, unit: tiny.params["unit-name"] } : undefined;
  };
  const assetNames = (assetId: number): string | undefined => {
    const tiny = tinies?.get(assetId);
    if (tiny && !isDeletedAssetTiny(tiny)) return tiny.params["unit-name"] || tiny.params.name || undefined;
    return deltaUnits.get(assetId)?.unit || undefined;
  };

  const { data: before, isError: holdingsFailed } = useQuery({
    queryKey: ["block-delta-holdings-before", node, round],
    queryFn: () => readHoldingsBefore(delta!.holdings, createdAssets, round),
    enabled: !!delta?.holdings.length && round > 1,
    staleTime: Infinity,
    retry: false,
    meta,
  });
  const holdingBefore = (h: DeltaHolding): AssetHolding | undefined | "pending" | "unknown" => {
    if (round <= 1) return undefined; // Genesis has no assets: every holding is new.
    if (holdingsFailed) return "unknown";
    if (!before) return "pending";
    if (before.failed.has(h.assetId)) return "unknown";
    return before.holdings.get(`${h.assetId}:${h.address}`);
  };

  // One row per account: its base record's change, if useAccountRows shows
  // one, and its holdings. An account whose holdings alone changed has a row
  // too (the delta may not list its base record at all).
  const mergedRows = useMemo((): MergedRow[] => {
    const rows = new Map<string, MergedRow>();
    for (const base of accountRows) rows.set(base.account.address, { address: base.account.address, base, holdings: [] });
    for (const h of delta?.holdings ?? []) {
      const row = rows.get(h.address) ?? { address: h.address, holdings: [] };
      row.holdings.push(h);
      rows.set(h.address, row);
    }
    return [...rows.values()].sort((a, b) => (a.address < b.address ? -1 : a.address > b.address ? 1 : 0));
  }, [accountRows, delta]);

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
        items={mergedRows}
        loading={accountsLoading}
        render={(r) => (
          <AccountHoldingsRow
            key={r.address}
            row={r}
            round={round}
            assetUnits={assetUnits}
            unitsLoading={unitsLoading}
            assetNames={assetNames}
            holdingBefore={holdingBefore}
          />
        )}
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

      <Section title="Boxes" items={delta.boxes} render={(b) => <BoxRow key={b.key} box={b} />} />
    </div>
  );
}
