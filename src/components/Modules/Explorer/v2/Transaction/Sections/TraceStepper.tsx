import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { encodeAddress } from "algosdk";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronFirst,
  ChevronLeft,
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

/** A stack or scratch value: its index, type and short form; click for every format. */
function ValueRow({ v, index, mark }: { v: AvmValue; index: number; mark?: "pop" | "new" }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
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
}

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

/** A disassembly line, coloured: the opcode, numbers, hex, branch labels and comments. */
function Code({ text }: { text: string }) {
  if (/^\s*[A-Za-z_][\w.]*:\s*$/.test(text)) return <span className="text-primary">{text}</span>;
  if (/^#pragma/.test(text)) return <span className="text-muted">{text}</span>;
  const ci = text.indexOf(" //");
  const body = ci >= 0 ? text.slice(0, ci) : text;
  const comment = ci >= 0 ? text.slice(ci) : "";
  const parts = body.split(/(\s+)/);
  const branch = /^(b|bz|bnz|callsub|match|switch)$/.test(parts[0]);
  return (
    <>
      {parts.map((p, i) => {
        if (i === 0) return <span key={i} className="text-foreground">{p}</span>;
        if (!p.trim()) return p;
        if (/^0x[0-9a-fA-F]*$/.test(p)) return <span key={i} className="text-amber-300">{p.length > 70 ? `${p.slice(0, 70)}…` : p}</span>;
        if (/^-?\d+$/.test(p)) return <span key={i} className="text-sky-300">{p}</span>;
        if (branch) return <span key={i} className="text-primary">{p}</span>;
        return <span key={i} className="text-muted-foreground">{p}</span>;
      })}
      {comment ? <span className="text-muted">{comment}</span> : null}
    </>
  );
}

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
        "grid grid-cols-[1.25rem_4ch_5ch_minmax(0,1fr)] gap-x-2 pr-2 font-mono text-[12px] leading-5 whitespace-pre",
        has && !hits && "opacity-45",
        mark === "cur" && "bg-primary/25",
        mark === "site" && "bg-primary/10",
      )}
      onDoubleClick={has && hits ? () => (window.getSelection()?.removeAllRanges(), onRun(pc)) : undefined}
      title={!has ? undefined : hits ? "Double-click to run to here (or back to it, if it doesn't run again)" : "Never ran"}
    >
      {has ? (
        <button
          type="button"
          aria-label={bp ? `Remove the breakpoint at pc ${pc}` : `Stop at pc ${pc}`}
          className="group flex items-center justify-center cursor-pointer"
          onClick={() => onGutter(pc)}
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
        {prog.synthetic ? <span className="text-muted">pc {pc} · no disassembly</span> : <Code text={l.text} />}
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

function ToolButton({ label, keys, onClick, disabled, children }: { label: string; keys: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={`${label} (${keys})`}
      aria-label={label}
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
  ["↓ or N", "step over"],
  ["↑ or U", "step out"],
  ["← or B", "step back"],
  ["Shift+N", "step back over"],
  ["C / Shift+C", "continue / reverse continue"],
  ["Home / End", "start / end"],
];

/** Execution order along the width: runs by how deep, state writes below, breakpoints above, the position as a line. Drag to scrub. */
const Timeline = memo(function Timeline({ T, bpPos, pos, onSeek }: { T: Stepper; bpPos: number[]; pos: number; onSeek: (q: number) => void }) {
  const pct = (q: number) => `${(q / Math.max(1, T.N)) * 100}%`;
  const maxD = Math.max(0, ...T.frames.map((f) => f.depthIn));
  const band = 100 / (maxD + 1);
  return (
    <div className="relative h-9 rounded-md border border-border/40 bg-background-muted overflow-hidden">
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
      <div className="absolute inset-y-0 w-0.5 -ml-px bg-foreground" style={{ left: `${((pos + 0.5) / Math.max(1, T.N)) * 100}%` }} />
      <input
        type="range"
        aria-label="Position in the trace"
        min={0}
        max={Math.max(0, T.N - 1)}
        value={pos}
        onChange={(e) => onSeek(Number(e.target.value))}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </div>
  );
});

// ---------------------------------------------------------------------------
// Breakpoints, kept per program in this browser

const bpStoreKey = (hash: string) => `trace-bp:${hash}`;

function loadBps(T: Stepper): Set<string> {
  const out = new Set<string>();
  for (const h of new Set(T.frames.map((f) => f.hash).filter((h): h is string => !!h))) {
    try {
      const pcs = JSON.parse(localStorage.getItem(bpStoreKey(h)) ?? "[]") as number[];
      for (const pc of pcs) out.add(bpKey(h, pc));
    } catch {
      // Storage off or unreadable: no saved breakpoints.
    }
  }
  return out;
}

function saveBps(hash: string, bps: Set<string>) {
  const pcs = [...bps].filter((k) => k.startsWith(`${hash}@`)).map((k) => Number(k.slice(hash.length + 1)));
  try {
    if (pcs.length) localStorage.setItem(bpStoreKey(hash), JSON.stringify(pcs));
    else localStorage.removeItem(bpStoreKey(hash));
  } catch {
    // Storage off: breakpoints last for this page only.
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
  const T = useMemo(() => buildStepper(dev, budget), [dev, budget]);
  const labels = useLabels(T, txId);
  const start = useMemo(() => {
    const top = T.tops.findIndex((t) => t.txid === txId);
    const first = top >= 0 ? T.tops[top].frames.find((f) => f.kind !== "none") : undefined;
    return first ? first.seqStart : 0;
  }, [T, txId]);

  // Budget runs only relabel runs; the positions stay the same.
  const [pos, setPos] = useState(start);
  const [bps, setBps] = useState<Set<string>>(() => loadBps(T));
  useEffect(() => {
    setPos(start);
    setBps(loadBps(T));
    // Not on T: budget runs arriving later rebuild it with the same positions.
  }, [dev, txId]);

  const bpPos = useMemo(() => breakpointPositions(T, bps), [T, bps]);
  const bpSet = useMemo(() => new Set(bpPos), [bpPos]);
  const isBp = useCallback((q: number) => bpSet.has(q), [bpSet]);
  const seek = useCallback((q: number) => setPos(Math.max(0, Math.min(T.N - 1, q))), [T]);

  const act = useMemo(
    () => ({
      into: () => seek(pos + 1),
      back: () => seek(pos - 1),
      over: () => seek(stepOver(T, pos, isBp)),
      backOver: () => seek(stepBackOver(T, pos, isBp)),
      out: () => seek(stepOut(T, pos, isBp)),
      cont: () => seek(bpPos.find((q) => q > pos) ?? T.N - 1),
      revCont: () => seek([...bpPos].reverse().find((q) => q < pos) ?? 0),
      restart: () => seek(0),
      end: () => seek(T.N - 1),
    }),
    [T, pos, isBp, bpPos, seek],
  );

  const f = frameAt(T, pos);
  const i = T.seqS[pos];
  const s = f.steps[i];
  const st = stateAt(T, f, i);
  const calls = useMemo(() => callStack(T, pos), [T, pos]);
  const writes = useMemo(() => writesBefore(T, pos), [T, pos]);
  const sitePcs = useMemo(() => new Set(st.calls.map((c) => c.pc)), [st]);

  const toggleBp = useCallback(
    (hash: string, pc: number) =>
      setBps((prev) => {
        const next = new Set(prev);
        const k = bpKey(hash, pc);
        if (next.has(k)) next.delete(k);
        else next.add(k);
        saveBps(hash, next);
        return next;
      }),
    [],
  );
  const onGutter = useCallback((pc: number) => f.hash && toggleBp(f.hash, pc), [f.hash, toggleBp]);
  const onRun = useCallback((pc: number) => {
    if (!f.hash) return;
    const q = runTo(T, pos, f.hash, pc);
    if (q !== undefined) seek(q);
  }, [T, pos, f.hash, seek]);

  // Keys work anywhere on the page, except in a field or an open dialog.
  const actRef = useRef(act);
  actRef.current = act;
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("input:not([type=range]), textarea, select, [contenteditable], [role=dialog]") || e.metaKey || e.ctrlKey || e.altKey) return;
      const map: Record<string, keyof typeof act> = {
        ArrowRight: "into", s: "into", ArrowLeft: "back", b: "back", ArrowDown: "over", n: "over", N: "backOver",
        ArrowUp: "out", u: "out", c: "cont", C: "revCont", Home: "restart", End: "end", F10: "over", F11: e.shiftKey ? "out" : "into", F8: "cont",
      };
      const a = map[e.key];
      if (!a) return;
      e.preventDefault();
      actRef.current[a]();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // What the last op pushed and what the next one pops, on the stack.
  const pushed = i > 0 && !isRestated(T, f, i - 1) ? f.steps[i - 1]["stack-additions"]?.length ?? 0 : 0;
  const pops = s && !isRestated(T, f, i) ? Number(s["stack-pop-count"] ?? 0) : 0;
  const n = st.stack.length;
  const slots = [...st.scratch.entries()].sort((a, b) => a[0] - b[0]);
  const willWrite = new Set((s?.["scratch-changes"] ?? []).map((c) => Number(c.slot)));
  const ancestors = new Set<number>();
  for (let p = f.parent; p; p = p.parent) ancestors.add(p.id);

  return (
    <div className="flex flex-col gap-2 lg:min-h-0 lg:flex-1" aria-label="Trace debugger">
      <div className="flex flex-wrap items-center gap-1.5">
        <ToolButton label="Restart" keys="Home" onClick={act.restart} disabled={pos === 0}><ChevronFirst /></ToolButton>
        <ToolButton label="Reverse continue: back to the previous breakpoint" keys="Shift+C" onClick={act.revCont} disabled={pos === 0}><SkipBack /></ToolButton>
        <ToolButton label="Step back" keys="← or B" onClick={act.back} disabled={pos === 0}><ChevronLeft /></ToolButton>
        <ToolButton label="Step into" keys="→ or S" onClick={act.into} disabled={pos >= T.N - 1}><ArrowDownToLine />Into</ToolButton>
        <ToolButton label="Step over subroutines and inner transactions" keys="↓ or N" onClick={act.over} disabled={pos >= T.N - 1}><Redo2 />Over</ToolButton>
        <ToolButton label="Step out of the subroutine or program" keys="↑ or U" onClick={act.out} disabled={pos >= T.N - 1}><ArrowUpFromLine />Out</ToolButton>
        <ToolButton label="Continue to the next breakpoint" keys="C" onClick={act.cont} disabled={pos >= T.N - 1}><SkipForward /></ToolButton>
        <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <span>
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
                  <div key={k} className="grid grid-cols-[11ch_1fr] gap-x-2">
                    <span className="font-mono">{k}</span>
                    <span>{t}</span>
                  </div>
                ))}
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
          <div className="max-h-64 min-h-0 overflow-auto py-1 text-xs lg:max-h-none lg:flex-1">
            {T.tops.map((t, k) => (
              <div key={k}>
                <div className="px-3 pt-1.5 pb-0.5 text-muted-foreground">{labels.txn(k)}</div>
                {!t.frames.length ? <Empty>No program ran.</Empty> : null}
                {t.frames.flatMap(function rows(x: Frame): React.ReactNode[] {
                  const isCur = x.id === f.id;
                  return [
                    <button
                      key={x.id}
                      type="button"
                      disabled={x.kind === "none"}
                      onClick={() => seek(x.seqStart)}
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
                      <span className="ml-auto text-muted">{appText(x)}</span>
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
                    className={cn("block w-full px-3 py-1 text-left hover:bg-white/5 cursor-pointer", w.pos === pos - 1 && "bg-green-400/10")}
                  >
                    <span className="flex items-baseline gap-2">
                      <span className="text-muted">{STATE_TYPE[c["app-state-type"]]}</span>
                      <span className="min-w-0 truncate font-mono">{keyLabel(c.key)}</span>
                      <span className="ml-auto shrink-0 text-muted">
                        step {grouped(w.pos + 1)}
                        {w.n > 1 ? ` · ×${w.n}` : ""}
                      </span>
                    </span>
                    <span className="flex items-baseline gap-2">
                      <span className="min-w-0 truncate font-mono">{c.operation === "d" ? <span className="text-red-400">deleted</span> : c["new-value"] ? <Short v={c["new-value"]} /> : null}</span>
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

        <Panel className="lg:max-h-[25%] lg:shrink-0" title="Breakpoints" meta={bpEntries(T, bps).length || undefined}>
          <Breakpoints T={T} bps={bps} bpPos={bpPos} onRemove={toggleBp} />
        </Panel>
        </div>

        <Panel
          className="max-lg:max-h-[75svh] lg:min-h-0"
          title={`${labels.where(f)} · ${KIND[f.kind]}`}
          meta={
            <span className="flex flex-wrap justify-end gap-x-3">
              {appText(f) ? <span>{appText(f)}</span> : null}
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
          <Source T={T} f={f} curPc={s ? Number(s.pc) : undefined} sitePcs={sitePcs} bps={bps} onGutter={onGutter} onRun={onRun} />
        </Panel>

        <div className="order-1 flex min-w-0 flex-col gap-3 lg:order-none lg:min-h-0">
          <NextOp T={T} f={f} i={i} top={st.stack[n - 1]} last={pos >= T.N - 1} where={labels.where} />
          <Panel className="lg:min-h-[8rem] lg:flex-1" title="Stack" meta={`${n} ${n === 1 ? "value" : "values"}`}>
            <div className="max-h-64 min-h-0 overflow-auto py-1 lg:max-h-none lg:flex-1">
              {n ? (
                st.stack
                  .map((v, j) => <ValueRow key={`${f.id}:${j}`} v={v} index={j} mark={j >= n - pops ? "pop" : j >= n - pushed ? "new" : undefined} />)
                  .reverse()
              ) : (
                <Empty>The stack is empty.</Empty>
              )}
            </div>
          </Panel>
          <Panel className="lg:max-h-[30%] lg:shrink-0" title="Scratch" meta={slots.length ? `${slots.length} ${slots.length === 1 ? "slot" : "slots"}` : undefined}>
            <div className="max-h-48 min-h-0 overflow-auto py-1 lg:max-h-none">
              {slots.length ? (
                slots.map(([k, x]) => <ValueRow key={`${f.id}:${k}`} v={x.v} index={k} mark={willWrite.has(k) ? "pop" : x.at === i - 1 ? "new" : undefined} />)
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
                      <span className="font-mono text-primary">{c.label}</span>
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
                      <span className="ml-auto text-muted">{appText(c.frame)}</span>
                    </>
                  )}
                </button>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

const bpEntries = (T: Stepper, bps: Set<string>) =>
  [...bps]
    .map((k) => {
      const at = k.lastIndexOf("@");
      return { k, hash: k.slice(0, at), pc: Number(k.slice(at + 1)) };
    })
    .filter((b) => T.frames.some((x) => x.hash === b.hash));

function Breakpoints({ T, bps, bpPos, onRemove }: { T: Stepper; bps: Set<string>; bpPos: number[]; onRemove: (hash: string, pc: number) => void }) {
  const list = bpEntries(T, bps);
  if (!list.length) return <Empty>Click the gutter left of a line to stop there. Breakpoints apply to every run of that program, and this browser keeps them.</Empty>;
  return (
    <div className="min-h-0 overflow-auto py-1 text-xs">
      {list.map((b) => {
        const prog = T.frames.find((x) => x.hash === b.hash)?.prog;
        const hits = bpPos.filter((q) => {
          const x = frameAt(T, q);
          return x.hash === b.hash && Number(x.steps[T.seqS[q]].pc) === b.pc;
        }).length;
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
}

/** The op about to run and what it will do, or at a run's end, how it ended. */
function NextOp({ T, f, i, top, last, where }: { T: Stepper; f: Frame; i: number; top?: AvmValue; last: boolean; where: (f: Frame) => string }) {
  const s = f.steps[i];
  if (!s) {
    return (
      <Panel title="Run finished">
        <div className="space-y-1 px-3 py-2 text-xs">
          {f.rollback ? (
            <div className="text-red-400">It failed and its changes were rolled back ({f.rollback}). The account is opted out anyway.</div>
          ) : (
            <div>
              Stack top at the end: {top ? <Short v={top} /> : "empty"}. It approved: a block holds only transactions that passed.
            </div>
          )}
          <div className="text-muted">{last ? "This is the end of the trace." : `Step on to ${f.parent ? "return to the program that ran it." : "go to the next program run."}`}</div>
        </div>
      </Panel>
    );
  }
  const text = lineText(f.prog, Number(s.pc));
  const restated = isRestated(T, f, i);
  const pop = Number(s["stack-pop-count"] ?? 0);
  const kids = f.children.get(i) ?? [];
  const fx: React.ReactNode[] = [];
  if (pop && !restated) fx.push(<span key="p" className="text-red-400">pops {pop}</span>);
  if (!restated) s["stack-additions"]?.forEach((a, k) => fx.push(<span key={`a${k}`}>push <Short v={a} /></span>));
  s["scratch-changes"]?.forEach((c) => fx.push(<span key={`s${c.slot}`}>scratch[{c.slot}] = <Short v={c["new-value"]} /></span>));
  s["state-changes"]?.forEach((c, k) =>
    fx.push(
      <span key={`c${k}`} className="text-green-400">
        {STATE_TYPE[c["app-state-type"]]} {c.operation === "d" ? "delete" : "put"} {keyLabel(c.key)}
        {c["new-value"] ? (
          <>
            {" "}= <Short v={c["new-value"]} />
          </>
        ) : null}
      </span>,
    ),
  );
  return (
    <Panel title="Next op" meta={`pc ${s.pc}`}>
      <div className="space-y-1.5 px-3 py-2 text-xs">
        <div className="max-h-[4.5rem] overflow-auto break-all font-mono text-[13px]">{text !== undefined ? <Code text={text} /> : <span className="text-muted">pc {s.pc}</span>}</div>
        {fx.length ? <div className="flex flex-col gap-0.5 font-mono break-all">{fx}</div> : <div className="text-muted">No stack, scratch or state effect.</div>}
        {kids.length ? (
          <div className="text-muted-foreground">
            Runs {kids.length} inner {kids.length === 1 ? "transaction" : "transactions"}:{" "}
            {kids.map((k) => `${where(k)} (${KIND[k.kind]}${appText(k) ? `, ${appText(k)}` : ""})`).join(", ")}. Step into to follow, step over to skip.
          </div>
        ) : null}
        {restated ? (
          <div className="text-warning">
            The trace says this op pushes {s["stack-additions"]?.length} values, but itxn_submit leaves the stack alone: they are the top of the stack again. go-algorand's simulate tracer shares one stack height across programs, so the inner app call overwrote it. They're ignored here.
          </div>
        ) : null}
        {opName(text) === "callsub" ? <div className="text-muted-foreground">Calls a subroutine. Step over runs it to its retsub.</div> : null}
      </div>
    </Panel>
  );
}
