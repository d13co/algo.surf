import { readFileSync } from "node:fs";
import type { Arc56Contract } from "@algorandfoundation/algokit-utils/types/app-arc56";
import { describe, expect, it } from "vitest";
import { matchSpec, type PuyaMap, type SourceMapping } from "./arc56Source";
import { alignNames, shortStackName, stackNamesAt } from "./stackNames";
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
