import { readFileSync } from "node:fs";
import type { Arc56Contract } from "@algorandfoundation/algokit-utils/types/app-arc56";
import { describe, expect, it } from "vitest";
import { matchSpec, type SourceMapping, type SrcLine } from "./arc56Source";
import { fileLines, lineText, rangeIndex, tealRanges, type TealRange } from "./tealRanges";
import type { Program } from "./traceStepper";

function program(lines: { pc?: number; text: string }[], hash = "P"): Program {
  const pcLine = new Map<number, number>();
  lines.forEach((l, i) => l.pc !== undefined && pcLine.set(l.pc, i));
  return { hash, lines, pcLine };
}

/** A mapping from pc → line, in file `file`, with subroutine headers at `subs`' pcs. */
function mapping(at: Record<number, number>, subs: Record<number, string> = {}, file = "c.algo.ts"): SourceMapping {
  const byLine = new Map<number, SrcLine>();
  const byPc = new Map<number, SrcLine>();
  for (const [pc, line] of Object.entries(at)) {
    let s = byLine.get(line);
    if (!s) byLine.set(line, (s = { file, line, text: `line ${line}`, pcs: [] }));
    s.pcs.push(Number(pc));
    byPc.set(Number(pc), s);
  }
  return { byPc, lines: [...byLine.values()], subs: new Map(Object.entries(subs).map(([pc, h]) => [Number(pc), h])), errors: new Map() };
}

/** Ops at pcs 1…n, each `op<pc>`, with labels where `labels` puts them (before that pc). */
function ops(n: number, labels: Record<number, string> = {}) {
  const out: { pc?: number; text: string }[] = [];
  for (let pc = 1; pc <= n; pc++) {
    if (labels[pc]) out.push({ text: `${labels[pc]}:` });
    out.push({ pc, text: `op${pc}` });
  }
  return out;
}

/** A range as [its line or null, its ops' pcs, its asides' pcs]. */
function brief(prog: Program, r: TealRange) {
  const pcs = prog.lines.slice(r.first, r.last + 1).flatMap((l) => (l.pc === undefined ? [] : [l.pc]));
  return [r.line?.line ?? null, pcs, [...(r.asides?.keys() ?? [])]];
}

describe("TEAL ranges", () => {
  it("cuts ops by source line, labels going with the next op", () => {
    const p = program([{ text: "#pragma version 11" }, ...ops(6, { 3: "a", 5: "b" })]);
    const m = mapping({ 2: 10, 3: 10, 4: 11, 5: 11, 6: 12 });
    const rs = tealRanges(p, m);
    expect(rs.map((r) => brief(p, r))).toEqual([
      [null, [1], []],
      [10, [2, 3], []],
      [11, [4, 5], []],
      [12, [6], []],
    ]);
    // The pragma opens the first range; label a sits inside line 10's range, label b inside line 11's.
    expect(rs[0].first).toBe(0);
    expect(p.lines[rs[1].last].pc).toBe(3);
    expect(rs.every((r, k) => k === 0 || r.first === rs[k - 1].last + 1)).toBe(true);
    expect(rs[rs.length - 1].last).toBe(p.lines.length - 1);
  });

  it("puts a label at a line change with the range after it", () => {
    const p = program(ops(4, { 3: "loop" }));
    const rs = tealRanges(p, mapping({ 1: 1, 2: 1, 3: 2, 4: 2 }));
    expect(p.lines[rs[1].first].text).toBe("loop:");
  });

  it("folds runs of up to two ops between ranges of one line, not three, nor at the edges", () => {
    const p = program(ops(12));
    const m = mapping({ 1: 5, 2: 9, 3: 9, 4: 5, 5: 5, 6: 7, 7: 7, 8: 7, 9: 5, 10: 8, 11: 6, 12: 8 });
    const rs = tealRanges(p, m);
    expect(rs.map((r) => brief(p, r))).toEqual([
      [5, [1, 2, 3, 4, 5], [2, 3]],
      [7, [6, 7, 8], []],
      [5, [9], []],
      [8, [10, 11, 12], [11]],
    ]);
    expect(rs[0].asides!.get(2)!.line).toBe(9);
    // Line 5's ranges: 2. Asides don't count as parts.
    expect(rs.map((r) => [r.part, r.parts])).toEqual([[1, 2], [1, 1], [2, 2], [1, 1]]);
    expect(tealRanges(p, m, 3).length).toBe(2);
    // At an edge: nothing to fold into.
    const q = program(ops(3));
    expect(tealRanges(q, mapping({ 1: 2, 2: 1, 3: 1 })).length).toBe(2);
  });

  it("doesn't fold ops without a line, or across a subroutine's start", () => {
    const p = program(ops(5));
    expect(tealRanges(p, mapping({ 1: 1, 3: 1 })).length).toBe(4);
    expect(tealRanges(p, mapping({ 1: 1, 2: 2, 3: 1 }, { 3: "c.algo.ts::C.f() -> void" })).length).toBe(4);
  });

  it("starts a range at each subroutine, and names library code", () => {
    const p = program(ops(6, { 4: "sub" }));
    const m = mapping({ 2: 1, 3: 1, 6: 3 }, { 1: "lib/x.d.ts::Contract.approvalProgram() -> uint64", 4: "puya-ts::itoa(i: uint64) -> bytes", 6: "c.algo.ts::C.f() -> void" });
    const rs = tealRanges(p, m);
    expect(rs.map((r) => [r.line?.line ?? null, r.sub ?? null, r.library ?? null])).toEqual([
      [null, "lib/x.d.ts::Contract.approvalProgram() -> uint64", "Contract.approvalProgram"],
      [1, null, null],
      [null, "puya-ts::itoa(i: uint64) -> bytes", "itoa"],
      [3, "c.algo.ts::C.f() -> void", null],
    ]);
    // Ops without a line in a subroutine of the contract's: added by the compiler.
    const q = program(ops(2));
    expect(tealRanges(q, mapping({ 2: 1 }, { 1: "c.algo.ts::C.g() -> void" }))[0].library).toBeUndefined();
  });

  it("names Python library code by its module", () => {
    const p = program(ops(6, { 4: "sub" }));
    const m = mapping(
      { 2: 1, 3: 1, 6: 3 },
      { 1: "algopy.arc4.ARC4Contract.approval_program() -> uint64", 4: "smart_contracts.proposal.contract.Proposal.pay(receiver: bytes, amount: uint64) -> void", 6: "smart_contracts.proposal.contract.Proposal.create[routing]() -> void" },
      "smart_contracts/proposal/contract.py",
    );
    expect(tealRanges(p, m).map((r) => r.library ?? null)).toEqual(["ARC4Contract.approval_program", null, null, null]);
  });

  it("indexes each line's range", () => {
    const p = program(ops(4, { 3: "l" }));
    const rs = tealRanges(p, mapping({ 1: 1, 2: 1, 3: 2, 4: 2 }));
    expect([...rangeIndex(rs, p.lines.length)]).toEqual([0, 0, 1, 1, 1]);
  });
});

describe("TEAL ranges, Escreg", () => {
  const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8"));
  const d = fixture("Escreg.approval.disassembly.json") as { hash: string; lines: { pc?: number; text: string }[] };
  const prog = program(d.lines, d.hash);
  const m = matchSpec(prog, fixture("Escreg.arc56.json") as Arc56Contract, "approval") as SourceMapping;
  const rs = tealRanges(prog, m);
  const at = (pc: number) => rs[rangeIndex(rs, prog.lines.length)[prog.pcLine.get(pc)!]];

  it("covers the program in 128 ranges, a subroutine starting 18 of them, 17 ops folded", () => {
    expect(rs.length).toBe(128);
    expect(rs.filter((r) => r.sub).length).toBe(18);
    expect(rs.reduce((n, r) => n + (r.asides?.size ?? 0), 0)).toBe(17);
    expect(rs.every((r, k) => k === 0 || r.first === rs[k - 1].last + 1)).toBe(true);
  });

  it("keeps `this.counter.value += 1` whole, the key's constant as an aside", () => {
    const r = at(256);
    expect(r.line?.text).toBe("this.counter.value += 1");
    expect(brief(prog, r)).toEqual([57, [256, 257, 258, 259, 260, 261, 262, 263, 264], [257, 262]]);
    expect(r.asides!.get(257)!.line).toBe(40);
  });

  it("opens register's routing at its label, the decorator line in two parts", () => {
    const r = at(233);
    expect(prog.lines[r.first].text).toBe("label3:");
    expect(r.sub).toMatch(/::Escreg\.register\[routing\]/);
    expect([r.line?.line, r.part, r.parts]).toEqual([51, 1, 2]);
    expect([at(280).line, at(280).part]).toEqual([r.line, 2]);
  });

  it("keeps each range's line, from either file", () => {
    expect(at(274).line?.file).toBe("smart_contracts/mbr-manager/contract.algo.ts");
    expect(at(280).line?.file).toBe("smart_contracts/escreg/contract.algo.ts");
  });

  it("marks library code", () => {
    expect(at(1).library).toBe("Contract.approvalProgram");
    expect(at(195).library).toBe("itoa");
  });
});

describe("lineText", () => {
  const line = (text: string, part?: boolean): SrcLine => ({ file: "a.algo.ts", line: 2, text, pcs: [], ...(part ? { part } : {}) });
  const files = fileLines({ "a.algo.ts": "class A {\n  if (n > 100) {\n}" });

  it("takes a whole-line quote over the file", () => {
    expect(lineText(line("if (n > 100) {"), files)).toBe("if (n > 100) {");
    expect(lineText(line("stale"), files)).toBe("stale");
  });

  it("takes the file's line where the spec quotes none, or part of it", () => {
    expect(lineText(line(""), files)).toBe("if (n > 100) {");
    expect(lineText(line("n > 100", true), files)).toBe("if (n > 100) {");
  });

  it("keeps the quote when the file's line doesn't have it (a file that differs from the build)", () => {
    expect(lineText(line("n > 200", true), files)).toBe("n > 200");
    // Nor where it only starts the same: `n > 10` isn't in `n > 100`.
    expect(lineText(line("n > 10", true), files)).toBe("n > 10");
  });

  it("keeps the quote, or nothing, without the file's line", () => {
    expect(lineText(line("n > 100", true), fileLines(undefined))).toBe("n > 100");
    expect(lineText(line(""), fileLines({ "b.ts": "x" }))).toBe("");
    expect(lineText({ ...line(""), line: 9 }, files)).toBe("");
  });
});
