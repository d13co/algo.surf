import { readFileSync } from "node:fs";
import type { Arc56Contract } from "@algorandfoundation/algokit-utils/types/app-arc56";
import { describe, expect, it } from "vitest";
import {
  matchProgram,
  matchSpec,
  parseTeal,
  sourceLang,
  splitSub,
  subInFiles,
  programHash,
  sourceErrors,
  specTeal,
  type Mismatch,
  type PuyaMap,
  type SourceMapping,
} from "./arc56Source";
import { checkSource } from "./sourceFiles";
import type { Program } from "./traceStepper";

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8"));
const spec: Arc56Contract = fixture("TimeSeek.arc56.json");
const approvalMap: PuyaMap = fixture("TimeSeek.approval.puya.map");
const clearMap: PuyaMap = fixture("TimeSeek.clear.puya.map");
const escreg: Arc56Contract = fixture("Escreg.arc56.json");
const escregMap: PuyaMap = fixture("Escreg.approval.puya.map");

const bytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

function program(lines: { pc?: number; text: string }[], hash = "H"): Program {
  return { hash, lines, pcLine: new Map(lines.flatMap((l, i) => (l.pc === undefined ? [] : [[l.pc, i]]))) };
}

/** A disassembly made from a map's pc_events: a pragma, then each op at its pc. */
function fromMap(map: PuyaMap, hash?: string): Program {
  const ops = Object.entries(map.pc_events)
    .map(([pc, e]) => ({ pc: Number(pc), text: e.op }))
    .sort((a, b) => a.pc - b.pc);
  return program([{ text: "#pragma version 11" }, ...ops], hash);
}

/** Escreg's approval program as a localnet node disassembled it (from a trace's `programs`). */
const escregProg = (): Program => {
  const p = fixture("Escreg.approval.disassembly.json");
  return program(p.lines, p.hash);
};

function ok(m: SourceMapping | Mismatch): SourceMapping {
  if ("mismatch" in m) throw new Error(m.mismatch);
  return m;
}

/** A v3 source map's `mappings`: per generated line (here, per pc), its first segment's source line (1-based). */
function mapLines(map: PuyaMap): Map<number, number> {
  const B = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const vlq = (s: string) => {
    const out: number[] = [];
    let v = 0;
    let sh = 0;
    for (const ch of s) {
      const d = B.indexOf(ch);
      v += (d & 31) << sh;
      if (d & 32) sh += 5;
      else {
        out.push(v & 1 ? -(v >> 1) : v >> 1);
        v = sh = 0;
      }
    }
    return out;
  };
  const byGen = new Map<number, number>();
  let line = 0;
  map.mappings.split(";").forEach((g, gen) => {
    for (const seg of g ? g.split(",") : []) {
      const f = vlq(seg);
      if (f.length < 4) continue;
      line += f[2];
      if (!byGen.has(gen)) byGen.set(gen, line + 1);
    }
  });
  return byGen;
}

/** Every pc where the map has a source line: ours agrees. */
function agreesWithMappings(m: SourceMapping, map: PuyaMap) {
  const lines = mapLines(map);
  const off = map.op_pc_offset ?? 0;
  let n = 0;
  for (const pc of Object.keys(map.pc_events).map(Number)) {
    const want = lines.get(pc + off);
    if (want === undefined) continue;
    expect([pc, m.byPc.get(pc)?.line]).toEqual([pc, want]);
    n++;
  }
  return n;
}

const FILE = "contracts/time_seek/contract.algo.ts";

describe("the TimeSeek spec", () => {
  const hash = programHash(bytes(spec.byteCode.approval));
  const prog = fromMap(approvalMap, hash);
  const teal = specTeal(spec, "approval");

  it("has as many ops as the program, with the same names", () => {
    expect(parseTeal(teal)).toHaveLength(505);
    expect(prog.lines.filter((l) => l.pc !== undefined)).toHaveLength(505);
    ok(matchProgram(prog, teal));
  });

  it("maps pcs to source lines", () => {
    const m = ok(matchSpec(prog, spec, "approval", approvalMap));
    expect(m.exact).toBe(true);
    // intcblock, before the first location comment.
    expect(m.byPc.get(1)).toBeUndefined();
    expect(m.byPc.get(10)).toMatchObject({ file: FILE, line: 49, text: "export class TimeSeek extends Contract {" });
    expect(m.byPc.get(31)).toMatchObject({ file: FILE, line: 41, text: expect.stringMatching(/^function timestampAt\(at: uint64/) });
    // itxn_begin, under a 28-33 range.
    expect(m.byPc.get(89)).toMatchObject({ file: FILE, line: 28, text: "itxn" });
    const l28 = m.lines.find((l) => l.line === 28);
    expect(m.byPc.get(89)).toBe(l28);
    expect(l28.pcs).toContain(89);
    expect(l28.pcs).toEqual([...l28.pcs].sort((a, b) => a - b));
    expect(m.lines.map((l) => l.line)).toEqual([...new Set(m.lines.map((l) => l.line))].sort((a, b) => a - b));
    expect(m.lines.reduce((n, l) => n + l.pcs.length, 0)).toBe(m.byPc.size);
  });

  it("agrees with the .puya.map's mappings", () => {
    expect(agreesWithMappings(ok(matchSpec(prog, spec, "approval")), approvalMap)).toBeGreaterThan(400);
  });

  it("names subroutines, failures and stack values", () => {
    const m = ok(matchSpec(prog, spec, "approval", approvalMap));
    expect([...m.subs.keys()]).toEqual([1, 31, 137, 877]);
    expect(m.subs.get(31)).toBe(`${FILE}::timestampAt(at: uint64, home: uint64, round: uint64) -> bytes`);
    expect(m.subs.get(1)).toMatch(/::Contract\.approvalProgram\(\) -> uint64$/);
    // The map names the same subroutines' first ops.
    const mapSubs = Object.entries(approvalMap.pc_events).flatMap(([pc, e]) => (e.subroutine ? [Number(pc)] : []));
    expect([...m.subs.keys()]).toEqual(mapSubs);
    expect(m.errors.get(148)).toBe("invalid number of bytes for arc4.uint64");
    expect(m.errors.get(158)).toBe("invalid number of bytes for arc4.uint64");
    expect(m.stackOut.get(10)).toEqual(["Method(roundAt(uint64,uint64)(uint64,uint64,uint64,uint64))"]);
    expect(m.mapMismatch).toBeUndefined();
  });

  it("matches the clear program with source.clear, not source.approval", () => {
    const clear = fromMap(clearMap, programHash(bytes(spec.byteCode.clear)));
    const m = ok(matchSpec(clear, spec, "clear", clearMap));
    expect(m.byPc.size).toBe(0);
    expect(m.subs.get(1)).toMatch(/::BaseContract\.clearStateProgram\(\) -> uint64$/);
    expect(matchSpec(clear, spec, "approval")).toEqual({ mismatch: "the spec's byteCode is a different program" });
    expect(matchProgram(clear, teal)).toEqual({ mismatch: "op 1 (pc 1, TEAL line 6): the program has `pushint`, the spec `intcblock`" });
  });

  it("keeps the TEAL match when the map is for another program", () => {
    const m = ok(matchSpec(prog, spec, "approval", clearMap));
    expect(m.mapMismatch).toBe("op 1 (pc 10, map pc 1): the program has `pushbytes`, the .puya.map has `pushint`");
    expect(m.stackOut).toBeUndefined();
    expect(m.byPc.get(89)?.line).toBe(28);
  });

  it("names the first differing op", () => {
    const lines = prog.lines.map((l) => (l.pc === 31 ? { ...l, text: "dup" } : l));
    expect(matchProgram(program(lines), teal)).toEqual({ mismatch: "op 10 (pc 31, TEAL line 27): the program has `dup`, the spec `proto`" });
  });

  it("counts ops, naming the first extra one", () => {
    const short = program(prog.lines.slice(0, -1));
    expect(matchProgram(short, teal)).toEqual({
      mismatch: expect.stringMatching(/^the program has 504 ops, the spec 505: the spec's op 505 \(`\w+`, TEAL line \d+\) is extra$/),
    });
    const long = program([...prog.lines, { pc: 9999, text: "retsub" }]);
    expect(matchProgram(long, teal)).toEqual({ mismatch: "the program has 506 ops, the spec 505: the program's op 506 (`retsub` at pc 9999) is extra" });
  });

  it("has no match without a disassembly", () => {
    expect(matchProgram({ ...prog, synthetic: true }, teal)).toHaveProperty("mismatch");
  });
});

describe("the Escreg spec, against a node's disassembly", () => {
  const prog = escregProg();

  it("matches byte for byte, with its map", () => {
    const m = ok(matchSpec(prog, escreg, "approval", escregMap));
    expect(m.exact).toBe(true);
    expect(m.mapMismatch).toBeUndefined();
    expect(m.stackOut.size).toBeGreaterThan(0);
    expect(agreesWithMappings(m, escregMap)).toBeGreaterThan(400);
    for (const pc of m.errors.keys()) expect(prog.pcLine.has(pc)).toBe(true);
  });

  it("matches its constants: `bytecblock \"counter\" …` is the node's `bytecblock 0x636f756e746572 …`", () => {
    ok(matchProgram(prog, specTeal(escreg, "approval")));
  });

  it("refuses another program's hash", () => {
    expect(matchSpec({ ...prog, hash: "X" }, escreg, "approval")).toEqual({ mismatch: "the spec's byteCode is a different program" });
  });

  it("refuses a changed constant when there is no byteCode", () => {
    const noCode = { ...escreg, byteCode: undefined };
    ok(matchSpec(prog, noCode, "approval"));
    const lines = prog.lines.map((l) => (l.pc === 1 ? { ...l, text: "intcblock 0 1 8 33" } : l));
    expect(matchSpec(program(lines), noCode, "approval")).toEqual({
      mismatch: "op 1 (pc 1, TEAL line 6): `intcblock` value 4 is 33 in the program, 32 in the spec",
    });
    const counter = prog.lines.map((l) => (l.pc === 7 ? { ...l, text: l.text.replace("0x636f756e746572", "0x636f756e746573") } : l));
    expect(matchSpec(program(counter), noCode, "approval")).toEqual({
      mismatch: "op 2 (pc 7, TEAL line 7): `bytecblock` value 1 is 636f756e746573 in the program, 636f756e746572 in the spec",
    });
  });

  it("matches by ops alone with template variables", () => {
    const tmpl = { ...escreg, templateVariables: { X: { type: "uint64" } } } as Arc56Contract;
    const m = ok(matchSpec({ ...prog, hash: "X" }, tmpl, "approval"));
    expect(m.exact).toBeUndefined();
  });

  it("refuses a map whose pcs aren't the program's", () => {
    const pc_events = Object.fromEntries(Object.entries(escregMap.pc_events).map(([pc, e], i) => [String(Number(pc) + (i > 3 ? 1 : 0)), e]));
    const m = ok(matchSpec(prog, escreg, "approval", { ...escregMap, pc_events }));
    expect(m.mapMismatch).toMatch(/^op 5 is at pc \d+ in the program, \d+ in the \.puya\.map$/);
  });
});

describe("parseTeal", () => {
  it("keeps a range's first line, and later ops on the latest location", () => {
    const ops = parseTeal(
      [
        "#pragma version 11",
        "// a.ts::f() -> void:",
        "f:",
        "    // a.ts:3-5",
        "    // foo({",
        "    //   fee:0",
        "    // })",
        "    itxn_begin",
        "",
        "f_next@1:",
        "    itxn_submit",
        "    //   a.ts:7",
        "    // return",
        "    retsub",
      ].join("\n"),
    );
    expect(ops.map((o) => [o.op, o.loc?.line, o.loc?.text])).toEqual([
      ["itxn_begin", 3, "foo({"],
      ["itxn_submit", 3, "foo({"],
      ["retsub", 7, "return"],
    ]);
    expect(ops.every((o) => o.sub === "a.ts::f() -> void")).toBe(true);
    expect(ops[0].line).toBe(8);
    // The range's end and every line it quotes; a single line has neither.
    expect([ops[0].loc?.end, ops[0].loc?.quoted]).toEqual([5, ["foo({", "fee:0", "})"]]);
    // Each quoted line's indent after `// `: the statement's shape.
    expect(ops[0].loc?.indents).toEqual([0, 2, 0]);
    expect(ops[2].loc).toEqual({ file: "a.ts", line: 7, text: "return" });
  });

  it("keeps the widest range that starts on a line", () => {
    const m = ok(matchSpec(escregProg(), escreg, "approval"));
    const l = m.lines.find((x) => x.file === "smart_contracts/escreg/contract.algo.ts" && x.line === 291);
    expect(l?.end).toBe(298);
    expect(l?.quoted?.length).toBe(8);
    expect(l?.quoted?.[0]).toBe("itxn");
    // Its lines' indents come with them, from the same quote.
    expect(l?.indents).toEqual([0, 2, 4, 4, 4, 4, 2, 2]);
  });

  it("starts a new location on a location comment, quoted lines or not", () => {
    const ops = parseTeal(["// a.ts:1-3", "// x(", "// a.ts:9", "", "pop", "// a.ts:4", "// a.ts:5", "// y", "pop"].join("\n"));
    expect(ops.map((o) => [o.loc?.line, o.loc?.text])).toEqual([
      [9, ""],
      [5, "y"],
    ]);
  });

  it("takes the first quoted line even when blank, and ignores prose", () => {
    const ops = parseTeal(["// a.ts:1-2", "//", "// y", "pop", "// max depth:64", "pop"].join("\n"));
    expect(ops.map((o) => [o.loc?.line, o.loc?.text])).toEqual([
      [1, ""],
      [1, ""],
    ]);
  });

  it("drops trailing comments, but not inside strings or base64", () => {
    const ops = parseTeal(
      [
        "intc_2 // 1000",
        'pushbytes "a // b: c" // comment',
        'byte "say \\"hi//\\"" // x',
        "byte base64 ab//cd== // x",
        "byte b64(ab//cd==)// x",
        'pushbytes 0x6c91aaa1 // method "f()void"',
        "int 1; int 2 // two ops",
        "label: // a label",
        "main: txn Sender // a label and an op",
      ].join("\n"),
    );
    expect(ops.map((o) => o.op)).toEqual([
      "intc_2",
      'pushbytes "a // b: c"',
      'byte "say \\"hi//\\""',
      "byte base64 ab//cd==",
      "byte b64(ab//cd==)",
      "pushbytes 0x6c91aaa1",
      "int 1",
      "int 2",
      "txn Sender",
    ]);
  });

  it("starts a subroutine's ops without the previous location", () => {
    const ops = parseTeal(["// a.ts:1", "// x", "retsub", "", "// a.ts::g() -> void:", "g:", "proto 0 0"].join("\n"));
    expect(ops[1]).toMatchObject({ op: "proto 0 0", loc: undefined, sub: "a.ts::g() -> void" });
  });

  it("reads Algorand Python's subroutine headers", () => {
    const ops = parseTeal(
      [
        "// pkg/contract.py:5",
        "// def pay(self) -> None:",
        "pop",
        "",
        "// pkg.contract.C.pay(receiver: bytes, amount: uint64) -> void:",
        "pay:",
        "proto 2 0",
        "// pkg.contract.C.create[routing]() -> void:",
        "create_x:",
        "pop",
        "// pkg.contract.C.f[uint64, algopy.Bytes](a: uint64) -> bytes:",
        "f:",
        "pop",
        "// max depth: 1",
        "pop",
      ].join("\n"),
    );
    expect(ops.map((o) => o.sub)).toEqual([undefined, "pkg.contract.C.pay(receiver: bytes, amount: uint64) -> void", "pkg.contract.C.create[routing]() -> void", "pkg.contract.C.f[uint64, algopy.Bytes](a: uint64) -> bytes", "pkg.contract.C.f[uint64, algopy.Bytes](a: uint64) -> bytes"]);
    expect(ops[0].loc?.text).toBe("def pay(self) -> None:");
  });
});

describe("splitSub", () => {
  it("splits TypeScript and Python headers", () => {
    expect(splitSub("contracts/a.algo.ts::Escreg.register(x: uint64) -> void")).toEqual({ name: "Escreg.register", sig: "(x: uint64) -> void", file: "contracts/a.algo.ts" });
    expect(splitSub("smart_contracts.proposal.contract.Proposal.create[routing]() -> void")).toEqual({ name: "Proposal.create[routing]", sig: "() -> void" });
    expect(splitSub("pkg.helpers.add(a: uint64, b: uint64) -> uint64")).toEqual({ name: "add", sig: "(a: uint64, b: uint64) -> uint64" });
    // A module named as its class.
    expect(splitSub("ntt_contracts.ntt_manager.NttManager.NttManager._transfer() -> void").name).toBe("NttManager._transfer");
    expect(splitSub("algopy.arc4.ARC4Contract.approval_program() -> uint64").name).toBe("ARC4Contract.approval_program");
    expect(splitSub("itoa")).toEqual({ name: "itoa", sig: "" });
    expect(splitSub("C.pay(x: uint64) -> void").name).toBe("C.pay");
  });

  it("tells a contract's own subroutines from library ones", () => {
    const py = new Set(["smart_contracts/proposal/contract.py"]);
    expect(subInFiles("smart_contracts.proposal.contract.Proposal.pay() -> void", py)).toBe(true);
    expect(subInFiles("algopy.arc4.ARC4Contract.approval_program() -> uint64", py)).toBe(false);
    // Paths relative to elsewhere than the module root, either way.
    expect(subInFiles("smart_contracts.proposal.contract.Proposal.pay() -> void", new Set(["contract.py"]))).toBe(true);
    expect(subInFiles("contract.Proposal.pay() -> void", py)).toBe(true);
    // Modules named as their class, files under a venv, a package's __init__.py, ../ and Windows paths.
    const ntt = new Set(["ntt_contracts/ntt_manager/NttManager.py", "venv/lib/python3.12/site-packages/folks_contracts/library/RateLimiter.py", "ntt_contracts/library/TrimmedAmountLib.py"]);
    expect(subInFiles("ntt_contracts.ntt_manager.NttManager.NttManager._transfer() -> void", ntt)).toBe(true);
    expect(subInFiles("folks_contracts.library.RateLimiter.RateLimiter._update() -> void", ntt)).toBe(true);
    expect(subInFiles("ntt_contracts.library.TrimmedAmountLib.scale(amt: uint64) -> uint64", ntt)).toBe(true);
    expect(subInFiles("algopy.arc4.ARC4Contract.approval_program() -> uint64", ntt)).toBe(false);
    expect(subInFiles("pkg.C.f() -> void", new Set(["pkg/__init__.py"]))).toBe(true);
    expect(subInFiles("smart_contracts.proposal.contract.Proposal.pay() -> void", new Set(["../proposal/contract.py"]))).toBe(true);
    expect(subInFiles("smart_contracts.proposal.contract.Proposal.pay() -> void", new Set([".\\contract.py"]))).toBe(true);
    expect(subInFiles("pkg.contract.myContract.f() -> void", new Set(["pkg/contract.py"]))).toBe(true);
    // A file named as a compiler module.
    expect(subInFiles("algopy.state.Box.get() -> bytes", new Set(["state.py"]))).toBe(false);
    expect(subInFiles("a.algo.ts::C.f() -> void", new Set(["a.algo.ts"]))).toBe(true);
    expect(subInFiles("puya-ts::itoa(i: uint64) -> bytes", new Set(["a.algo.ts"]))).toBe(false);
  });
});

describe("sourceLang", () => {
  const at = (...files: string[]) => ({ lines: files.map((file) => ({ file, line: 1, text: "", pcs: [] })) });
  it("names the source view by its files, or as TEALScript", () => {
    expect(sourceLang(at("a.algo.ts", "b.ts"))).toBe("TypeScript");
    expect(sourceLang(at("pkg/contract.py"))).toBe("Python");
    expect(sourceLang(at("a.algo.ts", "b.py"))).toBe("Source");
    expect(sourceLang(at())).toBe("Source");
    expect(sourceLang({ ...at("a.algo.ts"), tealscript: true })).toBe("TEALScript");
  });
});

describe("matchProgram", () => {
  // As the node disassembles it: its own labels and constant comments.
  const disasm = program([
    { text: "#pragma version 10" },
    { pc: 1, text: "intcblock 1 18446744073709551615" },
    { pc: 12, text: "txna ApplicationArgs 0" },
    { pc: 15, text: "bz label1" },
    { pc: 18, text: "intc_1 // 18446744073709551615" },
    { pc: 19, text: "callsub label2" },
    { pc: 22, text: "return" },
    { text: "label1:" },
    { pc: 23, text: "pushint 7" },
    { pc: 25, text: "return" },
    { text: "label2:" },
    { pc: 26, text: "proto 1 1" },
    { pc: 29, text: "retsub" },
  ]);
  const teal = [
    "#pragma version 10",
    "// a.ts::main() -> uint64:",
    "main:",
    "    intcblock 1 TMPL_LIMIT",
    "    // a.ts:2",
    "    // if (x) {",
    "    txn ApplicationArgs 0 // array field",
    "    bz main_else@1",
    "    // a.ts:3",
    "    // return f(LIMIT)",
    "    int TMPL_LIMIT",
    "    callsub f",
    "    return",
    "",
    "main_else@1:",
    "    // a.ts:5",
    "    // return 7",
    "    pushint 0x07",
    "    return",
    "",
    "",
    "// a.ts::f(n: uint64) -> uint64:",
    "f:",
    "    // a.ts:9",
    "    // function f(n: uint64): uint64 {",
    "    proto 1 1",
    "    retsub",
  ].join("\n");

  it("pairs ops by order, through template variables and pseudo-ops", () => {
    const m = ok(matchProgram(disasm, teal));
    expect(m.byPc.get(1)).toBeUndefined();
    expect(m.byPc.get(18)).toMatchObject({ file: "a.ts", line: 3, text: "return f(LIMIT)" });
    expect(m.byPc.get(23)?.line).toBe(5);
    expect(m.lines.map((l) => [l.line, l.pcs])).toEqual([
      [2, [12, 15]],
      [3, [18, 19, 22]],
      [5, [23, 25]],
      [9, [26, 29]],
    ]);
    expect(m.subs).toEqual(
      new Map([
        [1, "a.ts::main() -> uint64"],
        [26, "a.ts::f(n: uint64) -> uint64"],
      ]),
    );
  });

  it("refuses a changed constant", () => {
    expect(matchProgram(disasm, teal.replace("pushint 0x07", "pushint 8"))).toEqual({
      mismatch: "op 7 (pc 23, TEAL line 18): `pushint` value 1 is 7 in the program, 8 in the spec",
    });
  });

  it("skips constant blocks the assembler added", () => {
    const noBlock = teal.replace("    intcblock 1 TMPL_LIMIT\n", "");
    expect(ok(matchProgram(disasm, noBlock)).subs.get(12)).toBe("a.ts::main() -> uint64");
    // Both blocks added.
    const both = program([{ pc: 1, text: "intcblock 1" }, { pc: 4, text: "bytecblock 0x01" }, ...disasm.lines.slice(2)]);
    expect(ok(matchProgram(both, noBlock)).subs.get(12)).toBe("a.ts::main() -> uint64");
    // The TEAL's own intcblock, and a bytecblock the assembler added before it.
    const added = program([{ pc: 1, text: "bytecblock 0x01" }, ...disasm.lines.slice(1).map((l) => (l.pc === 1 ? { ...l, pc: 4 } : l))]);
    const m = ok(matchProgram(added, teal));
    expect(m.subs.get(4)).toBe("a.ts::main() -> uint64");
    expect(m.byPc.get(12)?.line).toBe(2);
  });

  it("names a one-op difference", () => {
    const other = teal.replace("bz main_else@1", "bnz main_else@1");
    expect(matchProgram(disasm, other)).toEqual({ mismatch: "op 3 (pc 15, TEAL line 8): the program has `bz`, the spec `bnz`" });
  });

  it("counts ops", () => {
    expect(matchProgram(disasm, teal + "\n    retsub")).toEqual({
      mismatch: "the program has 10 ops, the spec 11: the spec's op 11 (`retsub`, TEAL line 28) is extra",
    });
  });
});

describe("sourceErrors", () => {
  const prog = program([
    { pc: 1, text: "intcblock 1" },
    { pc: 4, text: "bytecblock 0x01" },
    { pc: 8, text: "txn Sender" },
    { pc: 10, text: "assert" },
  ]);

  it("offsets `cblocks` pcs by the pc after the constant blocks, less one", () => {
    const e = sourceErrors({ pcOffsetMethod: "cblocks", sourceInfo: [{ pc: [3], errorMessage: "no" }] }, prog);
    expect(e).toEqual(new Map([[10, "no"]]));
  });

  it("keeps only pcs the program has", () => {
    const e = sourceErrors({ pcOffsetMethod: "none", sourceInfo: [{ pc: [10, 11], errorMessage: "no" }, { pc: [8] }] }, prog);
    expect(e).toEqual(new Map([[10, "no"]]));
  });
  it("skips malformed entries", () => {
    const bad = [null, { pc: 10, errorMessage: "x" }, { pc: ["8"], errorMessage: "y" }, { pc: [8], errorMessage: 5 }, { pc: [10], errorMessage: "no" }];
    expect(sourceErrors({ pcOffsetMethod: "none", sourceInfo: bad } as never, prog)).toEqual(new Map([[10, "no"]]));
    expect(sourceErrors({ pcOffsetMethod: "none", sourceInfo: "x" } as never, prog).size).toBe(0);
  });
});

describe("a TEALScript spec", () => {
  // contracts/counter.algo.ts, built by TEALScript 0.106.1; the program as localnet's node disassembled it.
  const counter: Arc56Contract = fixture("Counter.arc56.json");
  const p = fixture("Counter.approval.disassembly.json");
  const prog = program(p.lines, p.hash);
  const teal = specTeal(counter, "approval")!;
  const info = counter.sourceInfo!.approval;
  const FILE = "contracts/counter.algo.ts";
  const at = (m: SourceMapping, pc: number) => {
    const l = m.byPc.get(pc);
    return l && `${l.line} ${l.text}`;
  };
  const lines = (m: SourceMapping) => [...m.byPc].map(([pc, l]) => [pc, l.line]);

  it("matches byte for byte and is labelled TEALScript", () => {
    const m = ok(matchSpec(prog, counter, "approval"));
    expect(m.exact).toBe(true);
    expect(m.tealscript).toBe(true);
    expect(sourceLang(m)).toBe("TEALScript");
    const puya = ok(matchSpec(fromMap(approvalMap, programHash(bytes(spec.byteCode!.approval))), spec, "approval", approvalMap));
    expect(puya.tealscript).toBeUndefined();
    expect(sourceLang(puya)).toBe("TypeScript");
  });

  it("places ops by sourceInfo's lines, quoting the TEAL's comments", () => {
    const m = ok(matchSpec(prog, counter, "approval"));
    expect(new Set(m.lines.map((l) => l.file))).toEqual(new Set([FILE]));
    expect(at(m, 67)).toBe("9 assert(limit > 0, 'limit must be positive')");
    // Ops without a comment above them: the method's retsub, the if's jump past its else.
    expect(at(m, 147)).toBe("24 next > 100");
    // Method lines (and the router's, the class's), which no comment quotes: no text.
    expect(at(m, 79)).toBe("8 ");
    expect(at(m, 164)).toBe("21 ");
    expect(at(m, 19)).toBe("3 ");
    // The comments alone leave those ops on the line before.
    const bare = ok(matchProgram(prog, teal));
    expect(at(bare, 79)).toBe("11 this.count.value = 0");
    expect(at(bare, 147)).toBe("25 next = this.clamp(next)");
  });

  it("names subroutines, routes and the router's branches", () => {
    const m = ok(matchSpec(prog, counter, "approval"));
    const subs = {
      54: "NOT_IMPLEMENTED",
      55: "createApplication[routing](uint64)void",
      64: "createApplication(limit: uint64): void",
      80: "clamp(n: uint64): uint64",
      97: "add[routing](uint64)uint64",
      115: "add(by: uint64): uint64",
      165: "create_NoOp",
      179: "call_NoOp",
    };
    // In Puya's `file::` form, by the file of each one's first op.
    expect(Object.fromEntries(m.subs)).toEqual(Object.fromEntries(Object.entries(subs).map(([pc, s]) => [pc, `${FILE}::${s}`])));
    // The contract's own code, not a library's.
    expect([...m.subs.values()].every((s) => subInFiles(s, new Set([FILE])))).toBe(true);
    expect(splitSub(m.subs.get(97)!)).toEqual({ name: "add[routing]", sig: "(uint64)uint64", file: FILE });
  });

  it("names failures from sourceInfo", () => {
    const m = ok(matchSpec(prog, counter, "approval"));
    expect(m.errors.get(71)).toBe("limit must be positive");
    expect(m.errors.get(124)).toBe("nothing to add");
  });

  it("places ops by sourceInfo's pcs without its TEAL lines, `cblocks` pcs too", () => {
    const want = lines(ok(matchSpec(prog, counter, "approval")));
    const noTeal = info.sourceInfo.map(({ teal: _, ...e }) => e);
    // The first op after the constant blocks is at pc 19: `cblocks` pcs are 18 less.
    const cblocks = noTeal.map((e) => ({ ...e, pc: e.pc.map((pc) => pc - 18) }));
    for (const si of [
      { pcOffsetMethod: "none" as const, sourceInfo: noTeal },
      { pcOffsetMethod: "cblocks" as const, sourceInfo: cblocks },
    ]) {
      expect(lines(ok(matchProgram(prog, teal, true, si)))).toEqual(want);
    }
  });

  it("falls back to the comments when sourceInfo has no source lines, or places too few ops", () => {
    const bare = lines(ok(matchProgram(prog, teal)));
    const errorsOnly = { ...info, sourceInfo: info.sourceInfo.map(({ source: _, ...e }) => e) };
    expect(lines(ok(matchProgram(prog, teal, true, errorsOnly)))).toEqual(bare);
    expect(lines(ok(matchProgram(prog, teal, true, { ...info, sourceInfo: info.sourceInfo.slice(0, 10) })))).toEqual(bare);
    // Malformed entries are skipped.
    const bad = { ...info, sourceInfo: [null, { source: 5, teal: 30 }, { source: "nowhere", teal: 30 }, ...info.sourceInfo] };
    expect(lines(ok(matchProgram(prog, teal, true, bad as never)))).toEqual(lines(ok(matchSpec(prog, counter, "approval"))));
  });

  it("names subroutines as the contract's without sourceInfo's lines", () => {
    const m = ok(matchProgram(prog, teal));
    expect(m.subs.get(64)).toBe(`${FILE}::createApplication(limit: uint64): void`);
    expect(m.subs.get(54)).toBe(`${FILE}::NOT_IMPLEMENTED`);
    expect([...m.subs.values()].every((s) => s.startsWith(`${FILE}::`))).toBe(true);
  });

  it("goes by pcs when sourceInfo's TEAL lines aren't this TEAL's", () => {
    const shifted = { ...info, sourceInfo: info.sourceInfo.map((e) => ({ ...e, teal: e.teal! + 2 })) };
    expect(lines(ok(matchProgram(prog, teal, true, shifted)))).toEqual(lines(ok(matchSpec(prog, counter, "approval"))));
  });

  it("checks a source file against its statements, part of its lines", () => {
    const m = ok(matchSpec(prog, counter, "approval"));
    const text = readFileSync(new URL("./__fixtures__/counter.algo.ts.txt", import.meta.url), "utf8");
    expect(m.lines.every((l) => l.part)).toBe(true);
    expect(checkSource(m.lines, text)).toBeUndefined();
    const changed = text.replace("if (next > 100) {", "if (next > 200) {");
    expect(checkSource(m.lines, changed)).toEqual({ line: 24, spec: "next > 100", file: "if (next > 200) {", more: 0 });
    // Not a statement that only starts or ends the same.
    const longer = text.replace("if (next > 100) {", "if (next > 1000) {");
    expect(checkSource(m.lines, longer)).toEqual({ line: 24, spec: "next > 100", file: "if (next > 1000) {", more: 0 });
    // A quote of part of a line can't tell a statement that goes on past it, though.
    const wider = text.replace("let next = this.count.value + by;", "let next = this.count.value + by + 1;");
    expect(checkSource(m.lines, wider)).toBeUndefined();
    // Puya's quotes are whole lines.
    const puya = ok(matchSpec(escregProg(), escreg, "approval", escregMap));
    expect(puya.lines.some((l) => l.part)).toBe(false);
  });
});

describe("TEALScript subroutine labels", () => {
  const body = ["// gas(): void", "//", "// a doc line", "gas:", "  proto 0 0", "// other(): void", "label:", "  retsub", "*if0_else:", "  err"].join("\n");

  it("start a subroutine under a signature of the same name", () => {
    const head = "// This TEAL was generated by TEALScript v0.106.1\n";
    expect(parseTeal(head + body).map((o) => o.sub)).toEqual(["gas(): void", "gas(): void", "gas(): void"]);
  });

  it("not under a signature that code comments followed", () => {
    const head = "// This TEAL was generated by TEALScript v0.106.1\n";
    const teal = ["// foo(): void", "// a.algo.ts:3", "// x = 1", "foo:", "  retsub"].join("\n");
    expect(parseTeal(head + teal).map((o) => o.sub)).toEqual([undefined]);
  });

  it("name frame slots only for subroutines that start a frame, and returns only before the end", () => {
    const head = "// This TEAL was generated by TEALScript v0.106.1\n";
    const teal = [
      "// f(a: uint64): uint64",
      "f:",
      "  proto 1 1",
      "  frame_dig -1 // a: uint64",
      "  frame_bury 0",
      "  frame_dig 0 // x: uint64",
      "  frame_bury 0",
      "  retsub",
      "// g(b: uint64): void",
      "g:",
      "  frame_dig -1 // b: uint64",
      "  retsub",
    ].join("\n");
    const ops = ["proto 1 1", "frame_dig -1", "frame_bury 0", "frame_dig 0", "frame_bury 0", "retsub", "frame_dig -1", "retsub"];
    let pc = 1;
    const prog = program([{ text: "#pragma version 10" }, ...ops.map((text) => ({ pc: (pc += 2) - 2, text }))]);
    const m = ok(matchProgram(prog, head + teal));
    // g has no proto: its frame_dig is the caller's frame, not named.
    expect(m.frameNames).toEqual(new Map([[1, new Map([[-1, "a"], [0, "x"]])]]));
    // Only the frame_bury 0 just before retsub is the return value.
    expect(m.frameReturns).toEqual(new Set([9]));
  });

  it("only in TEALScript's TEAL", () => {
    expect(parseTeal(body).map((o) => o.sub)).toEqual([undefined, undefined, undefined]);
  });
});
