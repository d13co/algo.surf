import { describe, expect, it } from "vitest";
import { hitIndex, inRun, nextHit, opCounts, prevHit, searchOps } from "./opSearch";
import { buildStepper, type Frame } from "./traceStepper";
import type { AvmValue, SCDevRound, TraceStep } from "./txnDevInfo";

const u = (n: number): AvmValue => ({ type: 2, uint: n });

// A caller that calls a subroutine and an inner app call; the inner program
// has a line that never runs. The logic sig's program has no disassembly.
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
const inner = {
  hash: "I",
  lines: [
    { pc: 1, text: "int 1" },
    { pc: 2, text: "return" },
    { pc: 3, text: "err" },
    { pc: 4, text: "b+" },
    { pc: 5, text: "b label" },
    { pc: 6, text: "intc_0" },
  ],
};
const callerSteps: TraceStep[] = [
  { pc: 1, "stack-additions": [u(7)] },
  { pc: 2 },
  { pc: 7, "stack-additions": [u(8)] },
  { pc: 8, "stack-pop-count": 1, "scratch-changes": [{ slot: 0, "new-value": u(8) }] },
  { pc: 9 },
  { pc: 5, "spawned-inners": [0], "stack-additions": [u(7)] },
  { pc: 6, "stack-pop-count": 1 },
];
const innerSteps: TraceStep[] = [{ pc: 1, "stack-additions": [u(1)] }, { pc: 2, "stack-pop-count": 1 }];

const dev: SCDevRound = {
  round: 10,
  traces: [
    { txid: "L", "exec-trace": { "logic-sig-hash": "S", "logic-sig-trace": [{ pc: 1, "stack-additions": [u(1)] }] } },
    {
      txid: "A",
      "exec-trace": {
        "approval-program-hash": "C",
        "approval-program-trace": callerSteps,
        "inner-trace": [{ "approval-program-hash": "I", "approval-program-trace": innerSteps }],
      },
    },
  ],
  programs: [caller, inner],
};

const T = buildStepper(dev);
const callerF = T.frames.find((f) => f.hash === "C") as Frame;
const innerF = T.frames.find((f) => f.hash === "I") as Frame;
const at = (f: Frame, ...steps: number[]) => steps.map((i) => f.pos[i]);
const hits = (text: string, mode: "op" | "line" = "op", regex = false, run?: Frame) => {
  const r = searchOps(T, { text, mode, regex });
  return [...((r && run ? inRun(T, r, run) : r)?.hits ?? [])];
};

describe("op search", () => {
  it("finds ops by name prefix, in execution order, inner runs included", () => {
    expect(hits("int")).toEqual([...at(callerF, 0, 2), ...at(innerF, 0)].sort((a, b) => a - b));
    expect(hits("i")).toEqual([...at(callerF, 0, 2), ...at(innerF, 0), ...at(callerF, 5)].sort((a, b) => a - b));
    // Case and surrounding space don't matter; a name's middle doesn't match.
    expect(hits(" ITXN ")).toEqual(at(callerF, 5));
    expect(hits("sub")).toEqual([]);
  });

  it("finds text anywhere in the line", () => {
    // itxn_submit too.
    expect(hits("sub", "line")).toEqual(at(callerF, 1, 4, 5));
    expect(hits("int 8", "line")).toEqual(at(callerF, 2));
  });

  it("takes a regular expression, and says why one doesn't parse", () => {
    expect(hits("^(int|store)$", "op", true)).toEqual([...at(callerF, 0, 2, 3), ...at(innerF, 0)].sort((a, b) => a - b));
    expect(hits("\\d$", "line", true)).toEqual([...at(callerF, 0, 2, 3), ...at(innerF, 0)].sort((a, b) => a - b));
    const bad = searchOps(T, { text: "(", mode: "op", regex: true });
    expect(bad?.error).toBeTruthy();
    expect(bad?.hits.length).toBe(0);
  });

  it("finds one op exactly, as picked from the list, whatever characters its name has", () => {
    const exact = (text: string) => searchOps(T, { text, mode: "op", regex: false, exact: true });
    expect([...(exact("int")?.hits ?? [])]).toEqual([...at(callerF, 0, 2), ...at(innerF, 0)].sort((a, b) => a - b));
    // Not intc_0, which `int` starts.
    expect(exact("int")?.pcs.get("I")).toEqual(new Set([1]));
    expect(exact("b+")?.pcs.get("I")).toEqual(new Set([4]));
    expect(exact("b")?.pcs.get("I")).toEqual(new Set([5]));
    expect(exact("b+")?.error).toBeUndefined();
    // In line mode, exact means nothing: a substring as ever.
    expect(searchOps(T, { text: "b", mode: "line", regex: false, exact: true })?.pcs.get("I")).toEqual(new Set([4, 5]));
  });

  it("finds nothing for an empty query", () => {
    expect(searchOps(T, { text: "  ", mode: "op", regex: false })).toBeUndefined();
    expect(searchOps(T, { text: "", mode: "line", regex: true })).toBeUndefined();
  });

  it("limits hits to one run, leaving out the inner runs within it", () => {
    expect(hits("int", "op", false, callerF)).toEqual(at(callerF, 0, 2));
    expect(hits("int", "op", false, innerF)).toEqual(at(innerF, 0));
  });

  it("marks matching lines per program, ran or not", () => {
    const r = searchOps(T, { text: "e", mode: "op", regex: false });
    expect(r?.pcs.get("I")).toEqual(new Set([3]));
    expect(r?.hits.length).toBe(0);
    expect(searchOps(T, { text: "int", mode: "op", regex: false })?.pcs).toEqual(new Map([["C", new Set([1, 7])], ["I", new Set([1, 6])]]));
  });

  it("counts the ops that ran, and names those that never did", () => {
    const all = opCounts(T);
    expect(all.ran[0]).toEqual({ op: "int", n: 3 });
    expect(all.ran.find((c) => c.op === "return")?.n).toBe(2);
    expect(all.notRun).toEqual(["b", "b+", "err", "intc_0"]);
    const one = opCounts(T, callerF);
    expect(one.ran.find((c) => c.op === "int")?.n).toBe(2);
    expect(one.notRun).toEqual([]);
    expect(opCounts(T, innerF).notRun).toEqual(["b", "b+", "err", "intc_0"]);
  });

  it("goes to the next and previous hit, wrapping", () => {
    const h = Int32Array.from([3, 7, 12]);
    expect(nextHit(h, 0)).toBe(3);
    expect(nextHit(h, 3)).toBe(7);
    expect(nextHit(h, 12)).toBe(3);
    expect(prevHit(h, 7)).toBe(3);
    expect(prevHit(h, 8)).toBe(7);
    expect(prevHit(h, 3)).toBe(12);
    expect(nextHit(new Int32Array(0), 5)).toBeUndefined();
    expect(hitIndex(h, 7)).toBe(1);
    expect(hitIndex(h, 8)).toBe(-1);
  });
});
