import type { SourceMapping, SrcLine } from "./arc56Source";
import { depthAt, frameAt, type Frame, type Stepper } from "./traceStepper";

/**
 * Stepping by source line, over traceStepper's positions, for programs with a
 * source mapping from their ARC-56 spec (arc56Source).
 *
 * `mapFor` gives the mapping of a program shown by source line, by hash; a
 * program without one steps by op, as the TEAL view does. In a mapped
 * program, an op without a source line (a subroutine's `proto`, the constant
 * blocks) is never a place to stop: stepping goes on to the next op that has
 * one, or to the run's end.
 */

export type MapFor = (hash: string | undefined) => SourceMapping | undefined;
type IsBp = (q: number) => boolean;
const none: IsBp = () => false;

/** The source line of the op at position q; undefined at a run's end, in a program without a mapping, or for an op without a line. */
export function srcLineAt(T: Stepper, mapFor: MapFor, q: number): SrcLine | undefined {
  const f = frameAt(T, q);
  const s = f.steps[T.seqS[q]];
  return s ? mapFor(f.hash)?.byPc.get(Number(s.pc)) : undefined;
}

const isEnd = (T: Stepper, q: number) => T.seqS[q] >= frameAt(T, q).steps.length;
const pcAt = (T: Stepper, q: number) => Number(frameAt(T, q).steps[T.seqS[q]]?.pc ?? -1);

/**
 * A jump back: an op at `pc` no later than `last`, the pc of the op before
 * it in its run at the same subroutine depth or less. A loop on one line
 * enters its line again this way.
 */
const backEdge = (pc: number, last: number) => last >= 0 && pc <= last;

/**
 * The run's next op on another source line, at the same subroutine depth or
 * less: past subroutines and inner transactions, as stepOver goes. Stops at a
 * breakpoint on the way, and at the run's end.
 */
export function stepOverSource(T: Stepper, mapFor: MapFor, p: number, isBp: IsBp = none): number {
  const f = frameAt(T, p);
  const map = mapFor(f.hash);
  const d = depthAt(T, p);
  const from = srcLineAt(T, mapFor, p);
  let last = pcAt(T, p);
  for (let q = p + 1; q <= f.seqEnd; q++) {
    if (isBp(q)) return q;
    if (T.seqF[q] !== f.id || depthAt(T, q) > d) continue;
    if (!map || q === f.seqEnd) return q;
    const l = srcLineAt(T, mapFor, q);
    const pc = pcAt(T, q);
    if (l && (l !== from || backEdge(pc, last))) return q;
    last = pc;
  }
  return Math.min(T.N - 1, f.seqEnd + 1);
}

/**
 * The next op on another source line, or in another run, at any depth: into
 * subroutines and inner transactions. In a run without a mapping, its next
 * op. Stops at a breakpoint on the way, and at a run's end.
 */
export function stepIntoSource(T: Stepper, mapFor: MapFor, p: number, isBp: IsBp = none): number {
  const f = frameAt(T, p);
  const d = depthAt(T, p);
  const from = srcLineAt(T, mapFor, p);
  let last = pcAt(T, p);
  for (let q = p + 1; q < T.N; q++) {
    if (isBp(q) || isEnd(T, q)) return q;
    const g = frameAt(T, q);
    if (!mapFor(g.hash)) return q;
    const l = srcLineAt(T, mapFor, q);
    if (l && (g !== f || l !== from)) return q;
    if (g !== f || depthAt(T, q) > d) continue;
    const pc = pcAt(T, q);
    if (l && backEdge(pc, last)) return q;
    last = pc;
  }
  return T.N - 1;
}

/** Op i's nearest earlier op in its run at the same subroutine depth or less: the op before it on the same pass of a line. */
function prevOp(T: Stepper, f: Frame, i: number): number {
  const d = depthAt(T, f.pos[i]);
  let j = i - 1;
  while (j >= 0 && depthAt(T, f.pos[j]) > d) j--;
  return j;
}

/** Whether op i of run f enters its line (`has` tells the line's pcs): the op before it, past subroutine calls, was on another line, or jumped back (a loop on one line). */
function enters(T: Stepper, f: Frame, i: number, has: (pc: number) => boolean): boolean {
  const j = prevOp(T, f, i);
  if (j < 0) return true;
  const pj = Number(f.steps[j].pc);
  return !has(pj) || backEdge(Number(f.steps[i].pc), pj);
}

/**
 * The positions where a source line is entered: an op of the line (one of
 * `pcs`, in program `hash`) whose op before it in the run, past subroutine
 * calls, was not, or which a jump back reached. A line with several ops is
 * entered once per pass, and a loop on one line once per time round.
 */
export function lineEntries(T: Stepper, hash: string, pcs: Iterable<number>): number[] {
  const set = new Set(pcs);
  const has = (pc: number) => set.has(pc);
  const out: number[] = [];
  for (const f of T.frames) {
    if (f.hash !== hash) continue;
    for (let i = 0; i < f.steps.length; i++) if (has(Number(f.steps[i].pc)) && enters(T, f, i, has)) out.push(f.pos[i]);
  }
  return out.sort((a, b) => a - b);
}

/** How many times each of a mapping's lines was entered in program `hash`'s runs (as lineEntries counts). */
export function linePasses(T: Stepper, hash: string, map: SourceMapping): Map<SrcLine, number> {
  const out = new Map<SrcLine, number>();
  for (const f of T.frames) {
    if (f.hash !== hash) continue;
    for (let i = 0; i < f.steps.length; i++) {
      const l = map.byPc.get(Number(f.steps[i].pc));
      if (!l) continue;
      if (enters(T, f, i, (pc) => map.byPc.get(pc) === l)) out.set(l, (out.get(l) ?? 0) + 1);
    }
  }
  return out;
}

/** A source-line breakpoint: a program (by hash) and its line's pcs, for every run of that program. */
export const lineBpKey = (hash: string, pcs: number[]) => `${hash}#${pcs.join(",")}`;

export function parseLineBpKey(k: string): { hash: string; pcs: number[] } {
  const at = k.lastIndexOf("#");
  return { hash: k.slice(0, at), pcs: k.slice(at + 1).split(",").filter(Boolean).map(Number) };
}

/** The positions where source-line breakpoints `bps` stop, in order: where their lines are entered. */
export function lineBreakpointPositions(T: Stepper, bps: Set<string>): number[] {
  const out = new Set<number>();
  for (const k of bps) {
    const { hash, pcs } = parseLineBpKey(k);
    for (const q of lineEntries(T, hash, pcs)) out.add(q);
  }
  return [...out].sort((a, b) => a - b);
}

/** Sorted positions, merged without repeats. */
export function mergePositions(a: number[], b: number[]): number[] {
  if (!b.length) return a;
  if (!a.length) return b;
  return [...new Set([...a, ...b])].sort((x, y) => x - y);
}

/**
 * Where program `hash` next enters the source line with `pcs` after p; if it
 * never does again, where it last did before p (running back to it).
 */
export function runToLine(T: Stepper, p: number, hash: string, pcs: number[]): number | undefined {
  const at = lineEntries(T, hash, pcs);
  return at.find((q) => q > p) ?? [...at].reverse().find((q) => q < p);
}
