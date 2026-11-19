import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, History } from "lucide-react";
import { withRound } from "src/hooks/useRound";
import { useTinyAssetsAtRound } from "src/components/Common/UseTinyAsset";
import { isDeletedAssetTiny } from "src/packages/abel/abel";
import { accountFields } from "src/utils/blockDelta";
import { formatUnits } from "src/utils/formatUnits";
import { buildDeltaTree, Change, diff, DJson, DObject, formatPath } from "src/utils/versionDelta";
import {
  accountRows,
  SCAccountRow,
  SCAccountState,
  SCAppChange,
  SCAppParams,
  SCAssetChange,
  SCAssetParams,
  SCGroup,
  SCHoldingChange,
} from "src/utils/txnStateChanges";
import JsonDiffTree, { NumberFormatOf } from "src/components/v2/JsonDiffTree";
import { Chip } from "src/components/v2/Chips";
import AlgoIcon from "../../AlgoIcon/AlgoIcon";
import Link from "../Links/Link";
import LinkToAccount from "../Links/LinkToAccount";
import LinkToApplication from "../Links/LinkToApplication";
import LinkToAsset from "../Links/LinkToAsset";
import { Pending } from "../Versions/ObjectRoundDiff";

type Units = { decimals: number; unit: string };

const ALGO: NumberFormatOf = (path) => (path[0] === "amount" || path[0] === "min-balance" ? { decimals: 6, unit: "ALGO" } : undefined);

const big = (v: unknown) => BigInt((v as number | bigint | undefined) ?? 0);

function Signed({ change, decimals }: { change: bigint; decimals: number }) {
  if (!change) return null;
  return (
    <span className={change > 0n ? "text-green-400" : "text-red-400"}>
      {change > 0n ? "+" : "−"}
      {formatUnits(change > 0n ? change : -change, decimals)}
    </span>
  );
}

function Algo({ micro }: { micro: bigint }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      <AlgoIcon />
      {formatUnits(micro, 6)}
    </span>
  );
}

/** accountFields' decimal strings as integers, so the diff tree formats them (in ALGO, grouped, with copy buttons). */
function integers(v: DJson): DJson {
  if (typeof v === "string") return /^\d+$/.test(v) ? BigInt(v) : v;
  if (v && typeof v === "object" && !Array.isArray(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, integers(x as DJson)]));
  return v;
}

/** An account state as the version diff reads it: accountFields' fields, plus the minimum balance. */
function stateFields(s: SCAccountState | undefined): DObject | null {
  const f = s ? accountFields(s) : null;
  return f ? (integers({ ...f, "min-balance": String(s!["min-balance"] ?? 0) }) as DObject) : null;
}

/** As the diff tree reads them: bytes as bytes, the base64 copy of a field with a text form left out. */
function assetFields(p: SCAssetParams | undefined): DObject | null {
  if (!p) return null;
  const out: DObject = {};
  for (const [k, v] of Object.entries(p)) {
    if (k.endsWith("-b64") && p[k.slice(0, -4)] !== undefined) continue;
    out[k] = k.endsWith("-b64") || k === "metadata-hash" ? { $bytes: String(v) } : (v as DJson);
  }
  return out;
}

/** Programs as their size and hash; global state is left out (its changes are per transaction). */
function appFields(p: SCAppParams | undefined): DObject | null {
  if (!p) return null;
  const out: DObject = {};
  for (const [k, v] of Object.entries(p)) {
    if (k === "global-state") continue;
    out[k] = k.endsWith("-program") ? { $program: String(v) } : (v as DJson);
  }
  return out;
}

/** before → after as a diff tree: the whole object where it was created or removed. */
function Diff({ before, after, numberFormat }: { before: DObject | null; after: DObject | null; numberFormat?: NumberFormatOf }) {
  const value = useMemo(() => {
    if (!before && after) return { $change: { path: [], kind: "added", after } as Change };
    if (before && !after) return { $change: { path: [], kind: "removed", before } as Change };
    return buildDeltaTree(diff(before ?? undefined, after ?? undefined));
  }, [before, after]);
  return <JsonDiffTree value={value} numberFormat={numberFormat} groupDigits copyInts maxChildren={Infinity} />;
}

function HistoryLinks({ href, round }: { href: string; round: number }) {
  return (
    <span className="ml-auto inline-flex items-center gap-3 text-xs">
      <History className="h-3.5 w-3.5 text-muted-foreground" />
      <Link href={withRound(href, round - 1)} keepRound={false}>
        at {round - 1}
      </Link>
      <Link href={withRound(href, round)} keepRound={false}>
        at {round}
      </Link>
    </span>
  );
}

function HoldingLine({ h, units, unitsLoading }: { h: SCHoldingChange; units?: Units; unitsLoading: boolean }) {
  const assetId = Number(h["asset-id"]);
  const was = h.before ? big(h.before.amount) : undefined;
  const now = h.after ? big(h.after.amount) : undefined;
  const decimals = units?.decimals ?? 0;
  const amount = (v: bigint) =>
    !units && unitsLoading ? <Pending className="inline-block h-4 w-12 align-middle" /> : <span title={units ? undefined : "Base units"}>{formatUnits(v, decimals)}</span>;
  const froze = h.before && h.after && !!h.before["is-frozen"] !== !!h.after["is-frozen"];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-0.5 text-sm">
      <span className="min-w-0 max-w-[24ch] truncate">
        <LinkToAsset id={assetId} name={units?.unit || undefined} />
      </span>
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        {was !== undefined ? amount(was) : <span>—</span>}
        <span>→</span>
        <span className="text-foreground">{now !== undefined ? amount(now) : <span className="text-muted-foreground">—</span>}</span>
      </span>
      {!unitsLoading || units ? <Signed change={(now ?? 0n) - (was ?? 0n)} decimals={decimals} /> : null}
      {!h.before ? <Chip className="border-green-400 text-green-400">opted in</Chip> : null}
      {!h.after ? <Chip className="border-red-400 text-red-400">opted out</Chip> : null}
      {froze ? <Chip>{h.after!["is-frozen"] ? "frozen" : "unfrozen"}</Chip> : null}
    </div>
  );
}

/**
 * One account's changes in the group: its balance before → after, its other
 * changed fields (expandable), its holdings and its local state opt-ins and
 * opt-outs.
 */
function AccountRow({ row, round, units, unitsLoading }: {
  row: SCAccountRow;
  round: number;
  units: (assetId: number) => Units | undefined;
  unitsLoading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const a = row.account;
  const before = useMemo(() => stateFields(a?.before), [a]);
  const after = useMemo(() => stateFields(a?.after), [a]);
  const changed = useMemo(() => (a ? diff(before ?? undefined, after ?? undefined) : []), [a, before, after]);
  const others = changed.filter((c) => c.path[0] !== "amount");
  const was = a?.before ? big(a.before.amount) : undefined;
  const now = a?.after ? big(a.after.amount) : undefined;
  const balanceChanged = !!a && was !== now;
  const Toggle = open ? ChevronDown : ChevronRight;

  return (
    <div className="border-b border-border py-2">
      <div className="flex w-full min-w-0 items-center gap-2 text-sm">
        {a ? (
          <button type="button" className="shrink-0 cursor-pointer" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Show the account's changed fields">
            <Toggle className="h-4 w-4" />
          </button>
        ) : (
          <span className="h-4 w-4 shrink-0" />
        )}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
          <span className="min-w-0 text-[13px]">
            <LinkToAccount address={row.address} strip={9} copySize="m" />
          </span>
          {balanceChanged ? (
            <>
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                {was !== undefined ? <Algo micro={was} /> : <span>—</span>}
                <span>→</span>
                <span className="text-foreground">{now !== undefined ? <Algo micro={now} /> : <span className="text-muted-foreground">—</span>}</span>
              </span>
              <Signed change={(now ?? 0n) - (was ?? 0n)} decimals={6} />
            </>
          ) : null}
          {a && !a.before ? <Chip className="border-green-400 text-green-400">new account</Chip> : null}
          {a && !a.after ? <Chip className="border-red-400 text-red-400">closed</Chip> : null}
          {a?.before && a.after
            ? others.slice(0, 3).map((c) => (
                <Chip key={formatPath(c.path)} variant="success" className="font-mono">
                  {formatPath(c.path)}
                </Chip>
              ))
            : null}
          {a?.before && a.after && others.length > 3 ? <span className="text-xs text-muted-foreground">+{others.length - 3} more {others.length - 3 === 1 ? "field" : "fields"}</span> : null}
          {row.locals.map((l) => (
            <span key={String(l["app-id"])} className="inline-flex items-center gap-1.5 text-xs">
              <Chip className={l.before ? "border-red-400 text-red-400" : "border-green-400 text-green-400"}>{l.before ? "opted out of" : "opted in to"}</Chip>
              <LinkToApplication id={Number(l["app-id"])} />
            </span>
          ))}
        </div>
      </div>
      {open && a ? (
        <div className="mt-2 pl-1 sm:pl-6 text-sm">
          <div className="flex mb-1">
            <HistoryLinks href={`/account/${row.address}`} round={round} />
          </div>
          <Diff before={before} after={after} numberFormat={ALGO} />
        </div>
      ) : null}
      {row.holdings.length ? (
        <div className="mt-1 pl-6">
          {row.holdings.map((h) => (
            <HoldingLine key={String(h["asset-id"])} h={h} units={units(Number(h["asset-id"]))} unitsLoading={unitsLoading} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Status({ before, after, changed = "updated" }: { before?: unknown; after?: unknown; changed?: string }) {
  if (!before) return <Chip className="border-green-400 text-green-400">created</Chip>;
  if (!after) return <Chip className="border-red-400 text-red-400">deleted</Chip>;
  return <Chip>{changed}</Chip>;
}

function AssetRow({ c, round }: { c: SCAssetChange; round: number }) {
  const id = Number(c["asset-id"]);
  const before = useMemo(() => assetFields(c.before), [c]);
  const after = useMemo(() => assetFields(c.after), [c]);
  const name = (c.after ?? c.before)?.["unit-name"] ?? (c.after ?? c.before)?.name;
  return (
    <div className="border-b border-border py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm mb-1">
        <LinkToAsset id={id} name={name} />
        <Status before={c.before} after={c.after} changed="reconfigured" />
        <HistoryLinks href={`/asset/${id}`} round={round} />
      </div>
      <Diff before={before} after={after} />
    </div>
  );
}

function AppRow({ c, round }: { c: SCAppChange; round: number }) {
  const id = Number(c["app-id"]);
  const before = useMemo(() => appFields(c.before), [c]);
  const after = useMemo(() => appFields(c.after), [c]);
  return (
    <div className="border-b border-border py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm mb-1">
        <span>
          App <LinkToApplication id={id} copy="right" copySize="s" />
        </span>
        <Status before={c.before} after={c.after} />
        <HistoryLinks href={`/application/${id}`} round={round} />
      </div>
      <Diff before={before} after={after} />
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-sm font-medium mt-4 first:mt-0 mb-1.5">{children}</div>;
}

/**
 * What a group changed besides app state, each with its value before and
 * after the group, from the time-travel node's full deltas: accounts (their
 * balances and fields, holdings and local state opt-ins and opt-outs),
 * assets and apps. The fee sink, which every group pays, is folded into one
 * line.
 */
export default function GroupChangesView({ group, round, feeSink }: { group: SCGroup; round: number; feeSink?: string }): JSX.Element {
  const [showFeeSink, setShowFeeSink] = useState(false);
  const rows = useMemo(() => accountRows(group), [group]);
  const sink = rows.find((r) => r.address === feeSink && r.account && !r.holdings.length && !r.locals.length);
  const shown = rows.filter((r) => showFeeSink || r !== sink);

  // Units: a created asset's from the answer, any other's as it was at R-1.
  const own = useMemo(
    () => new Map((group.assets ?? []).flatMap((a) => {
      const p = a.after ?? a.before;
      return p ? [[Number(a["asset-id"]), { decimals: Number(p.decimals ?? 0), unit: p["unit-name"] ?? "" }]] : [];
    })),
    [group],
  );
  const lookup = useMemo(
    () => [...new Set((group.holdings ?? []).map((h) => Number(h["asset-id"])))].filter((id) => !own.has(id)),
    [group, own],
  );
  const { data: tinies, isLoading: unitsLoading } = useTinyAssetsAtRound(lookup, round - 1);
  const units = (id: number): Units | undefined => {
    const o = own.get(id);
    if (o) return o;
    const t = tinies?.get(id);
    return t && !isDeletedAssetTiny(t) ? { decimals: t.params.decimals, unit: t.params["unit-name"] ?? "" } : undefined;
  };

  const sinkChange = sink ? big(sink.account!.after?.amount) - big(sink.account!.before?.amount) : 0n;
  const assets = group.assets ?? [];
  const apps = group.apps ?? [];

  return (
    <div>
      {shown.length ? (
        <>
          <SectionTitle>Accounts ({shown.length.toLocaleString()})</SectionTitle>
          {shown.map((r) => (
            <AccountRow key={r.address} row={r} round={round} units={units} unitsLoading={unitsLoading} />
          ))}
        </>
      ) : null}
      {sink ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span>
            Fee sink {sinkChange >= 0n ? "+" : "−"}
            {formatUnits(sinkChange >= 0n ? sinkChange : -sinkChange, 6)} ALGO in fees
          </span>
          <button type="button" className="text-primary hover:underline cursor-pointer" onClick={() => setShowFeeSink(!showFeeSink)}>
            {showFeeSink ? "hide" : "show"}
          </button>
        </div>
      ) : null}

      {assets.length ? (
        <>
          <SectionTitle>Assets ({assets.length.toLocaleString()})</SectionTitle>
          {assets.map((c) => (
            <AssetRow key={String(c["asset-id"])} c={c} round={round} />
          ))}
        </>
      ) : null}

      {apps.length ? (
        <>
          <SectionTitle>Apps ({apps.length.toLocaleString()})</SectionTitle>
          {apps.map((c) => (
            <AppRow key={String(c["app-id"])} c={c} round={round} />
          ))}
        </>
      ) : null}

      {!shown.length && !sink && !assets.length && !apps.length ? (
        <div className="text-sm text-muted-foreground">No changes besides app state</div>
      ) : null}
    </div>
  );
}
