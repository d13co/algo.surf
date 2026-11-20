import { beforeAll, describe, expect, it } from "vitest";
import { describe as describeOp, loadAvmOps, modeText, opIO, parseLine, popNames, signature, type AvmOps } from "./avmOps";
import type { AvmValue, TraceStep } from "./txnDevInfo";

const u = (n: number | bigint): AvmValue => ({ type: 2, uint: n as number });
const b = (s: string): AvmValue => ({ type: 1, bytes: Buffer.from(s).toString("base64") });

let ops: AvmOps;
beforeAll(async () => {
  ops = await loadAvmOps();
});

describe("the reference", () => {
  it("has every op, with names its doc uses", () => {
    expect(Object.keys(ops.ops).length).toBeGreaterThanOrEqual(200);
    expect(ops.ops["+"]).toMatchObject({ in: [["A", "uint64"], ["B", "uint64"]], out: [["X", "uint64"]], cost: "1", v: 1 });
    expect(ops.ops["+"].doc).toMatch(/A plus B/);
    // Not in puya-ts's langspec yet: written in the generator.
    expect(ops.ops.bmodexp.v).toBe(14);
    expect(ops.ops.mldsa_verify.imm[0][3]).toBe("ML-DSA");
  });

  it("says where an op can't run in both apps and logic sigs", () => {
    expect(modeText(ops.ops.arg_0.mode)).toBe("logic sigs only");
    expect(modeText(ops.ops.box_get.mode)).toBe("apps only");
    expect(modeText(ops.ops["+"].mode)).toBe("");
  });
});

describe("parseLine", () => {
  it("splits the op from its immediates and drops the comment", () => {
    expect(parseLine("  extract 2 0 // x")).toEqual({ name: "extract", imms: ["2", "0"] });
    expect(parseLine("pushbytes 0x6869 // \"hi\"")).toEqual({ name: "pushbytes", imms: ["0x6869"] });
    expect(parseLine(undefined)).toEqual({ name: "", imms: [] });
    expect(parseLine("// a comment line")).toEqual({ name: "", imms: [] });
  });
});

describe("describe", () => {
  it("is undefined for labels, pragmas and unknown ops", () => {
    expect(describeOp(ops, "main_l2:")).toBeUndefined();
    expect(describeOp(ops, "#pragma version 10")).toBeUndefined();
    expect(describeOp(ops, "nosuchop 1")).toBeUndefined();
  });

  it("types a field op's output from its field, and gives the field's doc", () => {
    const d = describeOp(ops, "txn Fee")!;
    expect(d.out).toEqual([["X", "uint64"]]);
    expect(d.fields).toEqual([expect.objectContaining({ imm: "F", table: "txn", name: "Fee", type: "uint64", doc: "microalgos" })]);
    expect(signature(d)).toBe("→ X: uint64");
    expect(signature(describeOp(ops, "log")!)).toBe("A: []byte →");
    expect(signature(describeOp(ops, "intcblock 0 1")!)).toBe("");
    // The field is the second immediate of gtxn, the first of txna.
    expect(describeOp(ops, "gtxn 1 Sender")!.out).toEqual([["X", "address"]]);
    expect(describeOp(ops, "txna ApplicationArgs 0")!.fields[0].name).toBe("ApplicationArgs");
    // The spec's own types stay for the rest.
    expect(describeOp(ops, "asset_params_get AssetTotal")!.out).toEqual([["X", "uint64"], ["Y", "bool"]]);
  });

  it("types itxn_field's input from its field", () => {
    expect(describeOp(ops, "itxn_field Receiver")!.in).toEqual([["A", "address"]]);
  });

  it("doesn't change the reference when it types a field op", () => {
    describeOp(ops, "txn Fee");
    expect(ops.ops.txn.out).toEqual([["X", "any"]]);
  });

  it("picks the cost of the line's field", () => {
    expect(describeOp(ops, "ecdsa_verify Secp256k1")!.cost).toBe("1700");
    expect(describeOp(ops, "ecdsa_verify Secp256r1")!.cost).toBe("2500");
    expect(describeOp(ops, "sha512")!.cost).toMatch(/per 32 bytes/);
  });
});

describe("opIO", () => {
  const step = (s: Partial<TraceStep>): TraceStep => ({ pc: 1, ...s }) as TraceStep;

  it("names what an op takes, deepest first, and what it gives", () => {
    const io = opIO(describeOp(ops, "-"), [u(9), u(3), u(5)], step({ "stack-pop-count": 2, "stack-additions": [u(98)] }));
    expect(io.inputs).toEqual([
      { name: "A", type: "uint64", v: u(3) },
      { name: "B", type: "uint64", v: u(5) },
    ]);
    expect(io.outputs).toEqual([{ name: "X", type: "uint64", v: u(98) }]);
    expect(io.failed).toBe(false);
  });

  it("names two outputs in order, the second on top", () => {
    const io = opIO(describeOp(ops, "app_global_get_ex"), [u(0), b("k")], step({ "stack-pop-count": 2, "stack-additions": [u(7), u(1)] }));
    expect(io.inputs.map((x) => [x.name, x.type])).toEqual([["A", "application"], ["B", "stateKey"]]);
    expect(io.outputs.map((x) => [x.name, x.type, x.v])).toEqual([["X", "any", u(7)], ["Y", "bool", u(1)]]);
  });

  it("leaves values unnamed where the trace's counts don't match the spec", () => {
    const io = opIO(describeOp(ops, "cover 2"), [u(1), u(2), u(3)], step({ "stack-pop-count": 3, "stack-additions": [u(3), u(1), u(2)] }));
    expect(io.inputs.every((x) => x.name === undefined)).toBe(true);
    expect(io.outputs.map((x) => x.v)).toEqual([u(3), u(1), u(2)]);
    const odd = opIO(describeOp(ops, "+"), [u(1), u(2)], step({ "stack-pop-count": 1, "stack-additions": [u(2)] }));
    expect(odd.inputs[0].name).toBeUndefined();
    expect(odd.outputs[0].name).toBe("X");
    // As simulate reports them (localnet Escreg trace): bury 1 takes 2 and gives 1, dig 2 takes none.
    expect(opIO(describeOp(ops, "bury 1"), [u(8), u(1)], step({ "stack-pop-count": 2, "stack-additions": [u(1)] })).inputs[0].name).toBeUndefined();
    expect(opIO(describeOp(ops, "dig 2"), [u(4), u(0), u(0)], step({ "stack-additions": [u(4)] })).outputs[0].name).toBeUndefined();
  });

  it("names frame_dig's value, which the trace reports as the spec does", () => {
    expect(opIO(describeOp(ops, "frame_dig -1"), [u(1)], step({ "stack-additions": [u(1)] })).outputs[0].name).toBe("X");
    expect(opIO(describeOp(ops, "switch l1 l2"), [u(1)], step({ "stack-pop-count": 1 })).inputs[0].name).toBe("A");
  });

  it("ignores restated additions", () => {
    const io = opIO(describeOp(ops, "itxn_submit"), [u(1)], step({ "stack-additions": [u(1)] }), { restated: true });
    expect(io.outputs).toEqual([]);
    expect(io.failed).toBe(false);
  });

  it("says a run's last op failed when it gave nothing it should have", () => {
    const d = describeOp(ops, "-");
    expect(opIO(d, [u(3), u(5)], step({ "stack-pop-count": 2 }), { last: true }).failed).toBe(true);
    // Not mid-run, and not for ops that give nothing anyway.
    expect(opIO(d, [u(3), u(5)], step({ "stack-pop-count": 2 })).failed).toBe(false);
    expect(opIO(describeOp(ops, "return"), [u(1)], step({ "stack-pop-count": 1 }), { last: true }).failed).toBe(false);
    expect(opIO(describeOp(ops, "assert"), [u(0)], step({ "stack-pop-count": 1 }), { last: true }).failed).toBe(false);
  });

  it("joins 128-bit pairs", () => {
    const io = opIO(describeOp(ops, "mulw"), [u(2n ** 63n), u(4)], step({ "stack-pop-count": 2, "stack-additions": [u(2), u(0)] }));
    expect(io.wideOut).toEqual([{ names: "X,Y", value: 2n ** 65n }]);
    const dm = opIO(describeOp(ops, "divmodw"), [u(1), u(0), u(0), u(2)], step({ "stack-pop-count": 4, "stack-additions": [u(0), u(2n ** 63n), u(0), u(0)] }));
    expect(dm.wideIn).toEqual([
      { names: "A,B", value: 2n ** 64n },
      { names: "C,D", value: 2n },
    ]);
    expect(dm.wideOut[0]).toEqual({ names: "W,X", value: 2n ** 63n });
  });
});

describe("popNames", () => {
  it("names the stack slots the next op takes", () => {
    const m = popNames(describeOp(ops, "box_extract"), 5, { pc: 1, "stack-pop-count": 3 } as TraceStep);
    expect([...m]).toEqual([
      [2, "A"],
      [3, "B"],
      [4, "C"],
    ]);
    expect(popNames(describeOp(ops, "uncover 2"), 5, { pc: 1, "stack-pop-count": 3 } as TraceStep).size).toBe(0);
  });
});
