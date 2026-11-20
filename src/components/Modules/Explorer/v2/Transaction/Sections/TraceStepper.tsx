import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { encodeAddress } from "algosdk";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronFirst,
  ChevronLeft,
  ChevronRight,
  Keyboard,
  Redo2,
  SkipBack,
  SkipForward,
  X,
} from "lucide-react";
import { cn } from "src/lib/utils";
import { formatUnits } from "src/utils/formatUnits";
import { explorerInnerPath } from "src/utils/txnStateChanges";
import type { AvmValue, SCBudgetRun, SCDevRound } from "src/utils/txnDevInfo";
import {
  bpKey,
  breakpointPositions,
  buildStepper,
  callStack,
  frameAt,
  isRealHash,
  isRestated,
  lineText,
  opName,
  runTo,
  stateAt,
  stepBackOver,
  stepOut,
  stepOver,
  writesBefore,
  type Frame,
  type Program,
  type Stepper,
} from "src/utils/traceStepper";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "src/components/v2/ui/tooltip";
import { lineBreakpointPositions, lineStart, mergePositions, runToLine, stepBackOverSource, stepBackSource, stepIntoSource, stepOverSource } from "src/utils/sourceStepper";
import { alignNames, stackNamesAt } from "src/utils/stackNames";
import { useTraceSource } from "./useTraceSource";
import { LineBreakpoints, lineBpCount, SourceLoc, SourcePanel } from "./SourcePanel";
import { SourceBar } from "./AddSpec";
import { FailureReason, KeyName, OpHints, RunMethod, runFailure, StackName, StateValue, SubName, useSpecNames, type SpecNames } from "./SpecNames";
import { Code, OpDoc, useAvmOps } from "src/components/Modules/Explorer/v2/TealCode";
import { describe as describeOp, opIO, popNames, type IOValue, type OpDesc, type Wide } from "src/utils/avmOps";

// React 18's (the app renders with createRoot), which the project's React 17 types don't declare.
const useDeferredValue = (React as unknown as { useDeferredValue: <V>(value: V) => V }).useDeferredValue;

const grouped = (v: number | bigint) => formatUnits(v, 0);
const KIND = { approval: "Approval", clear: "Clear state", lsig: "Logic sig", none: "No program" };
const STATE_TYPE = { g: "global", l: "local", b: "box" };

// ---------------------------------------------------------------------------
// Values

const bytesOf = (b64?: string) => Uint8Array.from(Buffer.from(b64 ?? "", "base64"));
const toHex = (u: Uint8Array) => Buffer.from(u).toString("hex");
const printable = (u: Uint8Array) => u.length > 0 && u.every((b) => b >= 0x20 && b < 0x7f);
const latin = (u: Uint8Array) => Buffer.from(u).toString("latin1");

/** A value, short: an integer grouped; bytes as text where printable, else hex, with the address of 32 bytes. */
function Short({ v }: { v: AvmValue }) {
  if (v.type === 2) return <span className="text-sky-300">{grouped(v.uint ?? 0)}</span>;
  const u = bytesOf(v.bytes);
  if (!u.length) return <span className="text-amber-300">""</span>;
  if (printable(u) && u.length <= 96) return <span className="text-amber-300 break-all">"{latin(u)}"</span>;
  const hex = toHex(u);
  return (
    <>
      <span className="text-amber-300">0x{hex.length > 28 ? `${hex.slice(0, 28)}…` : hex}</span>
      {u.length === 32 ? <span className="ml-2 text-muted">{shortAddr(encodeAddress(u))}</span> : null}
    </>
  );
}

const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** Every way to read a value, for its expanded row. */
function formats(v: AvmValue): [string, string][] {
  if (v.type === 2) return [["hex", `0x${BigInt(v.uint ?? 0).toString(16)}`]];
  const u = bytesOf(v.bytes);
  const out: [string, string][] = [
    ["hex", `0x${toHex(u)}`],
    ["base64", v.bytes ?? ""],
  ];
  if (u.length && u.every((b) => (b >= 0x20 && b < 0x7f) || b === 10)) out.push(["text", latin(u)]);
  if (u.length === 32) out.push(["address", encodeAddress(u)]);
  if (u.length && u.length <= 8) out.push(["uint", grouped(u.reduce((n, b) => (n << 8n) | BigInt(b), 0n))]);
  return out;
}

function typeTag(v: AvmValue) {
  return v.type === 2 ? "uint" : `${bytesOf(v.bytes).length}B`;
}

/** A stack or scratch value: its index, type, name (from a .puya.map) and short form; click for every format. */
const ValueRow = memo(function ValueRow({ v, index, mark, name, arg }: { v: AvmValue; index: number; mark?: "pop" | "new"; name?: string; arg?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={() => setOpen(!open)}
      className={cn(
        "grid w-full grid-cols-[3ch_4.5ch_minmax(0,1fr)] gap-x-2 px-2 py-0.5 text-left font-mono text-[12px] leading-5 hover:bg-white/5 cursor-pointer",
        mark === "pop" && "bg-red-400/10",
        mark === "new" && "bg-primary/15",
      )}
    >
      <span className="text-right text-muted">{index}</span>
      <span className="text-muted">{typeTag(v)}</span>
      <span className="min-w-0 truncate">
        {arg ? (
          <span className="mr-1.5 text-red-300" title={`The next op's ${arg}`}>
            {arg}
          </span>
        ) : null}
        {name ? <StackName name={name} /> : null}
        <Short v={v} />
      </span>
      {open ? (
        <span className="col-span-3 mt-1 mb-1 space-y-0.5 pl-[8.5ch] whitespace-normal">
          {formats(v).map(([k, x]) => (
            <span key={k} className="block break-all">
              <span className="inline-block w-[8ch] text-muted">{k}</span>
              {x}
            </span>
          ))}
        </span>
      ) : null}
    </button>
  );
});

// ---------------------------------------------------------------------------
// Labels

const appText = (f: Frame) => (f.appId === undefined ? "" : Number(f.appId) ? `app ${grouped(f.appId)}` : "new app");

function useLabels(T: Stepper, txId: string) {
  return useMemo(() => {
    const txn = (top: number) => (T.tops[top]?.txid === txId ? "This transaction" : `Transaction ${top + 1}`);
    const where = (f: Frame) => (f.path.length > 1 ? `Inner ${explorerInnerPath(f.path)}` : txn(f.top));
    return { txn, where };
  }, [T, txId]);
}

// ---------------------------------------------------------------------------
// Source

const hitText = (h: number) => (!h ? "" : h > 999 ? `${Math.round(h / 100) / 10}k` : String(h));

type LineMark = "cur" | "site" | undefined;

const SourceLine = memo(function SourceLine({ prog, i, hits, bp, mark, onGutter, onRun }: {
  prog: Program;
  i: number;
  hits: number;
  bp: boolean;
  mark: LineMark;
  onGutter: (pc: number) => void;
  onRun: (pc: number) => void;
}) {
  const l = prog.lines[i];
  const has = l.pc !== undefined;
  const pc = Number(l.pc);
  return (
    <div
      data-i={i}
      className={cn(
        // Lines out of view skip layout and paint (a disassembly can run to thousands).
        "grid grid-cols-[1.25rem_4ch_5ch_minmax(0,1fr)] gap-x-2 pr-2 font-mono text-[12px] leading-5 whitespace-pre [content-visibility:auto] [contain-intrinsic-size:auto_20px]",
        has && !hits && "opacity-45",
        mark === "cur" && "bg-primary/25",
        mark === "site" && "bg-primary/10",
      )}
      onDoubleClick={has && hits ? () => (window.getSelection()?.removeAllRanges(), onRun(pc)) : undefined}
      title={!has ? undefined : hits ? "Double-click to run to here (or back to it, if it doesn't run again)" : "Never ran"}
    >
      {has ? (
        // Out of the tab order (F9 sets one from the keyboard); a double-click
        // on it toggles twice and must not also run to the line.
        <button
          type="button"
          tabIndex={-1}
          aria-label={bp ? `Remove the breakpoint at pc ${pc}` : `Stop at pc ${pc}`}
          className="group flex items-center justify-center cursor-pointer"
          onClick={() => onGutter(pc)}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <span className={cn("h-2.5 w-2.5 rounded-full", bp ? "bg-red-500" : "group-hover:bg-red-500/40")} />
        </button>
      ) : (
        <span />
      )}
      <span className="text-right text-muted">{hitText(hits)}</span>
      <span className="text-right text-muted">{has ? pc : ""}</span>
      <span className="min-w-0 overflow-hidden text-ellipsis">
        {mark === "cur" ? <span className="text-primary">▶ </span> : null}
        {prog.synthetic ? <span className="text-muted">pc {pc} · no disassembly</span> : <Code text={l.text} tip short />}
      </span>
    </div>
  );
});

function Source({ T, f, curPc, sitePcs, bps, onGutter, onRun }: {
  T: Stepper;
  f: Frame;
  curPc?: number;
  sitePcs: Set<number>;
  bps: Set<string>;
  onGutter: (pc: number) => void;
  onRun: (pc: number) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const prog = f.prog;
  const curLine = prog && curPc !== undefined ? prog.pcLine.get(curPc) : undefined;
  // Keep the current line in view, scrolling the panel only (not the page).
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || curLine === undefined) return;
    const row = el.querySelector<HTMLElement>(`[data-i="${curLine}"]`);
    if (!row) return;
    const top = row.offsetTop;
    if (top < el.scrollTop + 20 || top > el.scrollTop + el.clientHeight - 60) el.scrollTop = Math.max(0, top - el.clientHeight / 3);
  }, [curLine, prog]);
  if (!prog) return <div className="p-3 text-sm text-muted-foreground">No program ran.</div>;
  const hm = (f.hash && T.hits.get(f.hash)) || new Map<number, number>();
  return (
    <div ref={box} className="relative min-h-0 flex-1 overflow-auto py-1">
      {prog.lines.map((l, i) => {
        const pc = Number(l.pc);
        const has = l.pc !== undefined;
        return (
          <SourceLine
            key={i}
            prog={prog}
            i={i}
            hits={has ? hm.get(pc) ?? 0 : 0}
            bp={has && !!f.hash && bps.has(bpKey(f.hash, pc))}
            mark={i === curLine ? "cur" : has && sitePcs.has(pc) ? "site" : undefined}
            onGutter={onGutter}
            onRun={onRun}
          />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panels

function Panel({ title, meta, className, children }: { title: React.ReactNode; meta?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <section className={cn("flex min-w-0 flex-col rounded-md border border-border/40 bg-background-muted", className)}>
      <div className="flex shrink-0 items-baseline gap-2 border-b border-border/40 px-3 py-1.5 text-xs text-muted-foreground">
        <span className="font-semibold uppercase tracking-wide">{title}</span>
        {meta ? <span className="ml-auto text-muted">{meta}</span> : null}
      </div>
      {children}
    </section>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => <div className="px-3 py-2 text-xs text-muted">{children}</div>;

function keyLabel(b64: string) {
  const u = bytesOf(b64);
  if (!u.length) return <span className="text-muted italic">(empty key)</span>;
  return printable(u) ? latin(u) : `0x${toHex(u)}`;
}

function ToolButton({ label, keys, shortcuts, onClick, disabled, children }: {
  label: string;
  /** As shown; `shortcuts` as aria-keyshortcuts has them. */
  keys: string;
  shortcuts: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={`${label} (${keys})`}
      aria-label={label}
      aria-keyshortcuts={shortcuts}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/50 px-2 text-xs hover:bg-primary/15 disabled:opacity-40 disabled:pointer-events-none cursor-pointer [&_svg]:size-4"
    >
      {children}
    </button>
  );
}

const KEYS: [string, string][] = [
  ["→ or S", "step into"],
  ["↓, N or F10", "step over"],
  ["↑ or U", "step out"],
  ["← or B", "step back"],
  ["Shift+N", "step back over"],
  [". / ,", "next / previous TEAL op"],
  ["C or F8", "continue"],
  ["Shift+C", "reverse continue"],
  ["F9", "breakpoint on the next op's line"],
  ["Home / End", "start / end"],
];

/** The timeline's marks, drawn again only when the trace or the breakpoints change, not on every step. */
const TimelineMarks = memo(function TimelineMarks({ T, bpPos }: { T: Stepper; bpPos: number[] }) {
  const pct = (q: number) => `${(q / Math.max(1, T.N)) * 100}%`;
  const maxD = T.frames.reduce((m, f) => Math.max(m, f.depthIn), 0);
  const band = 100 / (maxD + 1);
  return (
    <>
      <div className="absolute inset-x-0 top-1 bottom-1.5">
        {T.frames
          .filter((f) => f.kind !== "none")
          .map((f) => (
            <div
              key={f.id}
              className={cn("absolute", f.depthIn % 2 ? "bg-primary/45" : "bg-primary/20")}
              style={{ left: pct(f.seqStart), width: `max(1px, calc(${pct(f.seqEnd + 1 - f.seqStart)} - 1px))`, top: `${f.depthIn * band}%`, height: `calc(${band}% - 1px)` }}
            />
          ))}
      </div>
      {T.writes.map((w, k) => (
        <div key={k} className="absolute bottom-0 h-1.5 w-[1.5px] bg-green-400" style={{ left: pct(w.pos) }} />
      ))}
      {bpPos.map((q) => (
        <div key={q} className="absolute top-0 h-1.5 w-[1.5px] bg-red-500" style={{ left: pct(q) }} />
      ))}
    </>
  );
});

/** Execution order along the width: runs by how deep, state writes below, breakpoints above, the position as a line. Drag to scrub. */
function Timeline({ T, bpPos, pos, onSeek }: { T: Stepper; bpPos: number[]; pos: number; onSeek: (q: number) => void }) {
  return (
    <div className="relative h-9 rounded-md border border-border/40 bg-background-muted overflow-hidden has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary">
      <TimelineMarks T={T} bpPos={bpPos} />
      <div className="absolute inset-y-0 w-0.5 -ml-px bg-foreground" style={{ left: `${((pos + 0.5) / Math.max(1, T.N)) * 100}%` }} />
      <input
        type="range"
        aria-label="Position in the trace"
        aria-valuetext={`Step ${pos + 1} of ${T.N}`}
        min={0}
        max={Math.max(0, T.N - 1)}
        value={pos}
        onChange={(e) => onSeek(Number(e.target.value))}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Breakpoints, kept per program in this browser

const bpStoreKey = (hash: string) => `trace-bp:${hash}`;

/** The trace's programs that breakpoints are kept for: not those without a hash of their own. */
const keptHashes = (T: Stepper) => [...new Set(T.frames.map((f) => f.hash).filter((h): h is string => !!h && isRealHash(h)))];

function loadBps(T: Stepper): Set<string> {
  const out = new Set<string>();
  for (const h of keptHashes(T)) {
    try {
      const pcs: unknown = JSON.parse(localStorage.getItem(bpStoreKey(h)) ?? "[]");
      if (!Array.isArray(pcs)) continue;
      for (const pc of pcs.slice(0, 1000)) if (Number.isInteger(pc) && pc >= 0) out.add(bpKey(h, pc));
    } catch {
      // Storage off or unreadable: no saved breakpoints.
    }
  }
  return out;
}

function saveBps(T: Stepper, bps: Set<string>) {
  for (const h of keptHashes(T)) {
    const pcs = [...bps].filter((k) => k.startsWith(`${h}@`)).map((k) => Number(k.slice(h.length + 1)));
    try {
      if (pcs.length) localStorage.setItem(bpStoreKey(h), JSON.stringify(pcs));
      else localStorage.removeItem(bpStoreKey(h));
    } catch {
      // Storage off: breakpoints last for this page only.
    }
  }
}

// ---------------------------------------------------------------------------

/**
 * Step-through debugging of a transaction group's opcode traces: the
 * disassembly with the next op highlighted, the stack, scratch slots, call
 * stack and app state written so far before it, breakpoints, and stepping
 * into, over, out of and back through subroutines and inner transactions.
 * Opens at `txId`'s first program run.
 */
export default function TraceStepper({ dev, budget, txId }: { dev: SCDevRound; budget?: SCBudgetRun[]; txId: string }) {
  // Budget runs, which usually arrive after the trace, only relabel the runs:
  // the rebuild keeps the programs (so the source lines stay memoized) and
  // what was worked out about each run.
  const base = useMemo(() => buildStepper(dev), [dev]);
  const T = useMemo(() => (budget?.length ? buildStepper(dev, budget, base) : base), [dev, budget, base]);
  const src = useTraceSource(T);
  const names = useSpecNames(T, src);
  const labels = useLabels(T, txId);

  // Mounted per transaction (keyed on it), so another starts afresh. The
  // positions are the same with or without the budget runs.
  const [rawPos, setPos] = useState(() => startOf(T, txId));
  const pos = Math.min(rawPos, T.N - 1);
  const [bps, setBps] = useState<Set<string>>(() => loadBps(T));
  const bpsChanged = useRef(false);
  useEffect(() => {
    if (bpsChanged.current) saveBps(T, bps);
  }, [T, bps]);

  const lineBpPos = useMemo(() => lineBreakpointPositions(T, src.lineBps), [T, src.lineBps]);
  const bpPos = useMemo(() => mergePositions(breakpointPositions(T, bps), lineBpPos), [T, bps, lineBpPos]);
  const bpSet = useMemo(() => new Set(bpPos), [bpPos]);
  const isBp = useCallback((q: number) => bpSet.has(q), [bpSet]);
  // Where a step by op (. or ,) landed, to show its line's ops: any other move clears it.
  const [opAt, setOpAt] = useState<number>();
  const moved = useRef(false);
  const seek = useCallback(
    (q: number) => {
      moved.current = true;
      setOpAt(undefined);
      setPos(Math.max(0, Math.min(T.N - 1, q)));
    },
    [T],
  );

  const f = frameAt(T, pos);
  const i = T.seqS[pos];
  const s = f.steps[i];
  const st = useMemo(() => stateAt(T, f, i), [T, f, i]);
  const sitePcs = useMemo(() => new Set(st.calls.map((c) => c.pc)), [st]);
  // The side panels may lag a little while the timeline is dragged.
  const lagPos = useDeferredValue(pos);
  const calls = useMemo(() => callStack(T, lagPos), [T, lagPos]);
  const writes = useMemo(() => writesBefore(T, lagPos), [T, lagPos]);

  const toggleBp = useCallback((hash: string, pc: number) => {
    bpsChanged.current = true;
    setBps((prev) => {
      const next = new Set(prev);
      const k = bpKey(hash, pc);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }, []);
  const onGutter = useCallback((pc: number) => f.hash && toggleBp(f.hash, pc), [f.hash, toggleBp]);
  // Reads the position from a ref, so the source lines keep one handler from step to step.
  const posRef = useRef(pos);
  posRef.current = pos;
  const onRun = useCallback(
    (pc: number) => {
      if (!f.hash) return;
      const q = runTo(T, posRef.current, f.hash, pc);
      if (q !== undefined) seek(q);
    },
    [T, f.hash, seek],
  );
  const onRunLine = useCallback(
    (pcs: number[]) => {
      if (!f.hash) return;
      const q = runToLine(T, posRef.current, f.hash, pcs);
      if (q !== undefined) seek(q);
    },
    [T, f.hash, seek],
  );
  const fMap = src.mapFor(f.hash);
  // In the TypeScript view, Into, Over, Back and Back over step by source line;
  // the op steps (. and ,) go one TEAL op, showing the line's ops.
  const srcOn = !!fMap;
  // Until the first move, once the spec's source lines arrive: open at the run's first op with a line, not its constant blocks.
  useEffect(() => {
    if (moved.current || !fMap) return;
    const q = lineStart(T, src.mapFor, pos);
    if (q !== pos) setPos(q);
  }, [T, fMap, pos, src.mapFor]);
  const home = lineStart(T, src.mapFor, 0);

  const act = useMemo(
    () => ({
      into: () => seek(srcOn ? stepIntoSource(T, src.mapFor, pos, isBp) : pos + 1),
      back: () => seek(srcOn ? stepBackSource(T, src.mapFor, pos, isBp) : pos - 1),
      over: () => seek(srcOn ? stepOverSource(T, src.mapFor, pos, isBp) : stepOver(T, pos, isBp)),
      backOver: () => seek(srcOn ? stepBackOverSource(T, src.mapFor, pos, isBp) : stepBackOver(T, pos, isBp)),
      opNext: () => {
        if (pos >= T.N - 1) return;
        seek(pos + 1);
        if (srcOn) setOpAt(pos + 1);
      },
      opBack: () => {
        if (pos <= 0) return;
        seek(pos - 1);
        if (srcOn) setOpAt(pos - 1);
      },
      out: () => seek(stepOut(T, pos, isBp)),
      cont: () => seek(bpPos.find((q) => q > pos) ?? T.N - 1),
      revCont: () => seek([...bpPos].reverse().find((q) => q < pos) ?? 0),
      restart: () => seek(home),
      end: () => seek(T.N - 1),
      // The keyboard's way to set one: on the next op's line. In the TypeScript
      // view, its TypeScript line, or for an op without one (a subroutine's
      // proto, the constant blocks), the run's next op's that has one.
      toggleBp: () => {
        if (!s || !f.hash) return;
        if (fMap) {
          for (let j = i; j < f.steps.length; j++) {
            const l = fMap.byPc.get(Number(f.steps[j].pc));
            if (l) return src.toggleLineBp(f.hash, l.pcs);
          }
        }
        toggleBp(f.hash, Number(s.pc));
      },
    }),
    [T, pos, isBp, bpPos, seek, s, i, f, home, toggleBp, srcOn, fMap, src.mapFor, src.toggleLineBp],
  );
  const bpList = useMemo(() => bpEntries(T, bps), [T, bps]);
  const nLineBps = lineBpCount(src);

  // Keys work anywhere on the page, except where they mean something else: in
  // a field, a dialog, a menu or a list, or on a control that opens one.
  const actRef = useRef(act);
  actRef.current = act;
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.(IGNORE_KEYS_IN)) return;
      const a = KEY_ACTIONS[e.key];
      if (!a) return;
      e.preventDefault();
      actRef.current[a]();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // What the last op pushed and what the next one pops, on the stack.
  const pushed = i > 0 && !isRestated(f, i - 1) ? f.steps[i - 1]["stack-additions"]?.length ?? 0 : 0;
  const pops = s ? Number(s["stack-pop-count"] ?? 0) : 0;
  const n = st.stack.length;
  const stackNames = useMemo(() => alignNames(stackNamesAt(names.map(f), f, i), n), [names, f, i, n]);
  // The next op's reference, and the names it gives the values it takes (A, B…).
  const avmOps = useAvmOps();
  const opDesc = useMemo(() => (avmOps && s ? describeOp(avmOps, lineText(f.prog, Number(s.pc))) : undefined), [avmOps, f, s]);
  const argNames = useMemo(() => popNames(opDesc, n, s), [opDesc, n, s]);
  const slots = [...st.scratch.entries()].sort((a, b) => a[0] - b[0]);
  const willWrite = new Set((s?.["scratch-changes"] ?? []).map((c) => Number(c.slot)));

  return (
    <section className="flex flex-col gap-2 lg:min-h-0 lg:flex-1" aria-label="Trace debugger">
      <div className="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="Stepping">
        <ToolButton label="Restart" keys="Home" shortcuts="Home" onClick={act.restart} disabled={pos === home}><ChevronFirst /></ToolButton>
        <ToolButton label="Reverse continue: back to the previous breakpoint" keys="Shift+C" shortcuts="Shift+C" onClick={act.revCont} disabled={pos === 0}><SkipBack /></ToolButton>
        <ToolButton label={srcOn ? "Step back a line" : "Step back"} keys="← or B" shortcuts="ArrowLeft B" onClick={act.back} disabled={pos === 0}><ChevronLeft /></ToolButton>
        <ToolButton label="Step into" keys="→ or S" shortcuts="ArrowRight S" onClick={act.into} disabled={pos >= T.N - 1}><ArrowDownToLine />Into{srcOn ? " line" : ""}</ToolButton>
        <ToolButton label="Step over subroutines and inner transactions" keys="↓, N or F10" shortcuts="ArrowDown N F10" onClick={act.over} disabled={pos >= T.N - 1}><Redo2 />Over{srcOn ? " line" : ""}</ToolButton>
        <ToolButton label="Step out of the subroutine or program" keys="↑ or U" shortcuts="ArrowUp U" onClick={act.out} disabled={pos >= T.N - 1}><ArrowUpFromLine />Out</ToolButton>
        {srcOn ? (
          <ToolButton label="Step one TEAL op, into subroutines and inner transactions (back one: ,)" keys="." shortcuts=". ," onClick={act.opNext} disabled={pos >= T.N - 1}><ChevronRight />Op</ToolButton>
        ) : null}
        <ToolButton label="Continue to the next breakpoint" keys="C or F8" shortcuts="C F8" onClick={act.cont} disabled={pos >= T.N - 1}><SkipForward /></ToolButton>
        <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <span aria-live="polite" aria-atomic="true">
            Step {grouped(pos + 1)} of {grouped(T.N)}
          </span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" aria-label="Keyboard shortcuts" className="inline-flex text-muted-foreground hover:text-foreground cursor-help">
                  <Keyboard className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="bg-black text-white border-border max-w-xs text-xs p-3">
                {KEYS.map(([k, t]) => (
                  <div key={k} className="grid grid-cols-[12ch_1fr] gap-x-2">
                    <span className="font-mono">{k}</span>
                    <span>{t}</span>
                  </div>
                ))}
                <div className="mt-1.5">In the TypeScript view, the steps go by line, and . and , by TEAL op.</div>
                <div className="mt-1.5">Click a line's gutter for a breakpoint; double-click a line to run to it.</div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </span>
      </div>

      <Timeline T={T} bpPos={bpPos} pos={pos} onSeek={seek} />

      <div className="grid gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)_minmax(20rem,28rem)]">
        <div className="order-2 flex min-w-0 flex-col gap-3 lg:order-none lg:min-h-0">
        <Panel className="lg:min-h-0 lg:flex-1" title="Program runs" meta={`${grouped(T.frames.reduce((t, x) => t + x.steps.length, 0))} ops`}>
          <RunsList T={T} cur={f} labels={labels} names={names} onSeek={seek} />
        </Panel>

        <Panel className="lg:min-h-0 lg:flex-1" title="State written so far" meta={writes.count ? `${writes.count} ${writes.count === 1 ? "write" : "writes"}` : undefined}>
          <div className="max-h-64 min-h-0 overflow-auto py-1 text-xs lg:max-h-none lg:flex-1">
            {writes.rows.length ? (
              writes.rows.map((w) => {
                const c = w.c;
                const app = c["app-id"] ?? w.frame.appId;
                return (
                  <button
                    key={`${w.pos}:${c.key}:${c.account ?? ""}`}
                    type="button"
                    title="Go to the op that wrote it"
                    onClick={() => seek(w.pos)}
                    className={cn("block w-full px-3 py-1 text-left hover:bg-white/5 cursor-pointer", w.pos === lagPos - 1 && "bg-green-400/10")}
                  >
                    <span className="flex items-baseline gap-2">
                      <span className="text-muted">{STATE_TYPE[c["app-state-type"]]}</span>
                      <span className="min-w-0 truncate font-mono">
                        <KeyName names={names} f={w.frame} c={c} fallback={keyLabel(c.key)} />
                      </span>
                      <span className="ml-auto shrink-0 text-muted">
                        step {grouped(w.pos + 1)}
                        {w.n > 1 ? ` · ×${w.n}` : ""}
                      </span>
                    </span>
                    <span className="flex items-baseline gap-2">
                      <span className="min-w-0 truncate font-mono">{c.operation === "d" ? <span className="text-red-400">deleted</span> : c["new-value"] ? <StateValue names={names} f={w.frame} c={c} raw={<Short v={c["new-value"]} />} /> : null}</span>
                      <span className="ml-auto shrink-0 text-muted">
                        {app !== undefined ? `app ${grouped(app)}` : ""}
                        {c.account ? ` · ${shortAddr(c.account)}` : ""}
                      </span>
                    </span>
                  </button>
                );
              })
            ) : (
              <Empty>No app state written yet. Writes show here as the trace reaches them.</Empty>
            )}
          </div>
        </Panel>

        <Panel className="lg:max-h-[25%] lg:shrink-0" title="Breakpoints" meta={bpList.length + nLineBps || undefined}>
          <LineBreakpoints T={T} src={src} at={lineBpPos} />
          {bpList.length || !nLineBps ? <Breakpoints T={T} list={bpList} bpPos={bpPos} onRemove={toggleBp} /> : null}
        </Panel>
        </div>

        <Panel
          className="max-lg:max-h-[75svh] lg:min-h-0"
          title={`${labels.where(f)} · ${KIND[f.kind]}`}
          meta={
            <span className="flex flex-wrap justify-end gap-x-3">
              {appText(f) ? (
                <span>
                  {appText(f)}
                  <RunMethod names={names} f={f} />
                </span>
              ) : null}
              <span>
                op {grouped(Math.min(i + 1, f.steps.length))} of {grouped(f.steps.length)}
              </span>
              {f.budget ? (
                <span title="Budget left when it started and when it ended">
                  cost {grouped(f.budget.cost)} · budget {grouped(f.budget["budget-before"])} → {grouped(f.budget["budget-after"])}
                </span>
              ) : null}
              {f.prog?.synthetic ? <span>no disassembly</span> : null}
            </span>
          }
        >
          <SourceBar key={f.hash} f={f} src={src} />
          {fMap ? (
            <SourcePanel key={f.hash} T={T} f={f} map={fMap} curPc={s ? Number(s.pc) : undefined} showOps={opAt === pos} sitePcs={sitePcs} src={src} bps={bps} onGutter={onGutter} onRunLine={onRunLine} />
          ) : (
            <Source T={T} f={f} curPc={s ? Number(s.pc) : undefined} sitePcs={sitePcs} bps={bps} onGutter={onGutter} onRun={onRun} />
          )}
        </Panel>

        <div className="order-1 flex min-w-0 flex-col gap-3 lg:order-none lg:min-h-0">
          <NextOp T={T} f={f} i={i} stack={st.stack} d={opDesc} last={pos >= T.N - 1} where={labels.where} names={names} loc={s && src.lineMap(f.hash) ? <SourceLoc map={src.lineMap(f.hash)!} pc={Number(s.pc)} /> : null} />
          <Panel className="lg:min-h-[8rem] lg:flex-1" title="Stack" meta={`${n} ${n === 1 ? "value" : "values"}`}>
            <div className="max-h-64 min-h-0 overflow-auto py-1 lg:max-h-none lg:flex-1">
              {n ? (
                st.stack
                  // Keyed on the value too, so an expanded row doesn't stay open for another value pushed in its place.
                  .map((v, j) => <ValueRow key={`${f.id}:${j}:${v.type}:${v.uint ?? v.bytes ?? ""}`} v={v} index={j} name={stackNames[j]} arg={argNames.get(j)} mark={j >= n - pops ? "pop" : j >= n - pushed ? "new" : undefined} />)
                  .reverse()
              ) : (
                <Empty>The stack is empty.</Empty>
              )}
            </div>
          </Panel>
          <Panel className="lg:max-h-[30%] lg:shrink-0" title="Scratch" meta={slots.length ? `${slots.length} ${slots.length === 1 ? "slot" : "slots"}` : undefined}>
            <div className="max-h-48 min-h-0 overflow-auto py-1 lg:max-h-none">
              {slots.length ? (
                slots.map(([k, x]) => <ValueRow key={`${f.id}:${k}:${x.at}`} v={x.v} index={k} mark={willWrite.has(k) ? "pop" : x.at === i - 1 ? "new" : undefined} />)
              ) : (
                <Empty>No scratch slot written yet in this run.</Empty>
              )}
            </div>
          </Panel>
          <Panel className="lg:max-h-[25%] lg:shrink-0" title="Call stack">
            <div className="min-h-0 overflow-auto py-1 text-xs">
              {calls.map((c, k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => seek(c.pos)}
                  className={cn("flex w-full items-baseline gap-2 px-3 py-0.5 text-left hover:bg-white/5 cursor-pointer", c.kind !== "run" && "pl-6")}
                >
                  {c.kind === "sub" ? (
                    <>
                      <SubName names={names} T={T} c={c} />
                      <span className="ml-auto text-muted">callsub at pc {c.pc}</span>
                    </>
                  ) : c.kind === "submit" ? (
                    <>
                      <span className="font-mono text-muted-foreground">itxn_submit</span>
                      <span className="ml-auto text-muted">pc {c.pc}</span>
                    </>
                  ) : (
                    <>
                      <span className={c.current ? "font-semibold" : undefined}>
                        {labels.where(c.frame)} · {KIND[c.frame.kind]}
                      </span>
                      <span className="ml-auto min-w-0 truncate text-muted">
                        {appText(c.frame)}
                        <RunMethod names={names} f={c.frame} />
                      </span>
                    </>
                  )}
                </button>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </section>
  );
}

/** The group's program runs, nested by inner transaction; the current one and the ones that ran it highlighted. */
const RunsList = memo(function RunsList({ T, cur, labels, names, onSeek }: {
  T: Stepper;
  cur: Frame;
  labels: ReturnType<typeof useLabels>;
  names: SpecNames;
  onSeek: (q: number) => void;
}) {
  const ancestors = new Set<number>();
  for (let p = cur.parent; p; p = p.parent) ancestors.add(p.id);
  return (
    <div className="max-h-64 min-h-0 overflow-auto py-1 text-xs lg:max-h-none lg:flex-1">
      {T.tops.map((t, k) => (
        <div key={k}>
          <div className="px-3 pt-1.5 pb-0.5 text-muted-foreground">{labels.txn(k)}</div>
          {!t.frames.length ? <Empty>No program ran.</Empty> : null}
          {t.frames.flatMap(function rows(x: Frame): React.ReactNode[] {
            const isCur = x.id === cur.id;
            return [
              <button
                key={x.id}
                type="button"
                disabled={x.kind === "none"}
                aria-current={isCur ? "step" : undefined}
                onClick={() => onSeek(x.seqStart)}
                style={{ paddingLeft: `${0.75 + x.depthIn}rem` }}
                className={cn(
                  "flex w-full items-baseline gap-2 pr-3 py-0.5 text-left hover:bg-white/5 cursor-pointer disabled:cursor-default disabled:text-muted",
                  isCur && "bg-primary/20",
                  ancestors.has(x.id) && "bg-primary/10",
                )}
              >
                <span>
                  {x.path.length > 1 ? `Inner ${explorerInnerPath(x.path)} · ` : ""}
                  {KIND[x.kind]}
                </span>
                {x.rollback ? <span className="text-red-400">rolled back</span> : null}
                <span className="ml-auto min-w-0 truncate text-muted">
                  {appText(x)}
                  <RunMethod names={names} f={x} />
                </span>
                {x.kind !== "none" ? (
                  <span className="w-[9ch] text-right text-muted">{x.budget ? `${grouped(x.budget.cost)} cost` : `${grouped(x.steps.length)} ops`}</span>
                ) : null}
              </button>,
              ...x.kids.flatMap(rows),
            ];
          })}
        </div>
      ))}
    </div>
  );
});

const IGNORE_KEYS_IN =
  "input:not([type=range]), textarea, select, [contenteditable], [role=dialog], [role=menu], [role=listbox], [role=combobox], [aria-haspopup]:not([aria-haspopup=false])";

const KEY_ACTIONS: Record<string, "into" | "back" | "over" | "backOver" | "opNext" | "opBack" | "out" | "cont" | "revCont" | "restart" | "end" | "toggleBp"> = {
  ArrowRight: "into", s: "into", ArrowLeft: "back", b: "back", ArrowDown: "over", n: "over", F10: "over", N: "backOver", ".": "opNext", ",": "opBack",
  ArrowUp: "out", u: "out", c: "cont", F8: "cont", C: "revCont", Home: "restart", End: "end", F9: "toggleBp",
};

/** Where `txId`'s first program run starts. */
function startOf(T: Stepper, txId: string): number {
  const top = T.tops.find((t) => t.txid === txId);
  return top?.frames.find((f) => f.kind !== "none")?.seqStart ?? 0;
}

const bpEntries = (T: Stepper, bps: Set<string>) =>
  [...bps]
    .map((k) => {
      const at = k.lastIndexOf("@");
      return { k, hash: k.slice(0, at), pc: Number(k.slice(at + 1)) };
    })
    .filter((b) => T.frames.some((x) => x.hash === b.hash));

const Breakpoints = memo(function Breakpoints({ T, list, bpPos, onRemove }: {
  T: Stepper;
  list: ReturnType<typeof bpEntries>;
  bpPos: number[];
  onRemove: (hash: string, pc: number) => void;
}) {
  // How often each one stops.
  const hitsOf = useMemo(() => {
    const m = new Map<string, number>();
    for (const q of bpPos) {
      const x = frameAt(T, q);
      const k = bpKey(x.hash ?? "", Number(x.steps[T.seqS[q]].pc));
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [T, bpPos]);
  if (!list.length) {
    return <Empty>Click the gutter left of a line, or press F9 for the next op's, to stop there. Breakpoints apply to every run of that program, and this browser keeps them.</Empty>;
  }
  return (
    <div className="min-h-0 overflow-auto py-1 text-xs">
      {list.map((b) => {
        const prog = T.programs.get(b.hash);
        const hits = hitsOf.get(b.k) ?? 0;
        return (
          <div key={b.k} className="flex items-center gap-2 px-3 py-0.5">
            <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />
            <span className="min-w-0 truncate font-mono">
              {b.pc} {lineText(prog, b.pc) ?? ""}
            </span>
            <span className="ml-auto shrink-0 text-muted">{hits}×</span>
            <button type="button" aria-label="Remove the breakpoint" className="text-muted hover:text-foreground cursor-pointer" onClick={() => onRemove(b.hash, b.pc)}>
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
});

/** What an op takes from the stack or gives to it: each value under the name its doc gives it, where the trace's count matches. */
function IORows({ label, xs, wide, className }: { label: string; xs: IOValue[]; wide: Wide[]; className: string }) {
  if (!xs.length) return null;
  return (
    <>
      {xs.map((x, k) => (
        <div key={k} className="grid grid-cols-[5ch_3ch_minmax(0,1fr)_auto] gap-x-2">
          <span className="text-muted">{k ? "" : label}</span>
          <span className={className}>{x.name ?? ""}</span>
          <span className="min-w-0 break-all">
            <Short v={x.v} />
            {x.type === "bool" && x.v.type === 2 ? <span className="text-muted"> ({Number(x.v.uint ?? 0) ? "true" : "false"})</span> : null}
          </span>
          <span className="text-muted">{x.type && x.type !== "any" ? x.type : ""}</span>
        </div>
      ))}
      {wide.map((w) => (
        <div key={w.names} className="grid grid-cols-[5ch_3ch_minmax(0,1fr)] gap-x-2" title="Two uint64s read as one 128-bit number: high, low">
          <span />
          <span className={className}>{w.names}</span>
          <span className="min-w-0 break-all text-sky-300">
            {grouped(w.value)} <span className="whitespace-nowrap text-muted">(128-bit)</span>
          </span>
        </div>
      ))}
    </>
  );
}

/** The op about to run and what it will do, or at a run's end, how it ended. */
function NextOp({ T, f, i, stack, d, last, where, names, loc }: {
  T: Stepper;
  f: Frame;
  i: number;
  /** The stack before it. */
  stack: AvmValue[];
  /** Its reference, once loaded. */
  d?: OpDesc;
  last: boolean;
  where: (f: Frame) => string;
  names: SpecNames;
  loc?: React.ReactNode;
}) {
  const s = f.steps[i];
  const top = stack[stack.length - 1];
  if (!s) {
    const failure = runFailure(names, T, f);
    return (
      <Panel title="Run finished">
        <div className="space-y-1 px-3 py-2 text-xs">
          {f.rollback ? (
            <div className="text-red-400">It failed and its changes were rolled back ({f.rollback}). The account is opted out anyway.</div>
          ) : failure ? null : (
            <div>
              Stack top at the end: {top ? <Short v={top} /> : "empty"}. It approved: a block holds only transactions that passed.
            </div>
          )}
          {failure ? <FailureReason r={failure} /> : null}
          <div className="text-muted">{last ? "This is the end of the trace." : `Step on to ${f.parent ? "return to the program that ran it." : "go to the next program run."}`}</div>
        </div>
      </Panel>
    );
  }
  const text = lineText(f.prog, Number(s.pc));
  const restated = isRestated(f, i);
  const kids = f.children.get(i) ?? [];
  // A run's last op, where the trace records what ops push (a trace without
  // stack changes would make every run's last op look failed).
  const lastOp = i === f.steps.length - 1 && f.steps.some((x) => x["stack-additions"]?.length);
  const io = opIO(d, stack, s, { restated, last: lastOp });
  const fx: React.ReactNode[] = [];
  s["scratch-changes"]?.forEach((c) => fx.push(<span key={`s${c.slot}`}>scratch[{c.slot}] = <Short v={c["new-value"]} /></span>));
  s["state-changes"]?.forEach((c, k) =>
    fx.push(
      // Keyed by the op too: a value's raw / decoded switch is per op.
      <span key={`c${f.id}:${i}:${k}`} className="text-green-400">
        {STATE_TYPE[c["app-state-type"]]} {c.operation === "d" ? "delete" : "put"} <KeyName names={names} f={f} c={c} fallback={keyLabel(c.key)} />
        {c["new-value"] ? (
          <>
            {" "}= <StateValue names={names} f={f} c={c} raw={<Short v={c["new-value"]} />} />
          </>
        ) : null}
      </span>,
    ),
  );
  return (
    <Panel title="Next op" meta={`pc ${s.pc}`}>
      <div className="space-y-1.5 px-3 py-2 text-xs">
        {loc}
        <div className="max-h-[4.5rem] overflow-auto break-all font-mono text-[13px]">{text !== undefined ? <Code text={text} short /> : <span className="text-muted">pc {s.pc}</span>}</div>
        {d ? <OpDoc key={`${f.id}:${s.pc}`} d={d} /> : null}
        <OpHints names={names} f={f} s={s} top={top} />
        {io.inputs.length || io.outputs.length ? (
          <div className="flex flex-col gap-0.5 font-mono">
            <IORows label="takes" xs={io.inputs} wide={io.wideIn} className="text-red-300" />
            <IORows label="gives" xs={io.outputs} wide={io.wideOut} className="text-primary" />
          </div>
        ) : null}
        {io.failed ? <div className="text-red-400">It failed here: the trace has no result for it.</div> : null}
        {fx.length ? <div className="flex flex-col gap-0.5 font-mono break-all">{fx}</div> : null}
        {!fx.length && !io.inputs.length && !io.outputs.length && !io.failed ? <div className="text-muted">No stack, scratch or state effect.</div> : null}
        {kids.length ? (
          <div className="text-muted-foreground">
            Runs {kids.length} inner {kids.length === 1 ? "transaction" : "transactions"}:{" "}
            {kids.map((k) => `${where(k)} (${KIND[k.kind]}${appText(k) ? `, ${appText(k)}` : ""})`).join(", ")}. Step into to follow, step over to skip.
          </div>
        ) : null}
        {restated ? (
          <div className="text-warning">
            The trace says this op pushes {s["stack-additions"]?.length} {s["stack-additions"]?.length === 1 ? "value" : "values"}, but itxn_submit leaves the stack alone. go-algorand's simulate tracer shares one stack height across programs, so after an inner app call it reports values already on the stack as pushed. They're ignored here.
          </div>
        ) : null}
        {opName(text) === "callsub" ? <div className="text-muted-foreground">Calls a subroutine. Step over runs it to its retsub.</div> : null}
      </div>
    </Panel>
  );
}
