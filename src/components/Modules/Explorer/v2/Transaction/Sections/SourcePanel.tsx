import React, { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import { cn } from "src/lib/utils";
import type { SourceMapping, SrcLine } from "src/utils/arc56Source";
import { checkSource } from "src/utils/sourceFiles";
import { fileRows, isMethodLine, quotedRows, type Row } from "src/utils/sourceRows";
import { lineBpKey, linePasses, parseLineBpKey } from "src/utils/sourceStepper";
import { bpKey, frameAt, lineText, type Frame, type Stepper } from "src/utils/traceStepper";
import type { TraceSource } from "./useTraceSource";
import { OpToken } from "src/components/Modules/Explorer/v2/TealCode";

/**
 * The source view of a program run, from its ARC-56 spec: the source
 * lines the spec's TEAL quotes, grouped by file, each with how many times it ran,
 * a breakpoint gutter, and its TEAL ops when expanded. With the spec's source
 * files added, whole files instead, one at a time (following the current
 * line), lines no op came from dimmed.
 */

const hitText = (h: number) => (!h ? "" : h > 999 ? `${Math.round(h / 100) / 10}k` : String(h));
const base = (path: string) => path.slice(path.lastIndexOf("/") + 1);

/** A TEAL op, its opcode brighter. */
function Op({ text }: { text: string }) {
  const t = text.trim();
  const sp = t.search(/\s/);
  return sp < 0 ? (
    <OpToken text={t}>{t}</OpToken>
  ) : (
    <>
      <OpToken text={t}>{t.slice(0, sp)}</OpToken>
      <span className="text-muted-foreground">{t.slice(sp)}</span>
    </>
  );
}

/** The current line's or op's marker, at the left of its number cell. */
const CurMark = () => (
  <span className="absolute left-0 text-primary" aria-label="current">
    ▶
  </span>
);

const Gutter = ({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) => (
  <button type="button" aria-label={label} className="group flex items-center justify-center cursor-pointer" onClick={onClick}>
    <span className={cn("h-2.5 w-2.5 rounded-full", on ? "bg-red-500" : "group-hover:bg-red-500/40")} />
  </button>
);

/**
 * A source line: its breakpoint gutter, hit count, TEAL ops switch, number
 * and text. `noOps`: a line no op came from, plain. `cont`: a later line of
 * the range `line` starts, marked and run to with it.
 */
const LineRow = memo(function LineRow({ line, k, text, noOps, cont, hits, bp, mark, match, open, onToggle, onBp, onRun }: {
  line: SrcLine;
  k: string;
  text?: string;
  noOps?: boolean;
  cont?: number;
  hits: number;
  bp: boolean;
  mark?: "cur" | "site";
  /** One of its ops is a find bar hit. */
  match?: boolean;
  open: boolean;
  onToggle: (k: string) => void;
  onBp: (pcs: number[]) => void;
  onRun: (pcs: number[]) => void;
}) {
  const shown = text ?? line.text;
  if (noOps) {
    // Grey, not dimmed like a line whose ops never ran: there is nothing to run here.
    return (
      <div data-k={k} className="grid grid-cols-[1.25rem_4ch_1rem_5ch_minmax(0,1fr)] gap-x-2 pr-2 font-mono text-[12px] leading-5 whitespace-pre [tab-size:2]">
        <span />
        <span />
        <span />
        <span className="text-right text-muted/50">{line.line}</span>
        <span className={cn("min-w-0 overflow-hidden text-ellipsis", isMethodLine(shown) ? "font-medium text-primary" : "text-muted/70")}>{shown}</span>
      </div>
    );
  }
  const run = hits ? () => (window.getSelection()?.removeAllRanges(), onRun(line.pcs)) : undefined;
  if (cont !== undefined) {
    return (
      <div
        data-k={k}
        className={cn(
          "grid grid-cols-[1.25rem_4ch_1rem_5ch_minmax(0,1fr)] gap-x-2 pr-2 font-mono text-[12px] leading-5 whitespace-pre [tab-size:2]",
          !hits && "opacity-60",
          mark === "cur" && "bg-primary/25",
          mark === "site" && "bg-primary/10",
          match && "shadow-[inset_2px_0_0_#fb923c]",
        )}
        onDoubleClick={run}
        title={`Part of the statement at line ${line.line}${hits ? ". Double-click to run to it" : ""}`}
      >
        <span />
        <span />
        <span className="text-center text-muted">┆</span>
        <span className="text-right text-muted">{cont}</span>
        <span className="min-w-0 overflow-hidden text-ellipsis text-foreground">{shown}</span>
      </div>
    );
  }
  return (
    <div
      data-k={k}
      className={cn(
        "grid grid-cols-[1.25rem_4ch_1rem_5ch_minmax(0,1fr)] gap-x-2 pr-2 font-mono text-[12px] leading-5 whitespace-pre [tab-size:2]",
        !hits && "opacity-60",
        mark === "cur" && "bg-primary/25",
        mark === "site" && "bg-primary/10",
        match && "shadow-[inset_2px_0_0_#fb923c]",
      )}
      onDoubleClick={run}
      title={hits ? `Ran ${hits} ${hits === 1 ? "time" : "times"}. Double-click to run to this line (or back to it, if it doesn't run again)` : "Never ran"}
    >
      <Gutter on={bp} label={bp ? `Remove the breakpoint on line ${line.line}` : `Stop at line ${line.line}`} onClick={() => onBp(line.pcs)} />
      <span className={cn("text-right", match ? "text-orange-400" : "text-muted")}>{hitText(hits)}</span>
      <button
        type="button"
        aria-label={open ? "Hide its TEAL ops" : "Show its TEAL ops"}
        aria-expanded={open}
        className="flex items-center justify-center text-muted hover:text-foreground cursor-pointer"
        onClick={() => onToggle(k)}
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      </button>
      {/* The current line's marker sits left of its number, so its text keeps its place. */}
      <span className="relative text-right text-muted">
        {mark === "cur" ? <CurMark /> : null}
        {line.line}
      </span>
      <span className={cn("min-w-0 overflow-hidden text-ellipsis", isMethodLine(shown) ? "font-medium text-primary" : "text-foreground")}>
        {shown || <span className="text-muted">(line {line.line})</span>}
      </span>
    </div>
  );
});

/** Each path's shortest end that tells it from the others: `escreg/contract.algo.ts`, `mbr-manager/contract.algo.ts`. */
function shortPaths(paths: string[]): Map<string, string> {
  const parts = paths.map((p) => p.split("/"));
  const out = new Map<string, string>();
  paths.forEach((p, i) => {
    for (let n = 1; n <= parts[i].length; n++) {
      const end = parts[i].slice(-n).join("/");
      if (n === parts[i].length || parts.every((q, j) => j === i || q.slice(-n).join("/") !== end)) {
        out.set(p, end);
        break;
      }
    }
  });
  return out;
}

export function SourcePanel({ T, f, map, curPc, showOps, sitePcs, matchPcs, src, bps, onGutter, onRunLine }: {
  T: Stepper;
  f: Frame;
  map: SourceMapping;
  curPc?: number;
  /** Whether to open the current line's TEAL ops: after a step by op. */
  showOps?: boolean;
  sitePcs: Set<number>;
  /** The find bar's hits in this program. */
  matchPcs?: Set<number>;
  src: TraceSource;
  bps: Set<string>;
  onGutter: (pc: number) => void;
  onRunLine: (pcs: number[]) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const hash = f.hash ?? "";
  const hm = (f.hash && T.hits.get(f.hash)) || new Map<number, number>();
  const cur = curPc !== undefined ? map.byPc.get(curPc) : undefined;
  const passes = useMemo(() => linePasses(T, hash, map), [T, hash, map]);
  const sites = useMemo(() => new Set([...sitePcs].map((pc) => map.byPc.get(pc)).filter(Boolean)), [sitePcs, map]);

  // Whole files, when any of the spec's files was added: one file at a time.
  const sources = src.srcs.get(hash)?.rec.sources;
  const files = useMemo(() => [...new Set(map.lines.map((l) => l.file))], [map]);
  const whole = !!sources && files.some((p) => sources[p] !== undefined);
  // The file shown follows the current op's line, unless another file was picked (until the current line enters it).
  const [picked, setPicked] = useState<string>();
  const last = useRef<string>();
  if (cur) last.current = cur.file;
  const curFile = cur?.file;
  useEffect(() => {
    if (curFile !== undefined && curFile === picked) setPicked(undefined);
  }, [curFile, picked]);
  const shownFile = whole ? (picked ?? last.current ?? files[0]) : undefined;
  const shownText = shownFile !== undefined ? sources?.[shownFile] : undefined;
  const short = useMemo(() => shortPaths(files), [files]);

  const rows = useMemo(() => {
    if (shownFile === undefined) return quotedRows(map.lines, true);
    if (shownText === undefined) return [...quotedRows(map.lines.filter((l) => l.file === shownFile), false), { kind: "note" as const, k: "note", text: "Only the lines the spec quotes: add this file to the contract on the Contracts & Specs page to see all of it." }];
    return fileRows(shownFile, shownText, map.lines);
  }, [map, shownFile, shownText]);
  const differs = useMemo(() => (shownFile !== undefined && shownText !== undefined ? checkSource(map.lines.filter((l) => l.file === shownFile), shownText) : undefined), [map, shownFile, shownText]);

  const keyOf = (l: SrcLine) => `${l.file}:${l.line}`;
  const curKey = cur ? keyOf(cur) : undefined;
  // Keep the current line in view, scrolling the panel only (not the page); to the top for another file without it.
  const shownBefore = useRef(shownFile);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const switched = shownBefore.current !== shownFile;
    shownBefore.current = shownFile;
    const row = curKey === undefined ? null : el.querySelector<HTMLElement>(`[data-k="${CSS.escape(curKey)}"]`);
    if (!row) {
      if (switched) el.scrollTop = 0;
      return;
    }
    const top = row.offsetTop;
    if (switched || top < el.scrollTop + 40 || top > el.scrollTop + el.clientHeight - 60) el.scrollTop = Math.max(0, top - el.clientHeight / 3);
  }, [curKey, map, shownFile]);

  // A step by op opens its line, once: closing it again keeps it closed.
  useEffect(() => {
    if (showOps && curKey !== undefined) setOpen((p) => (p.has(curKey) ? p : new Set(p).add(curKey)));
  }, [showOps, curKey]);

  const toggle = React.useCallback((k: string) => setOpen((p) => {
    const n = new Set(p);
    if (n.has(k)) n.delete(k);
    else n.add(k);
    return n;
  }), []);
  const onBp = React.useCallback((pcs: number[]) => src.toggleLineBp(hash, pcs), [src.toggleLineBp, hash]);
  // A stable handler, so that rows don't re-render on every step (onRunLine changes with the position).
  const runRef = useRef(onRunLine);
  runRef.current = onRunLine;
  const onRun = React.useCallback((pcs: number[]) => runRef.current(pcs), []);

  // Lines without ops never change as you step: their elements are made once, so React skips them (a file may have thousands).
  const still = useMemo(() => {
    const m = new Map<Row, React.ReactElement>();
    for (const r of rows) {
      if (r.kind !== "line" || !r.noOps) continue;
      const k = keyOf(r.line);
      m.set(r, <LineRow key={k} line={r.line} k={k} text={r.text} noOps hits={0} bp={false} open={false} onToggle={toggle} onBp={onBp} onRun={onRun} />);
    }
    return m;
  }, [rows, toggle, onBp, onRun]);

  const curText = curPc !== undefined ? lineText(f.prog, curPc) : undefined;
  return (
    <div ref={box} className="relative min-h-0 flex-1 overflow-auto pb-1">
      {(curPc !== undefined && !cur) || (whole && files.length > 1) || differs ? (
        <div className="sticky top-0 z-10 border-b border-border/40 bg-background-muted">
          {whole && files.length > 1 ? (
            <div className="flex flex-wrap items-center gap-1 px-2 py-1 text-xs" role="group" aria-label="Source file">
              {files.map((p) => {
                const on = p === shownFile;
                const has = sources?.[p] !== undefined;
                return (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setPicked(p === curFile || (picked !== undefined && p === shownFile) ? undefined : p)}
                    title={`${p}${has ? "" : " (not added: the lines the spec quotes)"}${p === curFile ? "\nThe current line is in it" : ""}`}
                    className={cn(
                      "max-w-full truncate rounded px-1.5 py-0.5 font-mono cursor-pointer",
                      on ? "bg-primary/25 text-foreground" : "text-muted-foreground hover:bg-white/5",
                      !has && "italic",
                    )}
                  >
                    {p === curFile ? <span className="text-primary">▶ </span> : null}
                    {short.get(p) ?? p}
                  </button>
                );
              })}
              {picked !== undefined ? (
                <button type="button" className="ml-auto text-muted hover:text-foreground cursor-pointer" onClick={() => setPicked(undefined)} title="Follow the current line's file again">
                  follow ▶
                </button>
              ) : null}
            </div>
          ) : null}
          {differs ? (
            <div className="px-3 py-1 text-xs text-amber-300" title={`Line ${differs.line}: the spec has “${differs.spec}”, the file “${differs.file}”`}>
              {base(shownFile!)} differs from the build at line {differs.line}
              {differs.more ? ` (and ${differs.more} more)` : ""}: it may not be the code that ran.
            </div>
          ) : null}
          {curPc !== undefined && !cur ? (
            <div className="px-3 py-1 font-mono text-[12px] text-muted-foreground">
              <span className="text-primary">▶ </span>pc {curPc} {curText ? <Op text={curText} /> : null}
              <span className="ml-2 font-sans text-muted">no source line</span>
            </div>
          ) : null}
        </div>
      ) : null}
      {whole && shownFile !== undefined && files.length === 1 ? (
        <div className="truncate px-3 pt-1.5 pb-0.5 text-xs text-muted-foreground" title={shownFile}>
          {shownFile}
        </div>
      ) : null}
      {rows.map((r) => {
        if (r.kind === "file") {
          return (
            <div key={`f:${r.file}`} className="truncate px-3 pt-1.5 pb-0.5 text-xs text-muted-foreground" title={r.file}>
              {r.file}
            </div>
          );
        }
        if (r.kind === "gap") return <div key={r.k} className="pl-[calc(1.25rem+4ch+1rem+1.5rem)] font-mono text-[10px] leading-3 text-muted">…</div>;
        if (r.kind === "note") return <div key={r.k} className="px-3 pt-2 text-xs text-muted">{r.text}</div>;
        const l = r.line;
        if (r.noOps) return still.get(r);
        const match = !!matchPcs && l.pcs.some((pc) => matchPcs.has(pc));
        if (r.cont !== undefined) {
          const k = `${l.file}:${r.cont}`;
          return <LineRow key={k} line={l} k={k} text={r.text} cont={r.cont} hits={passes.get(l) ?? 0} bp={false} mark={l === cur ? "cur" : sites.has(l) ? "site" : undefined} match={match} open={false} onToggle={toggle} onBp={onBp} onRun={onRun} />;
        }
        const k = keyOf(l);
        const isOpen = open.has(k);
        const hits = passes.get(l) ?? 0;
        // Its ops start at the line's own indentation, then go in from it (see below).
        const indent = isOpen ? /^[ \t]*/.exec(r.text ?? l.text)?.[0] ?? "" : "";
        return (
          <React.Fragment key={k}>
            <LineRow
              line={l}
              k={k}
              text={r.text}
              hits={hits}
              bp={src.lineBps.has(lineBpKey(hash, l.pcs))}
              mark={l === cur ? "cur" : sites.has(l) ? "site" : undefined}
              match={match}
              open={isOpen}
              onToggle={toggle}
              onBp={onBp}
              onRun={onRun}
            />
            {isOpen
              ? l.pcs.map((pc) => {
                  const h = hm.get(pc) ?? 0;
                  const bp = bps.has(bpKey(hash, pc));
                  return (
                    <div
                      key={pc}
                      className={cn(
                        "grid grid-cols-[1.25rem_4ch_1rem_5ch_minmax(0,1fr)] gap-x-2 pr-2 font-mono text-[11.5px] leading-5 whitespace-pre [tab-size:2]",
                        !h && "opacity-45",
                        pc === curPc ? "bg-primary/20" : "bg-white/[0.02]",
                        matchPcs?.has(pc) && "shadow-[inset_2px_0_0_#fb923c]",
                      )}
                    >
                      <Gutter on={bp} label={bp ? `Remove the breakpoint at pc ${pc}` : `Stop at pc ${pc}`} onClick={() => onGutter(pc)} />
                      <span className={cn("text-right", matchPcs?.has(pc) ? "text-orange-400" : "text-muted")}>{hitText(h)}</span>
                      <span />
                      <span className="relative text-right text-muted">
                        {pc === curPc ? <CurMark /> : null}
                        {pc}
                      </span>
                      <span className="min-w-0 overflow-hidden text-ellipsis">
                        {/* At the source's size, so it lines up with the line's own indentation. */}
                        {/* Then a fixed step in, as the font's spaces are too narrow to show one. */}
                        <span className="pr-6 text-[12px]">{indent}</span>
                        <Op text={lineText(f.prog, pc) ?? ""} />
                      </span>
                    </div>
                  );
                })
              : null}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/** The next op's source location, for the Next op panel. */
export function SourceLoc({ map, pc }: { map: SourceMapping; pc: number }) {
  const l = map.byPc.get(pc);
  if (!l) return <div className="text-muted">No source line: an op the compiler added (a subroutine's prologue, the constant blocks).</div>;
  return (
    <div className="min-w-0">
      <div className="truncate text-muted-foreground" title={l.file}>
        {base(l.file)}:{l.line}
      </div>
      <div className="max-h-[3rem] overflow-auto break-all font-mono text-[12.5px] text-foreground">{l.text}</div>
    </div>
  );
}

/** Source-line breakpoints on the trace's programs, for the Breakpoints panel; `at` is where they stop (lineBreakpointPositions). */
export function LineBreakpoints({ T, src, at }: { T: Stepper; src: TraceSource; at: number[] }) {
  const list = [...src.lineBps].map((k) => ({ k, ...parseLineBpKey(k) })).filter((b) => src.hashes.has(b.hash));
  const stops = useMemo(() => {
    // Each stop by program and pc: a line's pcs are its own, so its stops are those at its pcs.
    const n = new Map<string, number>();
    for (const q of at) {
      const f = frameAt(T, q);
      const s = f.steps[T.seqS[q]];
      if (s && f.hash) n.set(bpKey(f.hash, Number(s.pc)), (n.get(bpKey(f.hash, Number(s.pc))) ?? 0) + 1);
    }
    return n;
  }, [T, at]);
  if (!list.length) return null;
  return (
    <div className="min-h-0 overflow-auto py-1 text-xs">
      {list.map((b) => {
        const l = src.srcs.get(b.hash)?.map.byPc.get(b.pcs[0]);
        return (
          <div key={b.k} className="flex items-center gap-2 px-3 py-0.5">
            <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />
            <span className="min-w-0 truncate font-mono" title={l ? `${l.file}:${l.line}` : undefined}>
              {l ? (
                <>
                  <span className="text-muted-foreground">{base(l.file)}:{l.line}</span> {l.text}
                </>
              ) : (
                `pcs ${b.pcs.join(", ")}`
              )}
            </span>
            <span className="ml-auto shrink-0 text-muted">{b.pcs.reduce((t, pc) => t + (stops.get(bpKey(b.hash, pc)) ?? 0), 0)}×</span>
            <button type="button" aria-label="Remove the breakpoint" className="text-muted hover:text-foreground cursor-pointer" onClick={() => src.toggleLineBp(b.hash, b.pcs)}>
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** How many source-line breakpoints are on the trace's programs. */
export const lineBpCount = (src: TraceSource) => [...src.lineBps].filter((k) => src.hashes.has(parseLineBpKey(k).hash)).length;
