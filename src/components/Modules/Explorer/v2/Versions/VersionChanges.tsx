import React, { useCallback, useMemo } from "react";
import { ArrowLeftRight, ListFilter, X } from "lucide-react";
import { cn } from "src/lib/utils";
import { Chip } from "src/components/v2/Chips";
import JsonDiffTree, { NumberFormat, NumberFormatOf } from "src/components/v2/JsonDiffTree";
import { useTinyAsset } from "src/components/Common/UseTinyAsset";
import { isDeletedAssetTiny } from "src/packages/abel/abel";
import {
  amountUnit,
  buildDeltaTree,
  FieldPath,
  formatPath,
  ObjectSummary,
  ObjRef,
  overlayChanges,
  Snapshot,
} from "src/utils/versionDelta";
import { parseObjKey, VersionFilter } from "src/utils/versionFilter";
import Link from "../Links/Link";

/** How each tab names the objects a version touched: an app tab touches only the app. */
export type ObjectLabel = ((ref: ObjRef) => React.ReactNode) | null;

/** Where each tab shows the state at `round` (`?round=`): the whole record, or the part showing `ref`. */
export type StateHref = (round: number, ref?: ObjRef) => string;

/**
 * Where each tab lists the transactions in `round` (`?txn-round=`) that
 * changed `ref`, or without one the record, and whose they are.
 */
export type TxnsLink = (round: number, ref?: ObjRef) => { href: string; title: string };

/** A version's TxnsLink: of the one object it changed, else of the record. */
export function versionTxnsLink(txnsLink: TxnsLink, row: { round: number; summaries: ObjectSummary[] }) {
  return txnsLink(row.round, row.summaries.length === 1 ? row.summaries[0].ref : undefined);
}

/** A small link to transactions in a round, beside a version's rewind link. */
export function FindTxnsLink({ href, title }: { href: string; title: string }) {
  return (
    <Link href={href} className="text-xs" title={title}>
      <ArrowLeftRight size={12} className="inline -mt-0.5 mr-1" />
      find txns
    </Link>
  );
}

/** The list of only the versions that changed `path` of the object `key`, or without one, that changed it at all. */
export type FieldHref = (key: string, path?: FieldPath) => string;

/** Links to the list filtered to a field or object, shown on hover. */
export function FilterLink({ href, title, className }: { href: string; title: string; className?: string }) {
  return (
    <Link noStyle href={href} title={title} className={cn("inline-flex text-muted-foreground hover:text-primary", className)}>
      <ListFilter size={11} />
    </Link>
  );
}

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

/** Filtered, the rest of a version (see summarizeOthers); pending while it is read. */
export type OtherChanges = { summaries: ObjectSummary[]; pending: boolean; error?: Error };

/** The rest of a version, dimmed under what the filter picks: as `children` render it. */
function Others({ others, children }: { others?: OtherChanges; children: (summaries: ObjectSummary[]) => React.ReactNode }) {
  if (!others || !(others.summaries.length || others.pending || others.error)) return null;
  return (
    <div className="opacity-60 flex flex-col gap-1" title="Also in this version">
      {children(others.summaries)}
      {others.pending ? <Pending className="h-5 w-24" /> : null}
      {others.error ? <span className="text-xs text-red-400">Rest of the version unavailable: {others.error.message}</span> : null}
    </div>
  );
}

/** The changed paths of each object, as chips; with `fieldHref`, each links to the versions that changed it. */
export function ChangedKeys({
  summaries,
  label,
  fieldHref,
  others,
}: {
  summaries: ObjectSummary[];
  label: ObjectLabel;
  fieldHref?: FieldHref;
  /** Filtered, the rest of the version, dimmed. */
  others?: OtherChanges;
}) {
  return (
    <div className="flex flex-col gap-1">
      {summaries.map((s) => {
        const paths = s.status === "changed" ? s.changes.map((c) => ({ path: c.path, text: formatPath(c.path) })) : [];
        return (
          <div key={s.key} className="flex flex-wrap items-center gap-1">
            {label ? (
              <span className="text-muted-foreground text-xs mr-0.5 inline-flex items-center gap-1">
                {label(s.ref)}
                {fieldHref ? <FilterLink href={fieldHref(s.key)} title="Only the versions that changed this" /> : null}
              </span>
            ) : null}
            {s.status === "pending" ? <Pending className="h-5 w-24" /> : null}
            <StatusChip summary={s} />
            {paths.slice(0, MAX_PATH_CHIPS).map(({ path, text }) => {
              const chip = (
                <Chip variant="success" className={cn("font-mono", fieldHref && "cursor-pointer hover:bg-primary/10")} title={text}>
                  <span className="max-w-[16ch] truncate">{text}</span>
                </Chip>
              );
              return fieldHref ? (
                <Link key={text} noStyle href={fieldHref(s.key, path)} title={`Only the versions that changed ${text}`}>
                  {chip}
                </Link>
              ) : (
                <React.Fragment key={text}>{chip}</React.Fragment>
              );
            })}
            {paths.length > MAX_PATH_CHIPS ? (
              <span className="text-xs text-muted-foreground">+{paths.length - MAX_PATH_CHIPS}</span>
            ) : null}
          </div>
        );
      })}
      <Others others={others}>{(rest) => <ChangedKeys summaries={rest} label={label} fieldHref={fieldHref} />}</Others>
    </div>
  );
}

/**
 * The filter a list shows, as chips: the object (where the list has several)
 * and each field, each removable.
 */
export function ActiveFilter({
  filter,
  label,
  filterHref,
}: {
  filter: VersionFilter;
  label: ObjectLabel;
  filterHref: (filter: VersionFilter | undefined) => string;
}) {
  const ref = filter.object ? parseObjKey(filter.object) : undefined;
  const remove = (href: string, what: string) => (
    <Link noStyle href={href} title={`Remove ${what}`} className="inline-flex -mr-1 ml-1 hover:text-foreground">
      <X size={12} />
    </Link>
  );
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-sm">
      <ListFilter size={14} className="text-muted-foreground" />
      {ref && label ? (
        <Chip variant="success">
          {label(ref)}
          {remove(filterHref(undefined), "the filter")}
        </Chip>
      ) : null}
      {filter.fields.map((field, i) => {
        const text = formatPath(field);
        return (
          <Chip key={text} variant="success" className="font-mono" title={text}>
            <span className="max-w-[24ch] truncate">{text}</span>
            {remove(
              // With no object label, the object is implied, so it goes with the last field.
              filterHref({ ...filter, object: label ? filter.object : undefined, fields: filter.fields.filter((_, j) => j !== i) }),
              text,
            )}
          </Chip>
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
  fieldHref,
  ...treeProps
}: { summary: ObjectSummary; full?: boolean; fieldHref?: FieldHref } & Omit<
  React.ComponentProps<typeof JsonDiffTree>,
  "value" | "numberFormat" | "keyAction"
>) {
  const numberFormat = useNumberFormat(summary.ref, summary.state);
  const value = useMemo(
    () => (full ? overlayChanges(summary.state, summary.changes) : buildDeltaTree(summary.changes)),
    [full, summary],
  );
  const keyAction = useMemo(
    () =>
      fieldHref &&
      ((path: FieldPath) => (
        <FilterLink
          href={fieldHref(summary.key, path)}
          title={`Only the versions that changed ${formatPath(path)}`}
          className="hidden group-hover/key:inline-flex ml-1"
        />
      )),
    [fieldHref, summary.key],
  );
  return <JsonDiffTree value={value} numberFormat={numberFormat} keyAction={keyAction} {...treeProps} />;
}

/** Each object's changes as a compact JSON delta. */
export function DeltaCell({
  summaries,
  label,
  fieldHref,
  others,
  labelled = !!label && summaries.length + (others?.summaries.length ?? 0) > 1,
}: {
  summaries: ObjectSummary[];
  label: ObjectLabel;
  fieldHref?: FieldHref;
  /** Filtered, the rest of the version, dimmed. */
  others?: OtherChanges;
  /** Whether each object is labelled: by default, where there are several. */
  labelled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 min-w-0 text-left">
      {summaries.map((s) => (
        <div key={s.key} className="min-w-0">
          {label && labelled ? (
            <div className="text-muted-foreground text-xs">{label(s.ref)}</div>
          ) : null}
          {s.status === "pending" ? (
            <Pending className="h-4 w-40 my-0.5" />
          ) : s.status === "error" ? (
            <span className="text-red-400 text-xs">Previous state unavailable: {s.error}</span>
          ) : s.changes.length ? (
            <ObjectDiffTree summary={s} fieldHref={fieldHref} collapseDepth={0} maxChildren={6} truncateAt={40} truncateBytes={64} />
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          )}
        </div>
      ))}
      <Others others={others}>
        {(rest) => <DeltaCell summaries={rest} label={label} fieldHref={fieldHref} labelled={labelled} />}
      </Others>
    </div>
  );
}
