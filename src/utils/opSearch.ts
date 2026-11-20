import { lineText, opName, type Frame, type Stepper } from "./traceStepper";

/**
 * Finding ops in a trace: by op name (a prefix) or anywhere in the
 * disassembled line, as text or a regular expression, in the whole trace or
 * one program run. The hits are positions, in execution order.
 */

export type OpSearchMode = "op" | "line";
/** `exact`: the op named, not every op its name starts (as picked from the list: `int`, not `intc_0`). Op mode only. */
export type OpQuery = { text: string; mode: OpSearchMode; regex: boolean; exact?: boolean };

/** A program line that ran: its program, pc, text and op. */
type RanLine = { hash: string; pc: number; text: string; op: string };

type Index = {
  lines: RanLine[];
  /** Per position, its line in `lines`; -1 at a run's end, or where the disassembly is missing. */
  at: Int32Array;
};

const indexCache = new WeakMap<Stepper, Index>();

/** Each position's program line, worked out once per trace. */
export function opIndex(T: Stepper): Index {
  let idx = indexCache.get(T);
  if (idx) return idx;
  const lines: RanLine[] = [];
  const at = new Int32Array(T.N).fill(-1);
  const ids = new Map<string, Map<number, number>>();
  for (const f of T.frames) {
    if (!f.hash) continue;
    let byPc = ids.get(f.hash);
    if (!byPc) ids.set(f.hash, (byPc = new Map()));
    for (let i = 0; i < f.steps.length; i++) {
      const pc = Number(f.steps[i].pc);
      let id = byPc.get(pc);
      if (id === undefined) {
        const text = lineText(f.prog, pc);
        id = text === undefined ? -1 : lines.push({ hash: f.hash, pc, text, op: opName(text) }) - 1;
        byPc.set(pc, id);
      }
      at[f.pos[i]] = id;
    }
  }
  idx = { lines, at };
  indexCache.set(T, idx);
  return idx;
}

/** A query's test of a line, or why it has none: nothing to find, or a pattern that doesn't parse. */
function matcher(q: OpQuery): ((text: string, op: string) => boolean) | { error: string } | undefined {
  const t = q.mode === "op" ? q.text.trim() : q.text;
  if (!t.trim()) return undefined;
  if (q.mode === "op" && q.exact) return (_, op) => op === t;
  if (q.regex) {
    let re: RegExp;
    try {
      re = new RegExp(t, "i");
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
    return q.mode === "op" ? (_, op) => re.test(op) : (text) => re.test(text);
  }
  const lc = t.toLowerCase();
  return q.mode === "op" ? (_, op) => op.toLowerCase().startsWith(lc) : (text) => text.toLowerCase().includes(lc);
}

export type OpSearch = {
  query: OpQuery;
  /** Positions of matching ops, in order. */
  hits: Int32Array;
  /** Per program, the pcs of matching lines, ran or not: for marking them in the views. */
  pcs: Map<string, Set<number>>;
  error?: string;
};

const NONE = new Int32Array(0);

/** The ops in the trace matching `q`. Undefined when there is nothing to find. */
export function searchOps(T: Stepper, q: OpQuery): OpSearch | undefined {
  const m = matcher(q);
  if (!m) return undefined;
  if (typeof m !== "function") return { query: q, hits: NONE, pcs: new Map(), error: m.error };
  const pcs = new Map<string, Set<number>>();
  for (const p of T.programs.values()) {
    if (p.synthetic) continue;
    const set = new Set<number>();
    for (const l of p.lines) if (l.pc !== undefined && m(l.text, opName(l.text))) set.add(Number(l.pc));
    if (set.size) pcs.set(p.hash, set);
  }
  const { lines, at } = opIndex(T);
  const match = new Uint8Array(lines.length);
  lines.forEach((l, k) => {
    if (pcs.get(l.hash)?.has(l.pc)) match[k] = 1;
  });
  const out: number[] = [];
  for (let p = 0; p < T.N; p++) {
    const id = at[p];
    if (id >= 0 && match[id]) out.push(p);
  }
  return { query: q, hits: Int32Array.from(out), pcs };
}

/**
 * `r` limited to one run's own ops, leaving out the inner runs within it.
 * Cheap: it cuts the trace's hits rather than searching again, as stepping
 * moves from run to run.
 */
export function inRun(T: Stepper, r: OpSearch, run: Frame): OpSearch {
  const idx = run.id;
  const from = lowerBound(r.hits, run.seqStart);
  const to = lowerBound(r.hits, run.seqEnd);
  const out: number[] = [];
  for (let k = from; k < to; k++) if (T.seqF[r.hits[k]] === idx) out.push(r.hits[k]);
  return { ...r, hits: Int32Array.from(out) };
}

export type OpCount = { op: string; n: number };

/**
 * The ops that ran, most run first, and those in the programs that never ran,
 * by name: in `run` and its program only, when given.
 */
export function opCounts(T: Stepper, run?: Frame): { ran: OpCount[]; notRun: string[] } {
  const { lines, at } = opIndex(T);
  const per = new Uint32Array(lines.length);
  const [from, to] = run ? [run.seqStart, run.seqEnd] : [0, T.N];
  const runIdx = run ? run.id : -1;
  for (let p = from; p < to; p++) if (at[p] >= 0 && (runIdx < 0 || T.seqF[p] === runIdx)) per[at[p]]++;
  const counts = new Map<string, number>();
  lines.forEach((l, k) => {
    if (per[k]) counts.set(l.op, (counts.get(l.op) ?? 0) + per[k]);
  });
  const ran = [...counts].map(([op, n]) => ({ op, n })).sort((a, b) => b.n - a.n || a.op.localeCompare(b.op));
  const notRun = new Set<string>();
  const progs = run ? (run.prog ? [run.prog] : []) : [...T.programs.values()];
  for (const p of progs) {
    if (p.synthetic) continue;
    for (const l of p.lines) {
      if (l.pc === undefined) continue;
      const op = opName(l.text);
      if (op && !counts.has(op)) notRun.add(op);
    }
  }
  return { ran, notRun: [...notRun].sort() };
}

/** The first index whose position is at least `pos`. */
function lowerBound(hits: Int32Array, pos: number): number {
  let lo = 0;
  let hi = hits.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (hits[mid] < pos) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** The first hit after `pos`, wrapping to the first. */
export function nextHit(hits: Int32Array, pos: number): number | undefined {
  if (!hits.length) return undefined;
  const k = lowerBound(hits, pos + 1);
  return hits[k < hits.length ? k : 0];
}

/** The last hit before `pos`, wrapping to the last. */
export function prevHit(hits: Int32Array, pos: number): number | undefined {
  if (!hits.length) return undefined;
  const k = lowerBound(hits, pos) - 1;
  return hits[k >= 0 ? k : hits.length - 1];
}

/** Which hit `pos` is (0-based), or -1. */
export function hitIndex(hits: Int32Array, pos: number): number {
  const k = lowerBound(hits, pos);
  return hits[k] === pos ? k : -1;
}
