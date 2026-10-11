import React, { useEffect, useMemo, useState } from "react";
import { History, Loader2 } from "lucide-react";
import { cn } from "src/lib/utils";
import { Button } from "src/components/v2/ui/button";
import JsonDiffTree from "src/components/v2/JsonDiffTree";
import MultiDateViewer from "src/components/v2/MultiDateViewer";
import { useBoxVersions, useVersionRows, useVersionsOrder } from "src/hooks/useTimeTravel";
import { withRound } from "src/hooks/useRound";
import { withTxnRound } from "src/hooks/useTxnRound";
import type { TTBoxVersion } from "src/utils/timeTravel";
import {
  BaselineContext,
  boxVersionTouches,
  BytesLeaf,
  Change,
  Snapshot,
  summarizeObject,
  VersionRow,
} from "src/utils/versionDelta";
import Link from "../Links/Link";
import LinkToBlock from "../Links/LinkToBlock";
import { OrderButton } from "../Versions/VersionsList";
import { FindTxnsLink, StatusChip } from "../Versions/VersionChanges";
import { decodeBoxValue, DecodedEntry, DecodedEntryValue } from "./BoxValue";

/** Values up to this many bytes show whole, old → new, with the format switcher. */
const SHORT_VALUE = 32;
/** Hex dump lines hold 16 bytes, or 8 on a phone. */
const WIDE_HEX = "(min-width: 640px)";
/** Changed hex lines shown before the rest fold behind "+N more". */
const MAX_LINES = 8;
/** Longer runs of unchanged decoded lines fold into one. */
const MAX_UNCHANGED = 3;

const toneClass = { added: "text-green-400", removed: "text-red-400" };
const changedByteClass = { added: "bg-green-500/25 text-green-300", removed: "bg-red-500/25 text-red-300" };
const lineClass = { added: "bg-green-500/10", removed: "bg-red-500/10", changed: "bg-yellow-500/10" };

// Every version is shown, so every one needs the value before it.
const allRows = () => true;

/** A box value (base64); null where the box did not exist, undefined while unknown. */
function valueOf(snapshot: Snapshot | undefined): string | null | undefined {
  if (snapshot === undefined) return undefined;
  if (snapshot === null) return null;
  return (snapshot.value as BytesLeaf).$bytes;
}

function byteLength(b64: string | null): number {
  return b64 === null ? 0 : Buffer.from(b64, "base64").length;
}

function Gutter({ tone }: { tone?: "added" | "removed" }) {
  return (
    <span className={cn("inline-block w-3.5 -ml-3.5", tone && toneClass[tone])}>
      {tone === "added" ? "+" : tone === "removed" ? "−" : ""}
    </span>
  );
}

function useHexRow(): number {
  const [wide, setWide] = useState(() => window.matchMedia(WIDE_HEX).matches);
  useEffect(() => {
    const query = window.matchMedia(WIDE_HEX);
    const onChange = () => setWide(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return wide ? 16 : 8;
}

function hex(byte: number): string {
  return byte.toString(16).padStart(2, "0");
}

function ascii(byte: number): string {
  return byte >= 0x20 && byte < 0x7f ? String.fromCharCode(byte) : "·";
}

/**
 * One side of a hex dump line, the bytes that differ from `other` highlighted;
 * where `other` has no bytes on this line (created, deleted, resized), the
 * whole line is new or gone, so it just takes its tone.
 */
function HexLine({ offset, bytes, other, tone, row }: {
  offset: number; bytes: Uint8Array; other: Uint8Array; tone: "added" | "removed"; row: number;
}) {
  const cells = Array.from({ length: row }, (_, i) => i);
  const byteClass = (i: number) =>
    !other.length ? toneClass[tone] : i >= other.length || bytes[i] !== other[i] ? changedByteClass[tone] : "text-muted-foreground";
  return (
    <div className="whitespace-pre">
      <Gutter tone={tone} />
      <span className="text-muted-foreground">{offset.toString(16).padStart(4, "0")}  </span>
      {cells.map((i) => (
        <React.Fragment key={i}>
          <span className={i < bytes.length ? byteClass(i) : undefined}>{i < bytes.length ? hex(bytes[i]) : "  "}</span>
          {i === row / 2 - 1 ? "  " : " "}
        </React.Fragment>
      ))}
      {" "}
      {cells.map((i) => (i < bytes.length ? (
        <span key={i} className={byteClass(i)}>
          {ascii(bytes[i])}
        </span>
      ) : null))}
    </div>
  );
}

type HexItem = { offset: number; before: Uint8Array; after: Uint8Array } | { unchanged: number };

/** The lines of a hex dump that changed, with each run of unchanged bytes between them counted. */
function hexItems(before: Uint8Array, after: Uint8Array, row: number): HexItem[] {
  const items: HexItem[] = [];
  let unchanged = 0;
  for (let offset = 0; offset < Math.max(before.length, after.length); offset += row) {
    const b = before.subarray(offset, offset + row);
    const a = after.subarray(offset, offset + row);
    if (b.length === a.length && b.every((x, i) => x === a[i])) {
      unchanged += b.length;
      continue;
    }
    if (unchanged) items.push({ unchanged });
    unchanged = 0;
    items.push({ offset, before: b, after: a });
  }
  if (unchanged) items.push({ unchanged });
  return items;
}

/** A long value's changed bytes, as old and new hex dump lines. */
function HexDiff({ before, after }: { before: Uint8Array; after: Uint8Array }) {
  const [showAll, setShowAll] = useState(false);
  const row = useHexRow();
  const items = useMemo(() => hexItems(before, after, row), [before, after, row]);
  const shown = showAll ? items : items.slice(0, MAX_LINES);
  return (
    <div className="font-mono text-[12px] leading-5 pl-3.5 overflow-x-auto">
      {shown.map((item, i) =>
        "unchanged" in item ? (
          <div key={`skip-${i}`} className="text-muted-foreground">
            ⋯ {item.unchanged.toLocaleString()} unchanged {item.unchanged === 1 ? "byte" : "bytes"}
          </div>
        ) : (
          <div key={item.offset}>
            {item.before.length ? <HexLine offset={item.offset} bytes={item.before} other={item.after} tone="removed" row={row} /> : null}
            {item.after.length ? <HexLine offset={item.offset} bytes={item.after} other={item.before} tone="added" row={row} /> : null}
          </div>
        ),
      )}
      {items.length > shown.length ? (
        <button type="button" className="text-primary hover:underline cursor-pointer" onClick={() => setShowAll(true)}>
          +{(items.length - shown.length).toLocaleString()} more
        </button>
      ) : null}
    </div>
  );
}

type DecodedLine =
  | { kind: "unchanged" | "added" | "removed"; entry: DecodedEntry }
  | { kind: "changed"; before: DecodedEntry; after: DecodedEntry };

function sameEntry(a: DecodedEntry, b: DecodedEntry): boolean {
  return a.type === b.type && a.indent === b.indent && a.value === b.value && a.base64Value === b.base64Value;
}

/** Decoded lines paired by position: the same type at the same place is one line, changed or not. */
function decodedLines(before: DecodedEntry[] | null, after: DecodedEntry[] | null): DecodedLine[] {
  const lines: DecodedLine[] = [];
  for (let i = 0; i < Math.max(before?.length ?? 0, after?.length ?? 0); i++) {
    const b = before?.[i];
    const a = after?.[i];
    if (b && a && sameEntry(b, a)) {
      lines.push({ kind: "unchanged", entry: a });
    } else if (b && a && b.type === a.type && b.indent === a.indent) {
      lines.push({ kind: "changed", before: b, after: a });
    } else {
      if (b) lines.push({ kind: "removed", entry: b });
      if (a) lines.push({ kind: "added", entry: a });
    }
  }
  return lines;
}

function hasValue(entry: DecodedEntry): boolean {
  return !!(entry.base64Value || entry.value);
}

/** The value decoded with the ARC-4 types set for this app's boxes, line by line, the changed lines marked. */
function DecodedDiff({ before, after }: { before: DecodedEntry[] | null; after: DecodedEntry[] | null }) {
  const [showAll, setShowAll] = useState(false);
  const lines = useMemo(() => decodedLines(before, after), [before, after]);

  // Fold long runs of unchanged lines, so the changes stay together.
  const items: (DecodedLine | { unchanged: number })[] = [];
  for (let i = 0; i < lines.length; ) {
    let j = i;
    while (j < lines.length && lines[j].kind === "unchanged") j++;
    if (j - i > MAX_UNCHANGED && !showAll) {
      items.push({ unchanged: j - i });
      i = j;
    } else {
      items.push(lines[i]);
      i++;
    }
  }

  return (
    <div className="font-mono text-[12px] leading-5 pl-3.5 min-w-0 wrap-anywhere">
      {items.map((item, i) => {
        if ("unchanged" in item) {
          return (
            <button key={i} type="button" className="block text-muted-foreground hover:text-primary cursor-pointer" onClick={() => setShowAll(true)}>
              ⋯ {item.unchanged} unchanged lines
            </button>
          );
        }
        const entry = item.kind === "changed" ? item.after : item.entry;
        const tone = item.kind === "added" || item.kind === "removed" ? item.kind : undefined;
        return (
          <div key={i} className={cn("-mx-1 px-1 rounded-sm", item.kind !== "unchanged" && lineClass[item.kind])}>
            <div style={{ paddingLeft: entry.indent * 16 }} className={tone && toneClass[tone]}>
              <Gutter tone={tone} />
              <span className={tone ? undefined : "text-muted-foreground"}>{entry.type}</span>
              {item.kind === "changed" ? (
                <>
                  :{" "}
                  <span className="inline-flex flex-wrap items-center gap-x-1.5">
                    <span className="text-red-400 line-through decoration-red-400/60">
                      <DecodedEntryValue entry={item.before} copy={false} />
                    </span>
                    <span className="text-muted-foreground">→</span>
                    <span className="text-green-400">
                      <DecodedEntryValue entry={item.after} copy={false} />
                    </span>
                  </span>
                </>
              ) : hasValue(entry) ? (
                <>
                  : <DecodedEntryValue entry={entry} copy={false} />
                </>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * What a version did to the value: decoded with the box value types where
 * they fit both sides, whole for short values, else the changed hex lines.
 */
function BoxValueDiff({ before, after, types }: { before: string | null; after: string | null; types?: string[] }) {
  const decoded = useMemo(() => {
    if (!types?.length) return null;
    const b = before === null ? null : decodeBoxValue(before, types);
    const a = after === null ? null : decodeBoxValue(after, types);
    if ((before !== null && !b) || (after !== null && !a)) return null;
    return { before: b?.entries ?? null, after: a?.entries ?? null };
  }, [before, after, types]);

  const bytes = useMemo(
    () => ({
      before: new Uint8Array(Buffer.from(before ?? "", "base64")),
      after: new Uint8Array(Buffer.from(after ?? "", "base64")),
    }),
    [before, after],
  );

  if (before === null && after === null) return null;
  if (decoded) return <DecodedDiff before={decoded.before} after={decoded.after} />;

  if (bytes.before.length <= SHORT_VALUE && bytes.after.length <= SHORT_VALUE) {
    const change: Change =
      before === null
        ? { path: [], kind: "added", after: { $bytes: after } }
        : after === null
          ? { path: [], kind: "removed", before: { $bytes: before } }
          : { path: [], kind: "changed", before: { $bytes: before }, after: { $bytes: after } };
    return <JsonDiffTree value={{ $change: change }} />;
  }
  return <HexDiff before={bytes.before} after={bytes.after} />;
}

function SizeNote({ before, after }: { before: string | null; after: string | null }) {
  if (after === null) return null;
  const [from, to] = [byteLength(before), byteLength(after)];
  return (
    <span className="text-xs text-muted-foreground">
      {before !== null && from !== to ? `${from.toLocaleString()} → ` : ""}
      {to.toLocaleString()} {to === 1 ? "byte" : "bytes"}
    </span>
  );
}

function BoxVersionItem({ row, appId, name, types }: { row: VersionRow<TTBoxVersion>; appId: number; name: string; types?: string[] }) {
  const object = row.objects[0];
  const summary = useMemo(() => summarizeObject(object), [object]);
  const before = valueOf(object.before);
  const after = valueOf(object.after);

  return (
    <div className="border-t border-border pt-3 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1.5 text-sm">
        <span>
          Round <LinkToBlock id={row.round} />
        </span>
        <span className="text-muted-foreground">
          <MultiDateViewer timestamp={row.timestamp} block={row.round} variant="short" />
        </span>
        <StatusChip summary={summary} />
        {before !== undefined ? <SizeNote before={before} after={after} /> : null}
        <span className="ml-auto flex gap-3">
          <FindTxnsLink
            href={withTxnRound(`/application/${appId}/transactions`, row.round)}
            title="The app's transactions in this round"
          />
          {after !== null ? (
            <Link
              href={withRound(`/application/${appId}/boxes/${encodeURIComponent(name)}`, row.round)}
              className="text-xs"
              title="This box as it was at this round"
            >
              <History size={12} className="inline -mt-0.5 mr-1" />
              rewind
            </Link>
          ) : null}
        </span>
      </div>
      {summary.status === "pending" ? (
        <div className="h-4 w-40 my-0.5 rounded bg-muted animate-pulse" />
      ) : summary.status === "error" ? (
        <span className="text-red-400 text-xs">Previous value unavailable: {summary.error}</span>
      ) : (
        <BoxValueDiff before={before} after={after} types={types} />
      )}
    </div>
  );
}

/**
 * A box's versions from the time-travel node, up to `round` where the page
 * shows one: each with what it did to the value. `types` are the ARC-4 types
 * set for the app's box values, to compare them decoded.
 */
export default function BoxHistory({ appId, name, round, types }: { appId: number; name: string; round?: number; types?: string[] }) {
  const [order, setOrder] = useVersionsOrder();
  const { data, error, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage, isFetchNextPageError } =
    useBoxVersions(appId, name, round, order);

  const versions = useMemo(() => data?.pages.flatMap((p) => p.versions) ?? [], [data]);
  const ctx = useMemo<BaselineContext>(() => ({ kind: "box", appId, name }), [appId, name]);
  const rows = useVersionRows(ctx, versions, boxVersionTouches, !!hasNextPage, allRows, order);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return <div className="text-muted-foreground">Version history unavailable: {(error as Error)?.message}</div>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <OrderButton order={order} onChange={setOrder} />
        <span className="text-sm text-muted-foreground">
          {rows.length.toLocaleString()}
          {hasNextPage ? "+" : ""} {rows.length === 1 && !hasNextPage ? "version" : "versions"}
        </span>
      </div>
      {rows.length ? (
        <div className="flex flex-col gap-3">
          {rows.map((row) => (
            <BoxVersionItem key={row.round} row={row} appId={appId} name={name} types={types} />
          ))}
        </div>
      ) : (
        <div className="text-muted-foreground">No versions</div>
      )}
      {isFetchNextPageError ? (
        <div className="text-red-400 text-xs">Could not load more versions: {(error as Error)?.message}</div>
      ) : null}
      {hasNextPage ? (
        <div>
          <Button variant="outline" size="sm" className="border-border text-primary hover:bg-primary/10" disabled={isFetchingNextPage} onClick={() => fetchNextPage()}>
            {isFetchingNextPage ? <Loader2 className="animate-spin" /> : null}
            {order === "desc" ? "Load older versions" : "Load newer versions"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
