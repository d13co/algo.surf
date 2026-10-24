import React, { useEffect, useMemo, useState } from "react";
import { cn } from "src/lib/utils";
import JsonDiffTree from "src/components/v2/JsonDiffTree";
import type { Change } from "src/utils/versionDelta";
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

export function byteLength(b64: string | null): number {
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

/** ARC-4 types that decode to an integer (a ufixed to its raw count). */
const INTEGER_TYPE = /^(uint\d+|ufixed\d+x\d+|byte)$/;

/** How much a decoded integer changed by, "(+2740329747)"; null where the line is not an integer's. */
function integerDelta(before: DecodedEntry, after: DecodedEntry): string | null {
  if (!INTEGER_TYPE.test(after.type) || !/^\d+$/.test(before.value) || !/^\d+$/.test(after.value)) return null;
  const d = BigInt(after.value) - BigInt(before.value);
  // Unseparated, as the values are.
  return `(${d > 0n ? "+" : ""}${d})`;
}

/**
 * A value decoded with the ARC-4 types set for the app's boxes, line by line,
 * the changed lines marked, integers with how much they changed by. Long runs
 * of unchanged lines fold, unless `full`.
 */
export function DecodedDiff({ before, after, full = false }: { before: DecodedEntry[] | null; after: DecodedEntry[] | null; full?: boolean }) {
  const [showAll, setShowAll] = useState(full);
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
        const delta = item.kind === "changed" ? integerDelta(item.before, item.after) : null;
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
                    {delta ? <span className="text-muted-foreground">{delta}</span> : null}
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
 * A box's value before and after (base64; null where there was none) decoded
 * with `types`; null where they are unset or do not fit both sides.
 */
export function useDecodedBoxValues(before: string | null, after: string | null, types?: string[]) {
  return useMemo(() => {
    if (!types?.length || (before === null && after === null)) return null;
    const b = before === null ? null : decodeBoxValue(before, types);
    const a = after === null ? null : decodeBoxValue(after, types);
    if ((before !== null && !b) || (after !== null && !a)) return null;
    return { before: b?.entries ?? null, after: a?.entries ?? null };
  }, [before, after, types]);
}

/**
 * What a version did to a box value: decoded with the box value types where
 * they fit both sides, whole for short values, else the changed hex lines.
 */
export function BoxValueDiff({ before, after, types }: { before: string | null; after: string | null; types?: string[] }) {
  const decoded = useDecodedBoxValues(before, after, types);

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

/** A box value's size, and what it was where that changed. */
export function SizeNote({ before, after }: { before: string | null; after: string | null }) {
  if (after === null) return null;
  const [from, to] = [byteLength(before), byteLength(after)];
  return (
    <span className="text-xs text-muted-foreground">
      {before !== null && from !== to ? `${from.toLocaleString()} → ` : ""}
      {to.toLocaleString()} {to === 1 ? "byte" : "bytes"}
    </span>
  );
}
