import { describe, expect, it } from "vitest";
import {
  applyStep,
  bpKey,
  breakpointPositions,
  buildStepper,
  callStack,
  depthAt,
  frameAt,
  isRestated,
  runTo,
  stateAt,
  stepBackOver,
  stepOut,
  stepOver,
  writesBefore,
  type Frame,
  type RunState,
} from "./traceStepper";
import type { AvmValue, SCDevRound, TraceStep } from "./txnDevInfo";

const u = (n: number): AvmValue => ({ type: 2, uint: n });
const key = Buffer.from("k").toString("base64");

// The caller: pushes 7, calls a subroutine that stores 8 in slot 0, runs an
// inner app call, then returns its 7.
const caller = {
  hash: "C",
  lines: [
    { text: "#pragma version 10" },
    { pc: 1, text: "int 7" },
    { pc: 2, text: "callsub sub" },
    { pc: 5, text: "itxn_submit" },
    { pc: 6, text: "return" },
    { text: "sub:" },
    { pc: 7, text: "int 8" },
    { pc: 8, text: "store 0" },
    { pc: 9, text: "retsub" },
  ],
};
const callerSteps: TraceStep[] = [
  { pc: 1, "stack-additions": [u(7)] },
  { pc: 2 },
  { pc: 7, "stack-additions": [u(8)] },
  { pc: 8, "stack-pop-count": 1, "scratch-changes": [{ slot: 0, "new-value": u(8) }] },
  { pc: 9 },
  // As go-algorand's simulate reports it: the inner call's `return` left the
  // shared stack height at 0, so the submit restates the caller's [7].
  { pc: 5, "spawned-inners": [0], "stack-additions": [u(7)] },
  { pc: 6, "stack-pop-count": 1 },
];
const innerSteps: TraceStep[] = [
  { pc: 1, "stack-additions": [u(1)], "state-changes": [{ "app-state-type": "g", operation: "w", key, "new-value": u(5) }] },
  { pc: 2, "stack-pop-count": 1 },
];

const dev: SCDevRound = {
  round: 10,
  traces: [
    // A logic sig payment, listed first but after nothing: logic sigs run first anyway.
    { txid: "L", "exec-trace": { "logic-sig-hash": "S", "logic-sig-trace": [{ pc: 1, "stack-additions": [u(1)] }] } },
    // A clear state program that failed after writing: rolled back.
    {
      txid: "X",
      "exec-trace": {
        "clear-state-program-hash": "Z",
        "clear-state-program-trace": [{ pc: 1, "state-changes": [{ "app-state-type": "g", operation: "w", key, "new-value": u(9) }] }],
        "clear-state-rollback": true,
        "clear-state-rollback-error": "err opcode",
      },
    },
    {
      txid: "A",
      "exec-trace": {
        "approval-program-hash": "C",
        "approval-program-trace": callerSteps,
        "inner-trace": [{ "approval-program-hash": "I", "approval-program-trace": innerSteps }],
      },
    },
  ],
  programs: [caller],
};

const T = buildStepper(dev, [
  { path: [4], txid: "A", kind: "approval", "app-id": 77, cost: 10, "budget-before": 1400, "budget-after": 1390 },
  { path: [4, 0], kind: "approval", "app-id": 88, cost: 2, "budget-before": 1390, "budget-after": 1388 },
]);
const byKind = (kind: string, depth = 0) => T.frames.find((f) => f.kind === kind && f.depthIn === depth) as Frame;
const callerF = T.frames.find((f) => f.hash === "C") as Frame;
const innerF = T.frames.find((f) => f.hash === "I") as Frame;
const uints = (st: RunState) => st.stack.map((v) => Number(v.uint ?? 0));

describe("trace stepper", () => {
  it("runs the group's logic sigs first, then each transaction's programs, inner runs after their submit", () => {
    expect(T.frames.map((f) => f.kind)).toEqual(["lsig", "clear", "approval", "approval"]);
    expect(frameAt(T, 0).kind).toBe("lsig");
    // Each run's ops, then its end position; the inner run right after the submit.
    expect(innerF.seqStart).toBe(callerF.pos[5] + 1);
    expect(callerF.pos[6]).toBe(innerF.seqEnd + 1);
    expect(T.N).toBe(2 + 2 + 8 + 3);
    expect(T.tops.map((t) => t.frames.length)).toEqual([1, 1, 1]);
  });

  it("takes paths and apps from the budget runs", () => {
    expect(callerF.path).toEqual([4]);
    expect(callerF.appId).toBe(77);
    expect(innerF.path).toEqual([4, 0]);
    expect(innerF.appId).toBe(88);
    // Without budget runs of its own, where its group puts it: A, third, is at 4.
    expect(byKind("clear").path).toEqual([3]);
    expect(buildStepper(dev).frames.map((f) => f.path[0])).toEqual([0, 1, 2, 2]);
    expect(byKind("clear").rollback).toBe("err opcode");
  });

  it("ignores an itxn_submit's restated stack", () => {
    expect(uints(stateAt(T, callerF, 6))).toEqual([7]);
    expect(isRestated(callerF, 5)).toBe(true);
    expect(isRestated(callerF, 0)).toBe(false);
    expect(uints(stateAt(T, callerF, 7))).toEqual([]);
    // Whatever it re-reports, not only the top of the stack again: itxn_submit never pushes.
    const f = { ...callerF, steps: [{ pc: 5, "spawned-inners": [0], "stack-additions": [u(3)] }] } as Frame;
    const st: RunState = { stack: [], scratch: new Map(), calls: [] };
    applyStep(f, 0, st);
    expect(uints(st)).toEqual([]);
  });

  it("tracks scratch slots and subroutine calls", () => {
    expect(stateAt(T, callerF, 2).calls).toMatchObject([{ label: "sub", pc: 2 }]);
    expect(depthAt(T, callerF.pos[3])).toBe(1);
    expect(stateAt(T, callerF, 5).calls).toEqual([]);
    expect(Number(stateAt(T, callerF, 4).scratch.get(0)?.v.uint)).toBe(8);
    // Writing uint 0 unsets the slot.
    const f = { ...callerF, steps: [{ pc: 8, "scratch-changes": [{ slot: 0, "new-value": u(0) }] }] } as Frame;
    const st = { stack: [], scratch: new Map([[0, { v: u(8), at: 0 }]]), calls: [] };
    applyStep(f, 0, st);
    expect(st.scratch.size).toBe(0);
  });

  it("steps over subroutines and inner transactions, and out of both", () => {
    expect(stepOver(T, callerF.pos[1])).toBe(callerF.pos[5]);
    expect(stepOver(T, callerF.pos[5])).toBe(callerF.pos[6]);
    expect(stepBackOver(T, callerF.pos[6])).toBe(callerF.pos[5]);
    expect(stepBackOver(T, callerF.pos[5])).toBe(callerF.pos[1]);
    expect(stepOut(T, callerF.pos[3])).toBe(callerF.pos[5]);
    // Out of an inner run: to the caller's op after the submit.
    expect(stepOut(T, innerF.pos[0])).toBe(callerF.pos[6]);
    // Past a run's end: the next run.
    expect(stepOver(T, byKind("lsig").pos[1])).toBe(byKind("clear").seqStart);
  });

  it("steps out of one of a submit's inner runs to its caller, and back from a run's end inside a subroutine", () => {
    // `itxn_submit` runs two inner app calls; the second program returns inside a subroutine.
    const prog = { hash: "P", lines: [{ pc: 1, text: "callsub s" }, { pc: 4, text: "itxn_submit" }, { pc: 5, text: "int 1" }, { text: "s:" }, { pc: 6, text: "int 1" }, { pc: 7, text: "return" }] };
    const T2 = buildStepper({
      traces: [{
        txid: "A",
        "exec-trace": {
          "approval-program-hash": "P",
          "approval-program-trace": [{ pc: 4, "spawned-inners": [0, 1] }, { pc: 5, "stack-additions": [u(1)] }],
          "inner-trace": [
            { "approval-program-hash": "Q", "approval-program-trace": [{ pc: 1 }, { pc: 2 }] },
            { "approval-program-hash": "P", "approval-program-trace": [{ pc: 1 }, { pc: 6, "stack-additions": [u(1)] }, { pc: 7, "stack-pop-count": 1 }] },
          ],
        },
      }],
      programs: [prog],
    });
    const [caller, first, second] = T2.frames;
    expect(stepOut(T2, first.pos[0])).toBe(caller.pos[1]);
    expect(stepOut(T2, first.pos[0], (q) => q === second.pos[0])).toBe(second.pos[0]);
    // The second ends in subroutine s: back over from its end is its last op, not its callsub.
    expect(depthAt(T2, second.pos[2])).toBe(1);
    expect(stepBackOver(T2, second.seqEnd)).toBe(second.pos[2]);
  });

  it("stops at breakpoints on the way", () => {
    const bps = breakpointPositions(T, new Set([bpKey("I", 2)]));
    expect(bps).toEqual([innerF.pos[1]]);
    const isBp = (q: number) => bps.includes(q);
    expect(stepOver(T, callerF.pos[5], isBp)).toBe(innerF.pos[1]);
    expect(stepOut(T, callerF.pos[0], isBp)).toBe(innerF.pos[1]);
    expect(runTo(T, 0, "C", 6)).toBe(callerF.pos[6]);
    // Nothing ahead: back to where it last ran.
    expect(runTo(T, T.N - 1, "C", 6)).toBe(callerF.pos[6]);
    expect(runTo(T, callerF.pos[6], "C", 1)).toBe(callerF.pos[0]);
    expect(runTo(T, 0, "C", 99)).toBeUndefined();
  });

  it("gives the call stack through subroutines and inner transactions", () => {
    expect(callStack(T, callerF.pos[3]).map((c) => c.kind)).toEqual(["sub", "run"]);
    const inner = callStack(T, innerF.pos[1]);
    expect(inner.map((c) => c.kind)).toEqual(["run", "submit", "run"]);
    expect(inner[1]).toMatchObject({ pc: 5, pos: callerF.pos[5] });
    expect(inner[2]).toMatchObject({ frame: callerF, current: false });
  });

  it("lists state written so far, without a failed clear state program's once it ends", () => {
    const clear = byKind("clear");
    expect(writesBefore(T, clear.pos[0]).count).toBe(0);
    expect(writesBefore(T, clear.seqEnd).rows.map((w) => Number(w.c["new-value"]?.uint))).toEqual([9]);
    expect(writesBefore(T, clear.seqEnd + 1).count).toBe(0);
    const end = writesBefore(T, T.N - 1);
    expect(end.count).toBe(1);
    expect(end.rows[0]).toMatchObject({ frame: innerF, n: 1 });
  });

  it("keeps two apps' writes to one key apart without budget runs", () => {
    const write = { pc: 1, "state-changes": [{ "app-state-type": "g" as const, operation: "w" as const, key, "new-value": u(1) }] };
    const T0 = buildStepper({
      traces: [
        { txid: "A", "exec-trace": { "approval-program-hash": "H1", "approval-program-trace": [write] } },
        { txid: "B", "exec-trace": { "approval-program-hash": "H2", "approval-program-trace": [write] } },
        { txid: "C", "exec-trace": { "approval-program-hash": "H1", "approval-program-trace": [write] } },
      ],
    });
    const rows = writesBefore(T0, T0.N).rows;
    expect(rows.map((w) => [w.frame.hash, w.n])).toEqual([["H1", 2], ["H2", 1]]);
  });
});
