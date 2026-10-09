import React, { useMemo, useState } from "react";
import sha512 from "js-sha512";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "src/lib/utils";
import MultiFormatViewer from "src/components/v2/MultiFormatViewer";
import {
  Change,
  DJson,
  displayTealKey,
  isBytesLeaf,
  isChangeLeaf,
  isPlainObject,
  isProgramLeaf,
  isTealKeySegment,
} from "src/utils/versionDelta";

/**
 * JSON tree for version deltas. react-json-view (behind JsonViewer) cannot
 * style individual nodes, so this renders changes itself: `old → new` for a
 * changed value, green for added, red for removed. Feed it a delta tree (only
 * the changed paths) or a whole state with the changes overlaid
 * (`overlayChanges`); unchanged branches past `collapseDepth` start collapsed.
 */

type Tone = "added" | "removed" | undefined;

/** An integer read as an amount: `decimals` places, in `unit`. */
export type NumberFormat = { decimals: number; unit?: string };

/** The format of the integer at `path` (keys from the root), where it has one. */
export type NumberFormatOf = (path: string[]) => NumberFormat | undefined;

type Options = {
  collapseDepth: number;
  maxChildren: number;
  truncateAt: number;
  numberFormat?: NumberFormatOf;
};

const toneClass: Record<NonNullable<Tone>, string> = {
  added: "text-green-400",
  removed: "text-red-400",
};

const changeRowClass: Record<Change["kind"], string> = {
  added: "bg-green-500/10",
  removed: "bg-red-500/10",
  changed: "bg-yellow-500/10",
};

function containsChange(v: unknown): boolean {
  if (isChangeLeaf(v)) return true;
  return isPlainObject(v) && Object.values(v).some(containsChange);
}

function entriesOf(v: DJson | object): [string, any][] {
  return Array.isArray(v) ? v.map((x, i): [string, any] => [String(i), x]) : Object.entries(v);
}

function isBranch(v: unknown): boolean {
  return Array.isArray(v) || (isPlainObject(v) && !isChangeLeaf(v));
}

function isInteger(v: unknown): v is number | bigint {
  return typeof v === "bigint" || (typeof v === "number" && Number.isInteger(v));
}

/** A count of 10^-decimals units, exact at any size: (1234500, 6) → "1.2345". */
function formatUnits(v: number | bigint, decimals: number): string {
  const n = BigInt(v);
  const digits = (n < 0n ? -n : n).toString().padStart(decimals + 1, "0");
  const cut = digits.length - decimals;
  const whole = digits.slice(0, cut).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fraction = digits.slice(cut).replace(/0+$/, "");
  return `${n < 0n ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

function Program({ b64 }: { b64: string }) {
  const [size, hash] = useMemo(() => {
    const bytes = Buffer.from(b64, "base64");
    return [bytes.length, sha512.sha512_256(new Uint8Array(bytes))];
  }, [b64]);
  return (
    <span title={`sha512/256 ${hash}`}>
      ‹{size.toLocaleString()} B · {hash.slice(0, 8)}›
    </span>
  );
}

function Str({ value, truncateAt }: { value: string; truncateAt: number }) {
  const [full, setFull] = useState(false);
  if (value.length <= truncateAt) return <span>"{value}"</span>;
  return (
    <span
      className="cursor-pointer break-all"
      title={full ? "Click to shorten" : "Click to show all"}
      onClick={() => setFull((f) => !f)}
    >
      "{full ? value : `${value.slice(0, truncateAt)}…`}"
    </span>
  );
}

/** An integer, as an amount where it has a format, with the raw count on hover. */
function Int({ value, format, unit = true }: { value: number | bigint; format?: NumberFormat; unit?: boolean }) {
  if (!format) return <span>{String(value)}</span>;
  return (
    <span title={String(value)}>
      {formatUnits(value, format.decimals)}
      {unit && format.unit ? <span className="opacity-70"> {format.unit}</span> : null}
    </span>
  );
}

/** How much an integer changed by, in its format: "(+1.5)". */
function IntDelta({ before, after, format }: { before: number | bigint; after: number | bigint; format?: NumberFormat }) {
  const d = BigInt(after) - BigInt(before);
  return (
    <span className="text-muted-foreground">
      ({d > 0n ? "+" : ""}
      {format ? formatUnits(d, format.decimals) : String(d)})
    </span>
  );
}

function Leaf({ value, path, opts, unit }: { value: DJson; path: string[]; opts: Options; unit?: boolean }) {
  if (isBytesLeaf(value)) {
    if (!value.$bytes) return <span>""</span>;
    return <MultiFormatViewer view="auto" includeNum="auto" side="left" value={value.$bytes} />;
  }
  if (isProgramLeaf(value)) return <Program b64={value.$program} />;
  if (typeof value === "string") return <Str value={value} truncateAt={opts.truncateAt} />;
  if (value === null || value === undefined) return <span>null</span>;
  if (isInteger(value)) return <Int value={value} format={opts.numberFormat?.(path)} unit={unit} />;
  return <span>{String(value)}</span>;
}

function Key({ name, parent }: { name?: string; parent?: string }) {
  if (name === undefined) return null;
  const teal = isTealKeySegment(parent);
  return (
    <span className="text-muted-foreground" title={teal ? `base64: ${name}` : undefined}>
      {teal ? displayTealKey(name) : name}:{" "}
    </span>
  );
}

function Children({
  value,
  path,
  depth,
  parent,
  tone,
  opts,
}: {
  value: any;
  path: string[];
  depth: number;
  parent?: string;
  tone: Tone;
  opts: Options;
}) {
  const entries = entriesOf(value);
  const [showAll, setShowAll] = useState(false);
  // Keep changed entries in view when trimming.
  const shown = showAll || entries.length <= opts.maxChildren
    ? entries
    : [...entries.filter(([, v]) => containsChange(v)), ...entries.filter(([, v]) => !containsChange(v))].slice(0, opts.maxChildren);
  const hidden = entries.length - shown.length;
  return (
    <>
      {shown.map(([k, v]) => (
        <Node key={k} name={k} parent={parent} path={[...path, k]} value={v} depth={depth} tone={tone} opts={opts} />
      ))}
      {hidden > 0 ? (
        <button
          type="button"
          className="text-primary hover:underline cursor-pointer"
          style={{ paddingLeft: depth ? 16 : 0 }}
          onClick={() => setShowAll(true)}
        >
          +{hidden} more
        </button>
      ) : null}
    </>
  );
}

function Branch({
  name,
  parent,
  path,
  value,
  depth,
  tone,
  opts,
}: {
  name?: string;
  parent?: string;
  path: string[];
  value: any;
  depth: number;
  tone: Tone;
  opts: Options;
}) {
  const [open, setOpen] = useState(() => depth < opts.collapseDepth || containsChange(value));
  const [openBrace, closeBrace] = Array.isArray(value) ? ["[", "]"] : ["{", "}"];
  const count = entriesOf(value).length;

  if (!count) {
    return (
      <div className={tone ? toneClass[tone] : undefined}>
        <Key name={name} parent={parent} />
        {openBrace}
        {closeBrace}
      </div>
    );
  }

  const Toggle = open ? ChevronDown : ChevronRight;
  return (
    <div className={tone ? toneClass[tone] : undefined}>
      <span className="cursor-pointer select-none" onClick={() => setOpen((o) => !o)}>
        <Toggle size={12} className="inline -ml-3.5 mr-0.5 opacity-60" />
        <Key name={name} parent={parent} />
        {open ? openBrace : (
          <span className="text-muted-foreground">
            {openBrace}…{closeBrace} {count} {count === 1 ? "key" : "keys"}
          </span>
        )}
      </span>
      {open ? (
        <>
          <div className="pl-4">
            <Children value={value} path={path} depth={depth + 1} parent={name} tone={tone} opts={opts} />
          </div>
          <div>{closeBrace}</div>
        </>
      ) : null}
    </div>
  );
}

/** A value under a tone: a branch or a leaf. */
function Valued({ name, parent, path, value, depth, tone, opts }: {
  name?: string; parent?: string; path: string[]; value: DJson; depth: number; tone: Tone; opts: Options;
}) {
  if (isBranch(value)) {
    return <Branch name={name} parent={parent} path={path} value={value} depth={depth} tone={tone} opts={opts} />;
  }
  return (
    <div className={tone ? toneClass[tone] : undefined}>
      <Key name={name} parent={parent} />
      <Leaf value={value} path={path} opts={opts} />
    </div>
  );
}

function ChangeNode({ name, parent, path, change, depth, opts }: {
  name?: string; parent?: string; path: string[]; change: Change; depth: number; opts: Options;
}) {
  const rowClass = cn("-mx-1 px-1 rounded-sm", changeRowClass[change.kind]);

  if (change.kind === "added" || change.kind === "removed") {
    const tone: Tone = change.kind;
    const value = change.kind === "added" ? change.after : change.before;
    // A whole object created or deleted: its fields, without a wrapper line.
    if (name === undefined && isBranch(value)) {
      return (
        <div className={toneClass[tone]}>
          <Children value={value} path={path} depth={depth} tone={tone} opts={opts} />
        </div>
      );
    }
    return (
      <div className={rowClass}>
        <span className={cn("inline-block w-3.5 -ml-3.5", toneClass[tone])}>{tone === "added" ? "+" : "−"}</span>
        <div className="inline-block align-top">
          <Valued name={name} parent={parent} path={path} value={value} depth={depth} tone={tone} opts={opts} />
        </div>
      </div>
    );
  }

  const nested = isBranch(change.before) || isBranch(change.after);
  // Integers also show by how much they changed; the unit, once, after the new value.
  const ints = isInteger(change.before) && isInteger(change.after);
  return (
    <div className={rowClass}>
      <Key name={name} parent={parent} />
      {nested ? (
        <div className="pl-4">
          <Valued path={path} value={change.before} depth={depth + 1} tone="removed" opts={opts} />
          <Valued path={path} value={change.after} depth={depth + 1} tone="added" opts={opts} />
        </div>
      ) : (
        <span className="inline-flex flex-wrap items-center gap-x-1.5">
          <span className="text-red-400 line-through decoration-red-400/60">
            <Leaf value={change.before} path={path} opts={opts} unit={!ints} />
          </span>
          <span className="text-muted-foreground">→</span>
          <span className="text-green-400">
            <Leaf value={change.after} path={path} opts={opts} />
          </span>
          {ints ? (
            <IntDelta
              before={change.before as number | bigint}
              after={change.after as number | bigint}
              format={opts.numberFormat?.(path)}
            />
          ) : null}
        </span>
      )}
    </div>
  );
}

function Node({ name, parent, path, value, depth, tone, opts }: {
  name?: string; parent?: string; path: string[]; value: any; depth: number; tone: Tone; opts: Options;
}) {
  if (isChangeLeaf(value)) {
    return <ChangeNode name={name} parent={parent} path={path} change={value.$change} depth={depth} opts={opts} />;
  }
  return <Valued name={name} parent={parent} path={path} value={value} depth={depth} tone={tone} opts={opts} />;
}

export default function JsonDiffTree({
  value,
  collapseDepth = 2,
  maxChildren = 8,
  truncateAt = 64,
  numberFormat,
  className,
}: {
  /** A delta tree (`buildDeltaTree`) or a state with changes overlaid (`overlayChanges`). */
  value: unknown;
  /** Unchanged branches at or past this depth start collapsed. */
  collapseDepth?: number;
  /** Children shown per branch before "+N more"; changed ones first. */
  maxChildren?: number;
  /** Strings longer than this are cut, and expand on click. */
  truncateAt?: number;
  /** Integers to read as amounts, by path. */
  numberFormat?: NumberFormatOf;
  className?: string;
}): JSX.Element {
  const opts = { collapseDepth, maxChildren, truncateAt, numberFormat };
  return (
    <div className={cn("font-mono text-[12px] leading-5 pl-3.5 min-w-0 wrap-anywhere", className)}>
      {isBranch(value) ? (
        <Children value={value} path={[]} depth={0} tone={undefined} opts={opts} />
      ) : (
        <Node value={value} path={[]} depth={0} tone={undefined} opts={opts} />
      )}
    </div>
  );
}
