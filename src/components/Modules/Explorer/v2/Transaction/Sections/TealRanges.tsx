import React, { memo, useCallback, useMemo, useRef } from "react";
import { cn } from "src/lib/utils";
import { BpGutter } from "./BpGutter";
import { splitSub, type SourceMapping, type SrcLine } from "src/utils/arc56Source";
import { lineBpKey } from "src/utils/sourceStepper";
import { isMethodLine } from "src/utils/sourceRows";
import { fileLines, lineText, srcKey, type TealRange } from "src/utils/tealRanges";

/**
 * The TEAL view's source column: each range of ops from one source line
 * (see tealRanges) with the line beside it, joined by a ribbon that narrows
 * from the ops to the line, a band at each subroutine, and hovering a line
 * (or an op's aside chip, or a ribbon) lights up every op it gave. In a
 * narrow panel, the line sits above its ops instead.
 */

// Below 34rem of panel width (@max-[34rem], written out in full for Tailwind to see), the line goes above its ops.

const SubBand = memo(function SubBand({ header }: { header: string }) {
  const { name, sig } = splitSub(header);
  return (
    <div className="mt-1.5 flex items-baseline gap-3 border-t border-border/40 px-3 pt-1 pb-0.5 font-mono text-[11.5px] leading-5" title={header}>
      <span className="min-w-0 shrink-0 truncate text-primary">{name}</span>
      <span className={"ml-auto min-w-0 truncate text-muted @max-[34rem]:hidden"}>{sig}</span>
    </div>
  );
});

/** Every op and label row is this tall (leading-5), so a range's ops are 20px a row. */
const ROW = 20;
/** The ribbon's width, in px: its column's width. */
const RIB = 28;

/** A range's shade: the current op's range, every other range a touch lighter so neighbours part, or no line. */
type Tone = "cur" | "alt" | "base" | "none";
// Written out in full for Tailwind to see. The current range takes the current op row's colour.
const FILL: Record<Tone, string> = { cur: "fill-primary/25", alt: "fill-white/[0.06]", base: "fill-white/[0.11]", none: "fill-white/[0.035]" };
const BG: Record<Tone, string> = { cur: "bg-primary/25", alt: "bg-white/[0.06]", base: "bg-white/[0.11]", none: "bg-white/[0.035]" };

/**
 * A range's ribbon: from the whole height of its ops on the left, curving in
 * to its line's rows on the right, as a Sankey diagram joins a flow to a
 * node (the line's rows, in the same shade). Drawn to the range's row
 * counts, so it fits its ops and its line without measuring them.
 */
const Ribbon = memo(function Ribbon({ rows, lines = 1, tone, line }: {
  rows: number;
  /** Its line's rows: one, or each line of a range the TEAL quotes. */
  lines?: number;
  tone: Tone;
  /** Its line's key: hovering the ribbon lights up the line, and the line lights it up. */
  line?: string;
}) {
  // The taller side sets the row's height.
  const h = Math.max(rows, lines) * ROW;
  // A half-pixel inset at each end, so neighbouring ribbons part.
  const top = 0.5;
  const bot = rows * ROW - 0.5;
  const end = lines * ROW - 0.5;
  const mid = RIB / 2;
  const d = `M0,${top} L${RIB},${top} L${RIB},${end} C${mid},${end} ${mid},${bot} 0,${bot} Z`;
  return (
    <div className="relative min-w-0 @max-[34rem]:hidden" data-src-l={line}>
      <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${RIB} ${h}`} preserveAspectRatio="none" aria-hidden="true">
        <path d={d} className={FILL[tone]} />
        {/* Clear until its line is hovered: then tinted over the shade, as the line's row and ops are. */}
        <path d={d} data-rib={line} fill="transparent" />
      </svg>
    </div>
  );
});

/** The most lines a range shows in the source column; the rest are "+N", and all of them are in its tooltip. */
const MAX_LINES = 8;

/** A source line's text: each line the TEAL quotes of a range, or its one line. */
const allLines = (l: SrcLine) => (l.quoted?.length ? l.quoted : [l.text]);

/** A source line's rows in the source column: its lines, up to MAX_LINES. */
const shownLines = (l: SrcLine) => allLines(l).slice(0, MAX_LINES);

/** A quoted line's indent, past the least of its range's. */
function indent(l: SrcLine, i: number, base: number): React.CSSProperties | undefined {
  if (!l.quoted?.[i]) return undefined;
  const n = (l.indents?.[i] ?? 0) - base;
  return n > 0 ? { paddingLeft: `${n}ch` } : undefined;
}

/** A range's cell in the source column: its line (each line of a range), or why it has none. */
const RangeSrc = memo(function RangeSrc({ r, text, k, cur, tone, bp, ran, match, onBp, onRun, onPart }: {
  r: TealRange;
  /** Its line's text (see lineText); empty when neither the spec nor a source file has it. */
  text: string;
  k: number;
  cur: boolean;
  tone: Tone;
  bp: boolean;
  ran: boolean;
  /** One of the range's own ops is a find bar hit: marked as SourcePanel marks a line. */
  match: boolean;
  onBp: (pcs: number[]) => void;
  onRun: (pcs: number[]) => void;
  onPart: (k: number) => void;
}) {
  // Wide, the ribbon joins the cell to its ops; narrow, a rule above the line parts the ranges.
  const rule = cn(
    "min-w-0",
    "@max-[34rem]:order-first @max-[34rem]:border-t @max-[34rem]:border-dashed",
    // Narrow, the current range keeps its colour on the rule above it.
    cur ? "@max-[34rem]:border-primary" : "@max-[34rem]:border-white/[0.08]",
  );
  const l = r.line;
  if (!l) {
    return (
      <div className={rule}>
        <div
          className={cn(
            "sticky top-0 truncate pr-2 pl-[calc(0.75rem+4ch+0.75rem)] text-[11.5px] leading-5 italic text-muted @max-[34rem]:static",
            BG[tone],
            match && "shadow-[inset_2px_0_0_#fb923c]",
          )}
          title={r.library ? `No source line: code from ${r.library}, outside the contract's files` : "No source line: ops the compiler added (constant blocks, a subroutine's prologue, routing)"}
        >
          {r.library ? `library code · ${r.library}` : "added by the compiler"}
        </div>
      </div>
    );
  }
  const key = srcKey(l);
  const more = l.end !== undefined ? l.end - l.line : 0;
  const all = allLines(l);
  const texts = all.slice(0, MAX_LINES);
  // A range's lines not shown: past MAX_LINES, or not quoted (a later location cut the quote short).
  const rest = more + 1 - texts.length;
  // The least indent of the lines with text: a blank line's 0 doesn't count.
  const base = Math.min(...all.flatMap((t, i) => (t ? [l.indents?.[i] ?? 0] : [])), 0x7fffffff);
  // A quoted comment line (`// …`, or Python's `# …`) is dimmed like a comment.
  const comment = (t: string) => t.startsWith("//") || (/\.py$/i.test(l.file) && t.startsWith("#"));
  const tint = (t: string) =>
    isMethodLine(t) ? "font-medium text-primary" : comment(t) ? "italic text-muted" : cur ? "text-foreground" : "text-muted-foreground";
  // The line, and for TEALScript's quote of part of it, that part: what its ops do. A range's lines keep their indent.
  const said = !text
    ? "The spec doesn't quote this line, and no added source file has it."
    : l.quoted && (!l.part || l.quoted.length > 1)
      ? l.quoted.map((t, i) => " ".repeat(Math.max(0, (l.indents?.[i] ?? 0) - base)) + t).join("\n")
      : l.part && l.text && l.text !== text
        ? `${text}\n\nIts ops: ${l.text}`
        : text;
  const where = `${l.file}:${l.line}${more ? `-${l.end}` : ""}\n${said}`;
  return (
    <div className={rule}>
      <div
        data-src-l={key}
        data-l={key}
        className={cn(
          "group/row sticky top-0 grid grid-cols-[0.75rem_4ch_minmax(0,1fr)_auto] items-start gap-x-1.5 pr-2 pl-1 font-mono text-[12px] leading-5",
          "@max-[34rem]:static @max-[34rem]:pl-[calc(1.25rem+4ch+0.5rem)]",
          BG[tone],
          !ran && "opacity-60",
          match && "shadow-[inset_2px_0_0_#fb923c]",
        )}
        onDoubleClick={ran ? () => (window.getSelection()?.removeAllRanges(), onRun(l.pcs)) : undefined}
        title={`${where}${ran ? "\n\nDouble-click to run to this line" : "\n\nNever ran"}`}
      >
        <BpGutter on={bp} small note={`${where}\n`} label={bp ? `Remove the breakpoint on line ${l.line}` : `Stop at line ${l.line}`} onClick={() => onBp(l.pcs)} className={cn("h-5 text-right", match ? "text-orange-400" : "text-muted")}>
          {l.line}
        </BpGutter>
        <span className={cn("min-w-0 truncate", tint(text))} style={indent(l, 0, base)}>
          {text || <span className="italic text-muted">not quoted</span>}
          {texts.length === 1 && rest > 0 ? <span className="ml-1.5 text-muted">+{rest}</span> : null}
        </span>
        {r.parts > 1 ? (
          <button
            type="button"
            className="mt-0.5 rounded-[3px] border border-white/15 px-1 text-[10.5px] leading-4 text-muted hover:text-foreground cursor-pointer"
            title={`This line's ops are in ${r.parts} places. Go to the next`}
            onClick={() => onPart(k)}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            {r.part}/{r.parts}
          </button>
        ) : (
          <span />
        )}
        {texts.slice(1).map((text, j) => (
          <React.Fragment key={j}>
            <span />
            <span className="text-right text-muted">{l.line + j + 1}</span>
            <span className={cn("min-w-0 truncate", tint(text))} style={indent(l, j + 1, base)}>
              {text}
              {j === texts.length - 2 && rest > 0 ? <span className="ml-1.5 text-muted">+{rest}</span> : null}
            </span>
            <span />
          </React.Fragment>
        ))}
      </div>
    </div>
  );
});

/** An op's chip for a line folded into another's range: where it came from. */
export function AsideChip({ line }: { line: SrcLine }) {
  const key = srcKey(line);
  return (
    <span
      data-src-l={key}
      data-l={key}
      className="ml-2 rounded-[3px] border border-dashed border-primary/45 px-1 text-[10.5px] text-muted-foreground"
      title={`From line ${line.line}: ${line.text}`}
    >
      :{line.line} {line.text.length > 18 ? `${line.text.slice(0, 18)}…` : line.text}
    </span>
  );
}

export function RangedTeal({ hash, map, sources, ranges, curRange, hitRanges, hm, lineBps, onLineBp, onRunLine, renderOps }: {
  hash: string;
  map: SourceMapping;
  /** The source files added to the spec, by path (see lineText). */
  sources?: Record<string, string>;
  ranges: TealRange[];
  /** The range of the current op, or -1. */
  curRange: number;
  /** The ranges with a find bar hit among their own ops. */
  hitRanges?: Set<number>;
  /** Hits by pc. */
  hm: Map<number, number>;
  lineBps: Set<string>;
  onLineBp: (pcs: number[]) => void;
  onRunLine: (pcs: number[]) => void;
  renderOps: (r: TealRange) => React.ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  // The hovered line's highlight is one CSS rule, written straight to the style element:
  // hovering never re-renders the listing, only the rule changes.
  const hlStyle = useRef<HTMLStyleElement>(null);
  const hlRef = useRef<string>();
  const setHl = useCallback((v?: string) => {
    if (v === hlRef.current) return;
    hlRef.current = v;
    if (!hlStyle.current) return;
    // A background image, so it tints over the current row's colour and leaves the find bar's inset shadow showing.
    hlStyle.current.textContent = v
      ? `[data-teal-src] [data-l="${CSS.escape(v)}"]{background-image:linear-gradient(rgb(252 211 77 / 0.13),rgb(252 211 77 / 0.13))}` +
        `[data-teal-src] [data-rib="${CSS.escape(v)}"]{fill:rgb(252 211 77 / 0.13)}`
      : "";
  }, []);
  const ran = useMemo(() => new Set(map.lines.filter((l) => l.pcs.some((pc) => hm.get(pc)))), [map, hm]);
  const files = useMemo(() => fileLines(sources), [sources]);

  // Stable handlers, so the cells don't re-render on every step.
  const runRef = useRef(onRunLine);
  runRef.current = onRunLine;
  const onRun = useCallback((pcs: number[]) => runRef.current(pcs), []);
  const bpRef = useRef(onLineBp);
  bpRef.current = onLineBp;
  const onBp = useCallback((pcs: number[]) => bpRef.current(pcs), []);
  const rangesRef = useRef(ranges);
  rangesRef.current = ranges;
  const onPart = useCallback((k: number) => {
    const rs = rangesRef.current;
    const l = rs[k].line;
    if (!l) return;
    let j = (k + 1) % rs.length;
    while (rs[j].line !== l) j = (j + 1) % rs.length;
    const el = box.current?.querySelector<HTMLElement>(`[data-range="${j}"]`);
    const pane = box.current?.parentElement;
    if (el && pane) pane.scrollTop = Math.max(0, el.offsetTop - pane.clientHeight / 3);
    setHl(srcKey(l));
  }, [setHl]);

  const onOver = (e: React.MouseEvent) => setHl((e.target as HTMLElement).closest<HTMLElement>("[data-src-l]")?.dataset.srcL);

  return (
    <div ref={box} data-teal-src="" onMouseOver={onOver} onMouseLeave={() => setHl(undefined)}>
      {/* One rule lights up the hovered line's ops, so the rows themselves don't re-render. */}
      <style ref={hlStyle} />
      {ranges.map((r, k) => {
        const l = r.line;
        const tone: Tone = k === curRange ? "cur" : !l ? "none" : k % 2 === 1 ? "alt" : "base";
        return (
          <React.Fragment key={r.first}>
            {r.sub ? <SubBand header={r.sub} /> : null}
            <div data-range={k} className={"grid grid-cols-[minmax(0,1fr)_1.75rem_minmax(0,44%)] @max-[34rem]:grid-cols-1"}>
              <div className="min-w-0">{renderOps(r)}</div>
              <Ribbon
                rows={r.last - r.first + 1}
                lines={l ? shownLines(l).length : 1}
                tone={tone}
                line={l ? srcKey(l) : undefined}
              />
              <RangeSrc
                r={r}
                text={l ? lineText(l, files) : ""}
                k={k}
                cur={k === curRange}
                tone={tone}
                bp={!!l && lineBps.has(lineBpKey(hash, l.pcs))}
                ran={!l || ran.has(l)}
                match={!!hitRanges?.has(k)}
                onBp={onBp}
                onRun={onRun}
                onPart={onPart}
              />
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}
