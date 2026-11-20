import { readFileSync } from "node:fs";
import type { Arc56Contract } from "@algorandfoundation/algokit-utils/types/app-arc56";
import { describe, expect, it } from "vitest";
import { matchSpec, type PuyaMap, type SourceMapping } from "./arc56Source";
import { alignNames, frameNamesAt, RETURN_NAME, shortStackName, stackNamesAt } from "./stackNames";
import { buildStepper, lineText, opName, stateAt, type Frame } from "./traceStepper";

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8"));
const escreg: Arc56Contract = fixture("Escreg.arc56.json");
const escregMap: PuyaMap = fixture("Escreg.approval.puya.map");
const disasm = fixture("Escreg.approval.disassembly.json") as { hash: string; lines: { pc?: number; text: string }[] };
const steps = (fixture("Escreg.getWithAuthList.steps.json") as { steps: [number, number, number][] }).steps;

// The localnet run of getWithAuthList, its values replaced by uint 0s: only the stack's height matters here.
const T = buildStepper({
  traces: [
    {
      txid: "A",
      "exec-trace": {
        "approval-program-hash": disasm.hash,
        "approval-program-trace": steps.map(([pc, add, pop]) => ({
          pc,
          ...(add && { "stack-additions": Array.from({ length: add }, () => ({ type: 2 as const })) }),
          ...(pop && { "stack-pop-count": pop }),
        })),
      },
    },
  ],
  programs: [disasm],
});
const f = T.frames.find((x) => x.kind === "approval") as Frame;
const map = matchSpec(f.prog!, escreg, "approval", escregMap) as SourceMapping;
const op = (i: number) => opName(lineText(f.prog, Number(f.steps[i].pc)));

describe("stack names from a .puya.map", () => {
  it("has the map's stack_out and stack_in", () => {
    expect(map.stackOut?.size).toBeGreaterThan(0);
    expect(map.stackIn?.get(274)).toEqual(["mbrBefore#0"]);
  });

  it("names exactly the values above the frame pointer, at every op of a real run", () => {
    // The frame pointer: the stack height after each `proto`, back to the caller's at its retsub.
    const fps = [0];
    let named = 0;
    let inSub = 0;
    for (let i = 0; i <= f.steps.length; i++) {
      const h = stateAt(T, f, i).stack.length;
      const names = stackNamesAt(map, f, i);
      if (names) {
        expect(names.length, `before op ${i} (${i < f.steps.length ? op(i) : "end"})`).toBe(h - fps[fps.length - 1]);
        named++;
        if (fps.length > 1 && names.length) inSub++;
      }
      if (i === f.steps.length) break;
      if (op(i) === "proto") fps.push(stateAt(T, f, i + 1).stack.length);
      if (op(i) === "retsub" && fps.length > 1) fps.pop();
    }
    expect(named).toBeGreaterThan(450);
    expect(inSub).toBeGreaterThan(100);
  });

  it("gives no names where the previous op has no stack_out (it is sparse), nor at a subroutine's entry", () => {
    // pc 1 (intcblock) has no stack_out: no names before op 1, not older ones.
    expect(op(0)).toBe("intcblock");
    expect(stackNamesAt(map, f, 1)).toBeUndefined();
    expect(stackNamesAt(map, f, 0)).toBeUndefined();
    const call = f.steps.findIndex((_, i) => op(i) === "callsub");
    expect(stackNamesAt(map, f, call + 1)).toBeUndefined();
    // Without stack_in at the next op, a missing stack_out names nothing.
    const sparse: SourceMapping = { ...map, stackOut: new Map([...map.stackOut!].filter(([pc]) => pc !== Number(f.steps[2].pc))), stackIn: new Map() };
    expect(stackNamesAt(map, f, 3)).toEqual(["tmp%0#0"]);
    expect(stackNamesAt(sparse, f, 3)).toBeUndefined();
    expect(stackNamesAt(undefined, f, 3)).toBeUndefined();
  });

  it("gives no names at a run's end, after a return or a failing op", () => {
    expect(op(f.steps.length - 1)).toBe("return");
    expect(stackNamesAt(map, f, f.steps.length)).toBeUndefined();
    // The same run cut short at an assert that failed: its stack_out is the stack had it passed.
    const at = f.steps.findIndex((_, i) => op(i) === "assert");
    expect(map.stackOut!.has(Number(f.steps[at].pc))).toBe(true);
    const failed = { ...f, steps: f.steps.slice(0, at + 1) } as Frame;
    expect(stackNamesAt(map, failed, at + 1)).toBeUndefined();
    expect(stackNamesAt(map, failed, at)).toBeDefined();
  });

  it("names the stack after a retsub from its callsub's stack_out", () => {
    const ret = f.steps.findIndex((_, i) => op(i) === "retsub");
    const back = Number(f.steps[ret + 1].pc);
    expect(stackNamesAt(map, f, ret + 1)).toEqual(map.stackOut!.get(back - 3));
  });

  it("aligns names with the top of the stack", () => {
    expect(alignNames(["a", "b"], 4)).toEqual([undefined, undefined, "a", "b"]);
    expect(alignNames([], 2)).toEqual([undefined, undefined]);
    expect(alignNames(["a", "b", "c"], 2)).toEqual([undefined, undefined]);
    expect(alignNames(undefined, 1)).toEqual([undefined]);
  });

  it("shortens names without their SSA versions", () => {
    expect(shortStackName("appId#0")).toBe("appId");
    expect(shortStackName("tmp%0#3")).toBe("tmp%0");
    expect(shortStackName("i#0 (copy)")).toBe("i (copy)");
    expect(shortStackName("Method(get(address)uint64)")).toBe("Method(get(address)uint64)");
    expect(shortStackName('"counter"')).toBe('"counter"');
  });
});

describe("TEALScript frame names", () => {
  // Counter (TEALScript 0.106.1) on localnet: add(150), which goes over 100 and so calls clamp; uints as numbers, bytes as hex.
  const counter: Arc56Contract = fixture("Counter.arc56.json");
  const cDis = fixture("Counter.approval.disassembly.json") as { hash: string; lines: { pc?: number; text: string }[] };
  const run = fixture("Counter.add.steps.json") as { steps: [number, (number | string)[], number][] };
  const value = (v: number | string) => (typeof v === "number" ? { type: 2 as const, uint: v } : { type: 1 as const, bytes: Buffer.from(v, "hex").toString("base64") });
  const CT = buildStepper({
    traces: [
      {
        txid: "C",
        "exec-trace": {
          "approval-program-hash": cDis.hash,
          "approval-program-trace": run.steps.map(([pc, add, pop]) => ({
            pc,
            ...(add.length && { "stack-additions": add.map(value) }),
            ...(pop && { "stack-pop-count": pop }),
          })),
        },
      },
    ],
    programs: [cDis],
  });
  const cf = CT.frames.find((x) => x.kind === "approval") as Frame;
  const cmap = matchSpec(cf.prog!, counter, "approval") as SourceMapping;
  const cop = (i: number) => lineText(cf.prog, Number(cf.steps[i].pc))!.trim();
  const names = (i: number) => {
    const st = stateAt(CT, cf, i);
    return { st, names: frameNamesAt(cmap, cf, i, st.calls, st.stack.length) };
  };

  it("has each subroutine's arguments and locals from the TEAL's comments", () => {
    const by = (sig: string) => [...cmap.subs].find(([, s]) => s.endsWith(`::${sig}`))![0];
    expect(cmap.frameNames?.get(by("createApplication(limit: uint64): void"))).toEqual(new Map([[-1, "limit"]]));
    expect(cmap.frameNames?.get(by("clamp(n: uint64): uint64"))).toEqual(new Map([[-1, "n"]]));
    expect(cmap.frameNames?.get(by("add(by: uint64): uint64"))).toEqual(new Map([[-1, "by"], [0, "next"]]));
    // Routes and the router have no frames.
    expect(cmap.frameNames?.size).toBe(3);
  });

  // The names the TEAL's comments give each frame_dig, by pc (the node's disassembly has none).
  const DIG = new Map([[83, "n"], [94, "n"], [120, "by"], [127, "by"], [132, "next"], [140, "next"], [150, "next"], [157, "next"], [160, "next"]]);
  const at = (pc: number) => cf.steps.findIndex((s) => Number(s.pc) === pc);

  it("names the value each frame_dig pushes, at every one of a real run", () => {
    let checked = 0;
    for (let i = 0; i < cf.steps.length; i++) {
      const m = /^frame_dig (-?\d+)/.exec(cop(i));
      if (!m) continue;
      const { st, names: named } = names(i);
      const slot = st.calls[st.calls.length - 1].fp + Number(m[1]);
      // The slot it reads holds the value it pushes, and has the comment's name.
      expect(st.stack[slot], `op ${i}: ${cop(i)}`).toEqual(cf.steps[i]["stack-additions"]![0]);
      expect(named?.[slot], `op ${i}: ${cop(i)}`).toBe(DIG.get(Number(cf.steps[i].pc)));
      checked++;
    }
    // add's by (twice), next (three times), clamp's n (twice).
    expect(checked).toBe(7);
  });

  it("names the innermost call's frame, the caller's again after it returns, and nothing outside calls", () => {
    // In clamp, called from add: only clamp's n (add's slots are below its frame pointer).
    const inClamp = at(83);
    const { st, names: named } = names(inClamp);
    expect(st.calls).toHaveLength(2);
    expect(named?.filter(Boolean)).toEqual(["n"]);
    // Back in add, after clamp's retsub: `frame_bury 0 // next` stores what clamp returned.
    const back = at(145);
    expect(back).toBeGreaterThan(inClamp);
    expect(names(back).names?.filter(Boolean)).toEqual(["by", "next"]);
    // The router, before any callsub.
    expect(names(3).names).toBeUndefined();
  });

  it("names slot 0 the return value once the subroutine puts it there", () => {
    // add's `frame_bury 0` at pc 162 (no variable: "set the subroutine return value"), then its retsub at 164.
    expect(cmap.frameReturns).toEqual(new Set([162]));
    const bury = at(162);
    const { st, names: before } = names(bury);
    const fp = st.calls[st.calls.length - 1].fp;
    expect(before?.[fp]).toBe("next");
    expect(names(bury + 1).names?.[fp]).toBe(RETURN_NAME);
  });

  it("keeps the return value's name through popn, and only right after its frame_bury", () => {
    // A subroutine with two locals: frame_bury 0 (the return), popn 1, retsub.
    const lines = [
      { pc: 0, text: "callsub label1" },
      { pc: 3, text: "label1:" },
      { pc: 3, text: "proto 0 1" },
      { pc: 6, text: "frame_bury 0" },
      { pc: 8, text: "popn 1" },
      { pc: 10, text: "retsub" },
    ];
    const prog = { hash: "S", lines, pcLine: new Map(lines.flatMap((l, k) => (l.text.endsWith(":") ? [] : [[l.pc, k] as [number, number]]))) };
    const sf = { prog, steps: [0, 3, 6, 8, 10].map((pc) => ({ pc })) } as unknown as Frame;
    const map = { frameNames: new Map([[3, new Map([[0, "a"], [1, "b"]])]]), frameReturns: new Set([6]) } as unknown as SourceMapping;
    const calls = [{ step: 0, pc: 0, label: "label1", fp: 0 }];
    expect(frameNamesAt(map, sf, 2, calls, 3)).toEqual(["a", "b", undefined]);
    expect(frameNamesAt(map, sf, 3, calls, 2)).toEqual([RETURN_NAME, "b"]);
    expect(frameNamesAt(map, sf, 4, calls, 1)).toEqual([RETURN_NAME]);
  });
});
