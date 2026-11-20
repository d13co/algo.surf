import type { TTInt } from "./timeTravel";
import type { AvmValue, ExecTrace, SCBudgetRun, SCDevRound, TraceStep } from "./txnDevInfo";

/**
 * Step-through debugging over a group's opcode traces, as simulate gives them
 * (dtalgod's `txn/state-changes?include=trace`): every program run of the
 * group in execution order, with the stack, scratch slots and subroutine
 * calls before each op rebuilt from the trace.
 *
 * Follows the AlgoKit AVM debug adapter (algokit-avm-debugger): a position is
 * the next op to run, and the state shown is the state before it; an
 * itxn_submit's inner transactions run before the submit completes; step over
 * and step out stop at a breakpoint they reach on the way. Unlike it, the
 * group's logic sigs come first, as the node checks them before running the
 * group, and subroutines come from the disassembly's callsub and retsub, so
 * they work without a source map.
 */

export type FrameKind = "approval" | "clear" | "lsig" | "none";

/** A program's disassembly, indexed by pc. */
export type Program = {
  hash: string;
  lines: { pc?: number; text: string }[];
  /** pc → index into `lines`. */
  pcLine: Map<number, number>;
  /** No disassembly: one empty line per traced pc. */
  synthetic?: boolean;
};

/** One program run. */
export type Frame = {
  id: number;
  kind: FrameKind;
  steps: TraceStep[];
  hash?: string;
  prog?: Program;
  /** As in the budget runs: the payset index, then 0-based inner indexes. */
  path: number[];
  parent?: Frame;
  /** The parent's op (its itxn_submit) that ran it; -1 for a top-level run. */
  parentStep: number;
  /** Index of its top-level transaction in `traces`. */
  top: number;
  /** Inner runs by the op that ran them. */
  children: Map<number, Frame[]>;
  kids: Frame[];
  /** How many inner transactions deep. */
  depthIn: number;
  budget?: SCBudgetRun;
  appId?: TTInt;
  /** A clear state program that failed: its changes and its inner calls' are rolled back when it ends. */
  rollback?: string;
  /** Its first and its end position in the trace; `pos[i]` is its op i's (`pos[steps.length]` = seqEnd). */
  seqStart: number;
  seqEnd: number;
  pos: Int32Array;
};

export type ScratchSlot = { v: AvmValue; at: number };
export type SubCall = { step: number; pc: number; label: string };
/** A run's state before one of its ops. */
export type RunState = { stack: AvmValue[]; scratch: Map<number, ScratchSlot>; calls: SubCall[] };

export type StateWrite = { pos: number; frame: Frame; step: number; c: NonNullable<TraceStep["state-changes"]>[number] };

type Analysis = { ck: RunState[]; depth: Int16Array; final: RunState };

export type Stepper = {
  frames: Frame[];
  /** Per top-level transaction (as `traces`), its runs: logic sig, then approval or clear state program. */
  tops: { txid: string; frames: Frame[] }[];
  /** Every position: its frame and its step (= the frame's steps.length at a run's end position). */
  seqF: Int32Array;
  seqS: Int32Array;
  N: number;
  /** Per program hash, how often each pc ran. */
  hits: Map<string, Map<number, number>>;
  writes: StateWrite[];
  programs: Map<string, Program>;
  analysis: Map<number, Analysis>;
  /** Per run, the last state asked of it, to step on from. */
  memo: Map<number, { i: number; st: RunState }>;
};

/** States are kept every CK ops of a run; any other is replayed from the one before it. */
const CK = 64;

export const opName = (text: string | undefined) => (text ?? "").trim().split(/\s+/)[0] ?? "";

/** A program run without a hash gets one made up for this trace alone: not one to keep anything under. */
const NOHASH = "nohash-";
export const isRealHash = (hash: string) => !hash.startsWith(NOHASH);

function prepProgram(hash: string, lines: { pc?: number; text: string }[], synthetic = false): Program {
  const pcLine = new Map<number, number>();
  lines.forEach((l, i) => {
    if (l.pc !== undefined) pcLine.set(Number(l.pc), i);
  });
  return { hash, lines, pcLine, synthetic };
}

/** A program's line at `pc`, if its disassembly is known. */
export function lineText(prog: Program | undefined, pc: number): string | undefined {
  if (!prog || prog.synthetic) return undefined;
  const i = prog.pcLine.get(pc);
  return i === undefined ? undefined : prog.lines[i].text;
}

/**
 * Lays out `dev`'s traces (the group's, one per top-level transaction) in
 * execution order. `budget` (the group's runs) gives each run its cost and app.
 * `reuse`, a stepper built from the same `dev` (without the budget runs, say),
 * lends its programs and what it worked out about each run, which the budget
 * runs don't change.
 */
export function buildStepper(dev: Pick<SCDevRound, "traces" | "programs">, budget: SCBudgetRun[] = [], reuse?: Stepper): Stepper {
  const programs = reuse?.programs ?? new Map((dev.programs ?? []).map((p) => [p.hash, prepProgram(p.hash, p.lines)]));
  const runs = new Map<string, SCBudgetRun>();
  const payset = new Map<string, number>();
  for (const b of budget) {
    runs.set(`${b.path.map(Number).join("/")}|${b.kind}`, b);
    if (b.txid) payset.set(b.txid, Number(b.path[0]));
  }
  const frames: Frame[] = [];
  const mk = (kind: FrameKind, steps: TraceStep[], hash: string | undefined, path: number[], parent: Frame | undefined, parentStep: number, top: number) => {
    const key = hash ?? `${NOHASH}${frames.length}`;
    let prog = programs.get(key);
    if (!prog && steps.length) {
      const pcs = [...new Set(steps.map((s) => Number(s.pc)))].sort((a, b) => a - b);
      prog = prepProgram(key, pcs.map((pc) => ({ pc, text: "" })), true);
      programs.set(key, prog);
    }
    const budgetRun = runs.get(`${path.join("/")}|${kind === "lsig" ? "logic-sig" : kind}`);
    const f: Frame = {
      id: frames.length,
      kind,
      steps,
      hash: prog?.hash,
      prog,
      path,
      parent,
      parentStep,
      top,
      children: new Map(),
      kids: [],
      depthIn: parent ? parent.depthIn + 1 : 0,
      budget: budgetRun,
      appId: budgetRun?.["app-id"],
      seqStart: 0,
      seqEnd: 0,
      pos: new Int32Array(0),
    };
    frames.push(f);
    parent?.kids.push(f);
    return f;
  };
  const appFrames = (et: ExecTrace, path: number[], parent: Frame | undefined, parentStep: number, top: number): Frame[] => {
    const out: Frame[] = [];
    for (const kind of ["approval", "clear"] as const) {
      const steps = et[kind === "approval" ? "approval-program-trace" : "clear-state-program-trace"];
      if (!steps) continue;
      const f = mk(kind, steps, et[kind === "approval" ? "approval-program-hash" : "clear-state-program-hash"], path, parent, parentStep, top);
      if (kind === "clear" && et["clear-state-rollback"]) f.rollback = et["clear-state-rollback-error"] || "rolled back";
      const inners = et["inner-trace"] ?? [];
      steps.forEach((s, i) => {
        for (const k of s["spawned-inners"] ?? []) {
          const it = inners[Number(k)];
          if (!it) continue;
          const ipath = [...path, Number(k)];
          let kids = appFrames(it, ipath, f, i, top);
          // An inner transaction that ran no program (a payment, say).
          if (!kids.length) kids = [mk("none", [], undefined, ipath, f, i, top)];
          f.children.set(i, [...(f.children.get(i) ?? []), ...kids]);
        }
      });
      out.push(f);
    }
    return out;
  };

  const traces = dev.traces ?? [];
  const tops = traces.map((t) => ({ txid: t.txid, frames: [] as Frame[] }));
  const roots: Frame[] = [];
  // A group is contiguous in the payset: a transaction the budget runs don't
  // name is where its neighbours put it (its index in the group, without them).
  const known = traces.findIndex((t) => payset.has(t.txid));
  const offset = known < 0 ? 0 : (payset.get(traces[known].txid) as number) - known;
  const paysetOf = (i: number) => payset.get(traces[i].txid) ?? offset + i;
  // The node checks the group's logic sigs before it runs any app call.
  traces.forEach((t, i) => {
    const et = t["exec-trace"] ?? {};
    if (!et["logic-sig-trace"]) return;
    const f = mk("lsig", et["logic-sig-trace"], et["logic-sig-hash"], [paysetOf(i)], undefined, -1, i);
    tops[i].frames.push(f);
    roots.push(f);
  });
  traces.forEach((t, i) => {
    const fs = appFrames(t["exec-trace"] ?? {}, [paysetOf(i)], undefined, -1, i);
    tops[i].frames.push(...fs);
    roots.push(...fs);
  });

  // Execution order: each run's ops, its inner runs right after the op that
  // ran them, then an end position (the state after its last op).
  const seqF: number[] = [];
  const seqS: number[] = [];
  const emit = (f: Frame) => {
    if (f.kind === "none") return;
    f.seqStart = seqF.length;
    f.pos = new Int32Array(f.steps.length + 1);
    for (let i = 0; i < f.steps.length; i++) {
      f.pos[i] = seqF.length;
      seqF.push(f.id);
      seqS.push(i);
      for (const kid of f.children.get(i) ?? []) emit(kid);
    }
    f.pos[f.steps.length] = seqF.length;
    seqF.push(f.id);
    seqS.push(f.steps.length);
    f.seqEnd = seqF.length - 1;
  };
  roots.forEach(emit);

  const hits = new Map<string, Map<number, number>>();
  const writes: StateWrite[] = [];
  for (let q = 0; q < seqF.length; q++) {
    const f = frames[seqF[q]];
    const s = f.steps[seqS[q]];
    if (!s || !f.hash) continue;
    let hm = hits.get(f.hash);
    if (!hm) hits.set(f.hash, (hm = new Map()));
    hm.set(Number(s.pc), (hm.get(Number(s.pc)) ?? 0) + 1);
    for (const c of s["state-changes"] ?? []) writes.push({ pos: q, frame: f, step: seqS[q], c });
  }
  return {
    frames,
    tops,
    seqF: Int32Array.from(seqF),
    seqS: Int32Array.from(seqS),
    N: seqF.length,
    hits,
    writes,
    programs,
    analysis: reuse?.analysis ?? new Map(),
    memo: reuse?.memo ?? new Map(),
  };
}

const cloneState = (st: RunState): RunState => ({ stack: st.stack.slice(), scratch: new Map(st.scratch), calls: st.calls.slice() });

/**
 * Whether op i's stack additions are to be ignored: those of an op that ran
 * inner transactions (itxn_submit, which has no stack effect). go-algorand's
 * simulate tracer keeps one stack height for every program it traces, so an
 * inner app call's last op overwrites the caller's, and the submit re-reports
 * values already on the caller's stack as pushed.
 */
export function isRestated(f: Frame, i: number): boolean {
  const s = f.steps[i];
  return !!s?.["spawned-inners"]?.length && !!s["stack-additions"]?.length;
}

/** Op i's effect on its run's stack, scratch slots and subroutine calls. */
export function applyStep(f: Frame, i: number, st: RunState): void {
  const s = f.steps[i];
  const pop = Number(s["stack-pop-count"] ?? 0);
  if (pop) st.stack.length = Math.max(0, st.stack.length - pop);
  if (!isRestated(f, i)) st.stack.push(...(s["stack-additions"] ?? []));
  // A slot holding uint 0 is an unset slot (as the AVM debug adapter shows it).
  for (const c of s["scratch-changes"] ?? []) {
    const v = c["new-value"];
    if (v.type === 2 && !BigInt(v.uint ?? 0)) st.scratch.delete(Number(c.slot));
    else st.scratch.set(Number(c.slot), { v, at: i });
  }
  const text = lineText(f.prog, Number(s.pc));
  if (text !== undefined) {
    const op = opName(text);
    if (op === "callsub") st.calls.push({ step: i, pc: Number(s.pc), label: text.trim().split(/\s+/)[1] ?? "?" });
    else if (op === "retsub") st.calls.pop();
  }
}

function analyze(T: Stepper, f: Frame): Analysis {
  let a = T.analysis.get(f.id);
  if (a) return a;
  const n = f.steps.length;
  const ck: RunState[] = [];
  const depth = new Int16Array(n + 1);
  const st: RunState = { stack: [], scratch: new Map(), calls: [] };
  for (let i = 0; i < n; i++) {
    if (i % CK === 0) ck.push(cloneState(st));
    depth[i] = st.calls.length;
    applyStep(f, i, st);
  }
  depth[n] = 0;
  a = { ck, depth, final: cloneState(st) };
  T.analysis.set(f.id, a);
  return a;
}

/** A run's state before its op i; i = steps.length gives the state after its last op. Don't change it. */
export function stateAt(T: Stepper, f: Frame, i: number): RunState {
  const a = analyze(T, f);
  if (i >= f.steps.length) return a.final;
  const m = T.memo.get(f.id);
  let st: RunState;
  let from: number;
  if (m && m.i <= i && i - m.i < CK) {
    st = cloneState(m.st);
    from = m.i;
  } else {
    from = Math.floor(i / CK) * CK;
    st = cloneState(a.ck[from / CK]);
  }
  for (let j = from; j < i; j++) applyStep(f, j, st);
  T.memo.set(f.id, { i, st });
  return st;
}

export const frameAt = (T: Stepper, q: number) => T.frames[T.seqF[q]];

/** How many subroutines deep position q is, within its run. */
export function depthAt(T: Stepper, q: number): number {
  return analyze(T, frameAt(T, q)).depth[T.seqS[q]];
}

// Moves: each takes a position and gives the new one. Step over and step out
// stop at a breakpoint they reach on the way (isBp), as the AVM debug adapter does.

type IsBp = (q: number) => boolean;
const none: IsBp = () => false;

/** The run's next op at the same subroutine depth or less, past subroutines and inner transactions. */
export function stepOver(T: Stepper, p: number, isBp: IsBp = none): number {
  const f = frameAt(T, p);
  const d = depthAt(T, p);
  for (let q = p + 1; q <= f.seqEnd; q++) if ((T.seqF[q] === f.id && depthAt(T, q) <= d) || isBp(q)) return q;
  return Math.min(T.N - 1, f.seqEnd + 1);
}

export function stepBackOver(T: Stepper, p: number, isBp: IsBp = none): number {
  const f = frameAt(T, p);
  // From a run's end, back to its last op, which may be in a subroutine (a
  // return or a failure there).
  if (p === f.seqEnd && f.steps.length) {
    for (let q = p - 1; q > f.pos[f.steps.length - 1]; q--) if (isBp(q)) return q;
    return f.pos[f.steps.length - 1];
  }
  const d = depthAt(T, p);
  for (let q = p - 1; q >= f.seqStart; q--) if ((T.seqF[q] === f.id && depthAt(T, q) <= d) || isBp(q)) return q;
  return Math.max(0, f.seqStart - 1);
}

/**
 * Out of the subroutine (its retsub's next op), or at depth 0 out of the run:
 * an inner run to its caller's op after the itxn_submit, past any other inner
 * runs of that submit; a top-level run to the next run.
 */
export function stepOut(T: Stepper, p: number, isBp: IsBp = none): number {
  const f = frameAt(T, p);
  const d = depthAt(T, p);
  const to = d === 0 && f.parent ? f.parent.pos[f.parentStep + 1] : Math.min(T.N - 1, f.seqEnd + 1);
  for (let q = p + 1; q < to; q++) if ((d > 0 && T.seqF[q] === f.id && depthAt(T, q) < d) || isBp(q)) return q;
  return to;
}

/** A breakpoint: a program (by hash) and a pc, for every run of that program. */
export const bpKey = (hash: string, pc: number) => `${hash}@${pc}`;

/** The positions where breakpoints `bps` stop, in order. */
export function breakpointPositions(T: Stepper, bps: Set<string>): number[] {
  const out: number[] = [];
  if (!bps.size) return out;
  for (let q = 0; q < T.N; q++) {
    const f = frameAt(T, q);
    const s = f.steps[T.seqS[q]];
    if (s && f.hash && bps.has(bpKey(f.hash, Number(s.pc)))) out.push(q);
  }
  return out;
}

const reaches = (T: Stepper, q: number, hash: string, pc: number) => {
  const f = frameAt(T, q);
  const s = f.steps[T.seqS[q]];
  return !!s && f.hash === hash && Number(s.pc) === pc;
};

/**
 * Where program `hash` next reaches `pc` after p; if it never does again, where
 * it last did before p (running back to it).
 */
export function runTo(T: Stepper, p: number, hash: string, pc: number): number | undefined {
  for (let q = p + 1; q < T.N; q++) if (reaches(T, q, hash, pc)) return q;
  for (let q = p - 1; q >= 0; q--) if (reaches(T, q, hash, pc)) return q;
  return undefined;
}

/** A key's latest write before position p, and how many times it was written by then. */
export type LatestWrite = StateWrite & { n: number };

/**
 * App state written before position p, the latest write per key, latest
 * first. A failed clear state program's writes, and its inner calls', are
 * left out once it has ended: they were rolled back.
 */
export function writesBefore(T: Stepper, p: number): { rows: LatestWrite[]; count: number } {
  const undone = (w: StateWrite) => {
    for (let f: Frame | undefined = w.frame; f; f = f.parent) if (f.rollback && p > f.seqEnd) return true;
    return false;
  };
  const latest = new Map<string, LatestWrite>();
  let count = 0;
  for (const w of T.writes) {
    if (w.pos >= p) break;
    if (undone(w)) continue;
    count++;
    const c = w.c;
    // Without the app (no budget runs), its program's: two apps' writes to one key stay apart.
    const app = c["app-id"] ?? w.frame.appId;
    const k = `${app !== undefined ? `app:${String(app)}` : `prog:${w.frame.hash}`}|${c["app-state-type"]}|${c.account ?? ""}|${c.key}`;
    latest.set(k, { ...w, n: (latest.get(k)?.n ?? 0) + 1 });
  }
  return { rows: [...latest.values()].sort((a, b) => b.pos - a.pos), count };
}

/** One level of the call stack at a position, innermost first. */
export type CallLevel =
  | { kind: "sub"; frame: Frame; label: string; pc: number; pos: number }
  | { kind: "run"; frame: Frame; pos: number; current: boolean }
  | { kind: "submit"; frame: Frame; pc: number; pos: number };

/** Position q's subroutine calls within its run, then the inner transaction chain out to the top-level run. */
export function callStack(T: Stepper, q: number): CallLevel[] {
  const out: CallLevel[] = [];
  let f: Frame | undefined = frameAt(T, q);
  let st = stateAt(T, f, T.seqS[q]);
  let first = true;
  while (f) {
    for (let k = st.calls.length - 1; k >= 0; k--) {
      const c = st.calls[k];
      out.push({ kind: "sub", frame: f, label: c.label, pc: c.pc, pos: f.pos[c.step] });
    }
    out.push({ kind: "run", frame: f, pos: f.seqStart, current: first });
    const parent: Frame | undefined = f.parent;
    if (!parent) break;
    out.push({ kind: "submit", frame: parent, pc: Number(parent.steps[f.parentStep].pc), pos: parent.pos[f.parentStep] });
    st = stateAt(T, parent, f.parentStep);
    f = parent;
    first = false;
  }
  return out;
}
