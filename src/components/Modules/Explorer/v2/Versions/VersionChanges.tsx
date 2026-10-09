import React, { useCallback, useMemo } from "react";
import { cn } from "src/lib/utils";
import { Chip } from "src/components/v2/Chips";
import JsonDiffTree, { NumberFormat, NumberFormatOf } from "src/components/v2/JsonDiffTree";
import { useTinyAsset } from "src/components/Common/UseTinyAsset";
import { isDeletedAssetTiny } from "src/packages/abel/abel";
import {
  amountUnit,
  buildDeltaTree,
  formatPath,
  ObjectSummary,
  ObjRef,
  overlayChanges,
  Snapshot,
} from "src/utils/versionDelta";

/** How each tab names the objects a version touched: an app tab touches only the app. */
export type ObjectLabel = ((ref: ObjRef) => React.ReactNode) | null;

/** Where each tab shows the state at `round` (`?round=`): the whole record, or the part showing `ref`. */
export type StateHref = (round: number, ref?: ObjRef) => string;

/** Placeholder while the state before a version is being read. */
function Pending({ className }: { className: string }) {
  return <div className={cn("rounded bg-muted animate-pulse", className)} />;
}

const statusChipClass: Partial<Record<ObjectSummary["status"], string>> = {
  created: "border-green-400 text-green-400",
  deleted: "border-red-400 text-red-400",
  error: "border-red-400 text-red-400",
  unchanged: "border-muted text-muted-foreground",
};

const statusText: Partial<Record<ObjectSummary["status"], string>> = {
  created: "created",
  deleted: "deleted",
  error: "unavailable",
  unchanged: "no change",
};

export function StatusChip({ summary }: { summary: ObjectSummary }) {
  const text = statusText[summary.status];
  if (!text) return null;
  return (
    <Chip className={statusChipClass[summary.status]} title={summary.error}>
      {text}
    </Chip>
  );
}

const MAX_PATH_CHIPS = 4;

/** The changed paths of each object, as chips. */
export function ChangedKeys({ summaries, label }: { summaries: ObjectSummary[]; label: ObjectLabel }) {
  return (
    <div className="flex flex-col gap-1">
      {summaries.map((s) => {
        const paths = s.status === "changed" ? s.changes.map((c) => formatPath(c.path)) : [];
        return (
          <div key={s.key} className="flex flex-wrap items-center gap-1">
            {label ? <span className="text-muted-foreground text-xs mr-0.5">{label(s.ref)}</span> : null}
            {s.status === "pending" ? <Pending className="h-5 w-24" /> : null}
            <StatusChip summary={s} />
            {paths.slice(0, MAX_PATH_CHIPS).map((p) => (
              <Chip key={p} variant="success" className="font-mono" title={p}>
                <span className="max-w-[16ch] truncate">{p}</span>
              </Chip>
            ))}
            {paths.length > MAX_PATH_CHIPS ? (
              <span className="text-xs text-muted-foreground">+{paths.length - MAX_PATH_CHIPS}</span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

const algoFormat: NumberFormat = { decimals: 6, unit: "ALGO" };

/**
 * How `ref`'s amounts read (see amountUnit): in ALGO, or in the asset's
 * decimals and unit. A holding's come from abel; a created asset's from its
 * own params, which outlive the asset - and without them (params excluded)
 * it has no amount to read.
 */
function useNumberFormat(ref: ObjRef, state: Snapshot): NumberFormatOf {
  const { data: tiny } = useTinyAsset(ref.kind === "asset" ? Number(ref.id) : 0);
  const asset =
    ref.kind === "created-asset"
      ? state && "total" in state
        ? { decimals: Number(state.decimals ?? 0), unit: state["unit-name"] as string | undefined }
        : undefined
      : tiny && !isDeletedAssetTiny(tiny)
        ? { decimals: tiny.params.decimals, unit: tiny.params["unit-name"] }
        : undefined;

  const decimals = asset?.decimals;
  const unit = asset?.unit;
  return useCallback(
    (path: string[]) => {
      switch (amountUnit(ref, path)) {
        case "algo":
          return algoFormat;
        case "asset":
          return decimals === undefined ? undefined : { decimals, unit };
        default:
          return undefined;
      }
    },
    [ref, decimals, unit],
  );
}

/**
 * One object's changes, or with `full` its whole state with the changes
 * overlaid; amounts read in their units.
 */
export function ObjectDiffTree({
  summary,
  full = false,
  ...treeProps
}: { summary: ObjectSummary; full?: boolean } & Omit<React.ComponentProps<typeof JsonDiffTree>, "value" | "numberFormat">) {
  const numberFormat = useNumberFormat(summary.ref, summary.state);
  const value = useMemo(
    () => (full ? overlayChanges(summary.state, summary.changes) : buildDeltaTree(summary.changes)),
    [full, summary],
  );
  return <JsonDiffTree value={value} numberFormat={numberFormat} {...treeProps} />;
}

/** Each object's changes as a compact JSON delta. */
export function DeltaCell({ summaries, label }: { summaries: ObjectSummary[]; label: ObjectLabel }) {
  return (
    <div className="flex flex-col gap-2 min-w-0 text-left">
      {summaries.map((s) => (
        <div key={s.key} className="min-w-0">
          {label && summaries.length > 1 ? (
            <div className="text-muted-foreground text-xs">{label(s.ref)}</div>
          ) : null}
          {s.status === "pending" ? (
            <Pending className="h-4 w-40 my-0.5" />
          ) : s.status === "error" ? (
            <span className="text-red-400 text-xs">Previous state unavailable: {s.error}</span>
          ) : s.changes.length ? (
            <ObjectDiffTree summary={s} collapseDepth={0} maxChildren={6} truncateAt={40} />
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          )}
        </div>
      ))}
    </div>
  );
}
