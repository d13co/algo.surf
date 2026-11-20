import { describe, expect, it } from "vitest";
import type { SourceMapping, SrcLine } from "./arc56Source";
import {
  lineBpKey,
  lineBreakpointPositions,
  lineEntries,
  linePasses,
  mergePositions,
  parseLineBpKey,
  runToLine,
  srcLineAt,
  stepIntoSource,
  stepOverSource,
  type MapFor,
} from "./sourceStepper";
import { buildStepper, type Frame } from "./traceStepper";
import type { SCDevRound, TraceStep } from "./txnDevInfo";

// The caller: constant blocks (no line), line 10 calls a subroutine twice,
// line 11 runs an inner app call, line 12 returns. The subroutine's proto has
// no line; line 20 has two ops, line 21 its retsub.
const caller = {
  hash: "C",
  lines: [
    { text: "#pragma version 10" },
    { pc: 1, text: "intcblock 1" },
    { pc: 2, text: "int 7" },
    { pc: 3, text: "callsub sub" },
    { pc: 4, text: "callsub sub" },
    { pc: 5, text: "itxn_submit" },
    { pc: 6, text: "pop" },
    { pc: 7, text: "int 1" },
    { pc: 8, text: "return" },
    { text: "sub:" },
    { pc: 9, text: "proto 0 0" },
    { pc: 10, text: "int 8" },
    { pc: 11, text: "store 0" },
    { pc: 12, text: "retsub" },
  ],
};
const inner = {
  hash: "I",
  lines: [
    { pc: 1, text: "int 1" },
    { pc: 2, text: "return" },
  ],
};
const pcs = [1, 2, 3, 9, 10, 11, 12, 4, 9, 10, 11, 12, 5, 6, 7, 8];
const callerSteps: TraceStep[] = pcs.map((pc) => (pc === 5 ? { pc, "spawned-inners": [0] } : { pc }));

const dev: SCDevRound = {
  round: 1,
  traces: [
    {
      txid: "A",
      "exec-trace": {
        "approval-program-hash": "C",
        "approval-program-trace": callerSteps,
        "inner-trace": [{ "approval-program-hash": "I", "approval-program-trace": [{ pc: 1 }, { pc: 2 }] }],
      },
    },
  ],
  programs: [caller, inner],
};

/** A mapping from pc → line number, in one file. */
function mapping(file: string, at: Record<number, number>): SourceMapping {
  const byLine = new Map<number, SrcLine>();
  const byPc = new Map<number, SrcLine>();
  for (const [pc, line] of Object.entries(at)) {
    let s = byLine.get(line);
    if (!s) byLine.set(line, (s = { file, line, text: `line ${line}`, pcs: [] }));
    s.pcs.push(Number(pc));
    byPc.set(Number(pc), s);
  }
  return { byPc, lines: [...byLine.values()], subs: new Map(), errors: new Map() };
}

const C = mapping("c.algo.ts", { 2: 10, 3: 10, 4: 10, 5: 11, 6: 11, 7: 12, 8: 12, 10: 20, 11: 20, 12: 21 });
const I = mapping("i.algo.ts", { 1: 30, 2: 31 });
const both: MapFor = (h) => (h === "C" ? C : h === "I" ? I : undefined);
const callerOnly: MapFor = (h) => (h === "C" ? C : undefined);

const T = buildStepper(dev);
const cf = T.frames.find((f) => f.hash === "C") as Frame;
const inf = T.frames.find((f) => f.hash === "I") as Frame;
const P = (i: number) => cf.pos[i];
const line = (n: number) => C.lines.find((l) => l.line === n) as SrcLine;

describe("source stepper", () => {
  it("gives each op's source line, none for ops without one or at a run's end", () => {
    expect(srcLineAt(T, both, P(0))).toBeUndefined();
    expect(srcLineAt(T, both, P(1))?.line).toBe(10);
    expect(srcLineAt(T, both, P(3))).toBeUndefined();
    expect(srcLineAt(T, both, cf.seqEnd)).toBeUndefined();
    expect(srcLineAt(T, callerOnly, inf.pos[0])).toBeUndefined();
  });

  it("steps over by line, past subroutine calls and inner runs", () => {
    // From the constant blocks (no line) to the first op with a line.
    expect(stepOverSource(T, both, P(0))).toBe(P(1));
    // Line 10's two callsubs are run over; line 11 is next.
    expect(stepOverSource(T, both, P(1))).toBe(P(12));
    expect(stepOverSource(T, both, P(2))).toBe(P(12));
    // The inner app call is run over, and line 11's pop too.
    expect(stepOverSource(T, both, P(12))).toBe(P(14));
    // Line 12 is the last: on to the run's end.
    expect(stepOverSource(T, both, P(14))).toBe(cf.seqEnd);
    // In the subroutine: to its next line, then out to the caller's line.
    expect(stepOverSource(T, both, P(4))).toBe(P(6));
    expect(stepOverSource(T, both, P(6))).toBe(P(7));
  });

  it("stops at a breakpoint on the way, even on an op without a line", () => {
    expect(stepOverSource(T, both, P(12), (q) => q === inf.pos[1])).toBe(inf.pos[1]);
    expect(stepIntoSource(T, both, P(2), (q) => q === P(3))).toBe(P(3));
  });

  it("steps into by line, past ops without a line", () => {
    // Into the subroutine: past its proto to line 20.
    expect(stepIntoSource(T, both, P(2))).toBe(P(4));
    expect(stepIntoSource(T, both, P(4))).toBe(P(6));
    // Its retsub returns to line 10's second callsub: another line.
    expect(stepIntoSource(T, both, P(6))).toBe(P(7));
    // Into the inner app call, line by line, to its end, then back out.
    expect(stepIntoSource(T, both, P(12))).toBe(inf.pos[0]);
    expect(stepIntoSource(T, both, inf.pos[0])).toBe(inf.pos[1]);
    expect(stepIntoSource(T, both, inf.pos[1])).toBe(inf.seqEnd);
    expect(stepIntoSource(T, both, inf.seqEnd)).toBe(P(13));
    // An inner run without a mapping stops at its first op.
    expect(stepIntoSource(T, callerOnly, P(12))).toBe(inf.pos[0]);
    expect(stepIntoSource(T, callerOnly, inf.pos[0])).toBe(inf.pos[1]);
  });

  it("enters a line with several ops once per pass", () => {
    // Line 20 runs twice, two ops each time.
    expect(lineEntries(T, "C", line(20).pcs)).toEqual([P(4), P(9)]);
    // Line 10's second callsub follows its first, past the subroutine: the same pass.
    expect(lineEntries(T, "C", line(10).pcs)).toEqual([P(1)]);
    const bps = new Set([lineBpKey("C", line(20).pcs), lineBpKey("I", [2])]);
    const at = lineBreakpointPositions(T, bps);
    expect(at).toEqual([P(4), P(9), inf.pos[1]]);
    expect(parseLineBpKey(lineBpKey("a+b/c=", [10, 11]))).toEqual({ hash: "a+b/c=", pcs: [10, 11] });
    // Step over from line 10 stops at line 20 inside the subroutine, once per call.
    const isBp = (q: number) => at.includes(q);
    expect(stepOverSource(T, both, P(1), isBp)).toBe(P(4));
    expect(stepOverSource(T, both, P(4), isBp)).toBe(P(6));
    expect(stepOverSource(T, both, P(7), isBp)).toBe(P(9));
    expect(mergePositions([1, 5], [3, 5])).toEqual([1, 3, 5]);
    // Passes per line: line 20 twice, line 10 once, though it has three ops.
    const passes = linePasses(T, "C", C);
    expect(passes.get(line(20))).toBe(2);
    expect(passes.get(line(10))).toBe(1);
  });

  it("runs to a line forward, else back", () => {
    expect(runToLine(T, 0, "C", line(20).pcs)).toBe(P(4));
    expect(runToLine(T, P(5), "C", line(20).pcs)).toBe(P(9));
    // Not run again: back to where it was last entered.
    expect(runToLine(T, P(12), "C", line(20).pcs)).toBe(P(9));
    expect(runToLine(T, P(9), "C", line(20).pcs)).toBe(P(4));
    expect(runToLine(T, 0, "C", [99])).toBeUndefined();
  });
});

// A loop on one line: line 4 (pc 1), then line 5 (pcs 2 and 3) three times
// round, jumping back from 3 to 2, then line 6 (pc 4).
const loopDev: SCDevRound = {
  round: 1,
  traces: [{ txid: "L", "exec-trace": { "approval-program-hash": "L", "approval-program-trace": [1, 2, 3, 2, 3, 2, 3, 4].map((pc) => ({ pc })) } }],
  programs: [
    {
      hash: "L",
      lines: [
        { pc: 1, text: "int 3" },
        { text: "loop:" },
        { pc: 2, text: "int 1" },
        { pc: 3, text: "bnz loop" },
        { pc: 4, text: "return" },
      ],
    },
  ],
};
const LM = mapping("l.algo.ts", { 1: 4, 2: 5, 3: 5, 4: 6 });
const loopMap: MapFor = (h) => (h === "L" ? LM : undefined);

describe("source stepper, a loop on one line", () => {
  const T2 = buildStepper(loopDev);
  const lf = T2.frames[0];
  const Q = (i: number) => lf.pos[i];
  const l5 = LM.lines.find((l) => l.line === 5) as SrcLine;

  it("steps over and into each time round", () => {
    expect(stepOverSource(T2, loopMap, Q(0))).toBe(Q(1));
    expect(stepOverSource(T2, loopMap, Q(1))).toBe(Q(3));
    expect(stepOverSource(T2, loopMap, Q(3))).toBe(Q(5));
    expect(stepOverSource(T2, loopMap, Q(5))).toBe(Q(7));
    expect(stepIntoSource(T2, loopMap, Q(1))).toBe(Q(3));
    expect(stepIntoSource(T2, loopMap, Q(4))).toBe(Q(5));
  });

  it("stops at a breakpoint on it each time round", () => {
    expect(lineEntries(T2, "L", l5.pcs)).toEqual([Q(1), Q(3), Q(5)]);
    expect(lineBreakpointPositions(T2, new Set([lineBpKey("L", l5.pcs)]))).toEqual([Q(1), Q(3), Q(5)]);
    expect(linePasses(T2, "L", LM).get(l5)).toBe(3);
  });

  it("runs to its next time round from inside it", () => {
    expect(runToLine(T2, Q(1), "L", l5.pcs)).toBe(Q(3));
    expect(runToLine(T2, Q(4), "L", l5.pcs)).toBe(Q(5));
    // After the last time round: back to it.
    expect(runToLine(T2, Q(6), "L", l5.pcs)).toBe(Q(5));
  });
});
