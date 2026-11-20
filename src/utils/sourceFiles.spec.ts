import { readFileSync } from "node:fs";
import type { Arc56Contract } from "@algorandfoundation/algokit-utils/types/app-arc56";
import { describe, expect, it } from "vitest";
import { matchSpec, type PuyaMap, type SourceMapping, type SrcLine } from "./arc56Source";
import { checkSource, isSourceName, matchSourceFiles, mergeFiles, specSourcePaths, suffixLength, type Target } from "./sourceFiles";
import type { SpecRecord } from "./specStore";
import { readAddedFiles, readSpecFiles } from "./traceSpecs";
import type { Program } from "./traceStepper";

const text = (name: string) => readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8");
const escreg: Arc56Contract = JSON.parse(text("Escreg.arc56.json"));
const escregMap: PuyaMap = JSON.parse(text("Escreg.approval.puya.map"));
const disasm = JSON.parse(text("Escreg.approval.disassembly.json")) as { hash: string; lines: { pc?: number; text: string }[] };
const prog: Program = { hash: disasm.hash, lines: disasm.lines, pcLine: new Map(disasm.lines.flatMap((l, i) => (l.pc === undefined ? [] : [[l.pc, i]]))) };
const mapping = matchSpec(prog, escreg, "approval") as SourceMapping;

const ESCREG = "smart_contracts/escreg/contract.algo.ts";
const MBR = "smart_contracts/mbr-manager/contract.algo.ts";

/** A stand-in for a source file: the lines the spec quotes from it at their numbers (a range's every line), `// …` elsewhere. */
function fileFor(path: string, change: Record<number, string> = {}): string {
  const ls = mapping.lines.filter((l) => l.file === path);
  const out = Array.from({ length: Math.max(...ls.map((l) => l.end ?? l.line)) + 3 }, (_, n) => `// line ${n + 1}`);
  for (const l of ls) (l.quoted ?? [l.text]).forEach((t, k) => (out[l.line - 1 + k] = `    ${t}`));
  for (const [n, t] of Object.entries(change)) out[Number(n) - 1] = t;
  return out.join("\n");
}

const target = (rec: Partial<SpecRecord> = {}): Target => ({
  rec: { hash: prog.hash, kind: "approval", appId: 1006, name: "Escreg", arc56: escreg, addedAt: 1, ...rec },
  prog,
  map: mapping,
});

describe("source paths", () => {
  it("are the TEAL's files, and the map's sources that aren't the end of one", () => {
    expect(specSourcePaths(mapping.lines)).toEqual([ESCREG, MBR]);
    // The map's `../../escreg/contract.algo.ts` is the end of the TEAL's path: the same file.
    expect(escregMap.sources).toEqual(["../../escreg/contract.algo.ts", "../../mbr-manager/contract.algo.ts"]);
    expect(specSourcePaths(mapping.lines, escregMap)).toEqual([ESCREG, MBR]);
    expect(specSourcePaths(mapping.lines, { ...escregMap, sources: [...escregMap.sources!, "../lib/util.algo.ts"] })).toEqual([ESCREG, MBR, "lib/util.algo.ts"]);
  });

  it("share ends segment by segment", () => {
    expect(suffixLength(ESCREG, "contract.algo.ts")).toBe(1);
    expect(suffixLength(ESCREG, "escreg/contract.algo.ts")).toBe(2);
    expect(suffixLength(ESCREG, "projects/contract/smart_contracts/escreg/contract.algo.ts")).toBe(3);
    expect(suffixLength(ESCREG, "mbr-manager/contract.algo.ts")).toBe(1);
    expect(suffixLength(ESCREG, "contract.ts")).toBe(0);
    // Case aside, unless asked.
    expect(suffixLength(ESCREG, "Escreg/Contract.algo.ts")).toBe(2);
    expect(suffixLength(ESCREG, "Escreg/contract.algo.ts", true)).toBe(1);
  });

  it("are source files by a source language's extension only", () => {
    expect(["contract.algo.ts", "x.TS", "contract.py", "a.mts"].every(isSourceName)).toBe(true);
    expect(["Escreg.approval.teal", "Escreg.arc56.json", "README.md", "x.puya.map", "ts"].some(isSourceName)).toBe(false);
  });
});

describe("matching files to source paths", () => {
  const paths = [ESCREG, MBR];

  it("by the longest path end", () => {
    const r = matchSourceFiles(paths, mapping.lines, [
      { name: "contract.algo.ts", path: "contract/smart_contracts/mbr-manager/contract.algo.ts", text: "nothing quoted" },
      { name: "contract.algo.ts", path: "contract/smart_contracts/escreg/contract.algo.ts", text: fileFor(ESCREG) },
    ]);
    expect(r.matched.map((m) => m.path).sort()).toEqual([ESCREG, MBR]);
    expect(r.ambiguous).toEqual([]);
  });

  it("by its text when only the file name is known and it fits several paths", () => {
    const r = matchSourceFiles(paths, mapping.lines, [{ name: "contract.algo.ts", text: fileFor(MBR) }]);
    expect(r.matched.map((m) => [m.path, m.differs])).toEqual([[MBR, undefined]]);
    const none = matchSourceFiles(paths, mapping.lines, [{ name: "contract.algo.ts", text: "unrelated\ntext" }]);
    expect(none.ambiguous.map((a) => a.paths)).toEqual([[ESCREG, MBR]]);
    expect(none.matched).toEqual([]);
  });

  it("ignores case, preferring a path in the same case", () => {
    const r = matchSourceFiles(["src/A/x.ts", "src/a/x.ts"], [], [{ name: "x.ts", path: "a/X.TS", text: "" }]);
    expect(r.ambiguous.map((a) => a.paths)).toEqual([["src/A/x.ts", "src/a/x.ts"]]);
    const s = matchSourceFiles(["src/A/x.ts", "src/a/x.ts"], [], [{ name: "x.ts", path: "a/x.ts", text: "" }]);
    expect(s.matched.map((m) => m.path)).toEqual(["src/a/x.ts"]);
  });

  it("ignores unrelated files and keeps the better of two for a path", () => {
    const r = matchSourceFiles(paths, mapping.lines, [
      { name: "readme.ts", text: "x" },
      // As near the path, but one of its quoted lines differs.
      { name: "contract.algo.ts", path: "escreg/contract.algo.ts", text: fileFor(ESCREG, { [mapping.lines[0].line]: "changed" }) },
      { name: "contract.algo.ts", path: "src/escreg/contract.algo.ts", text: fileFor(ESCREG) },
    ]);
    expect(r.unrelated.map((f) => f.name)).toEqual(["readme.ts"]);
    expect(r.matched.map((m) => m.path)).toEqual([ESCREG]);
    expect(r.duplicate.map((d) => d.file.path)).toEqual(["escreg/contract.algo.ts"]);
  });
});

describe("checking a file against the build", () => {
  const lines = mapping.lines.filter((l) => l.file === ESCREG);
  const [a, b] = lines;

  it("accepts the quoted lines, whitespace-trimmed", () => {
    expect(checkSource(lines, fileFor(ESCREG))).toBeUndefined();
    expect(checkSource(lines, fileFor(ESCREG).replace(/\n/g, "\r\n"))).toBeUndefined();
  });

  it("checks every line of a range", () => {
    const r = lines.find((l) => l.end)!;
    expect(r.quoted!.length).toBeGreaterThan(2);
    const d = checkSource(lines, fileFor(ESCREG, { [r.line + 2]: "changed" }));
    expect(d).toEqual({ line: r.line + 2, spec: r.quoted![2], file: "changed", more: 0 });
  });

  it("gives the first line that differs, and how many more", () => {
    const d = checkSource(lines, fileFor(ESCREG, { [b.line]: "  changed();", [a.line]: "" }));
    expect(d).toEqual({ line: a.line, spec: a.text, file: "", more: 1 });
    // A file shorter than the build's.
    expect(checkSource([{ file: ESCREG, line: 9999, text: "x", pcs: [1] } as SrcLine], "a\nb")?.line).toBe(9999);
  });
});

describe("merging files into a saved spec", () => {
  it("adds a .puya.map that fits, and names the stack with it", () => {
    const { recs, notes } = mergeFiles([target()], [{ name: "Escreg.approval.puya.map", kind: "approval", map: escregMap }], []);
    expect(recs.length).toBe(1);
    expect(recs[0].puyaMap).toBe(escregMap);
    expect(notes).toEqual([{ text: "Escreg.approval.puya.map fits the approval program: the stack values are named." }]);
    const m = matchSpec(prog, escreg, "approval", recs[0].puyaMap) as SourceMapping;
    expect(m.stackOut?.size).toBeGreaterThan(0);
  });

  it("doesn't store a map that doesn't fit, and says why", () => {
    const other: PuyaMap = JSON.parse(text("TimeSeek.approval.puya.map"));
    const named = mergeFiles([target()], [{ name: "TimeSeek.approval.puya.map", kind: "approval", map: other }], []);
    expect(named.recs).toEqual([]);
    expect(named.notes).toEqual([{ text: expect.stringMatching(/^TimeSeek.approval.puya.map doesn't fit the approval program of this spec \(the approval program: .+\): not added\.$/), bad: true }]);
    const unplaced = mergeFiles([target()], [{ name: "x.puya.map", map: other }], []);
    expect(unplaced.notes[0]).toMatchObject({ bad: true, text: expect.stringMatching(/^x.puya.map doesn't fit the approval program/) });
    expect(mergeFiles([], [{ name: "x.puya.map", map: other }], []).notes).toEqual([{ text: "x.puya.map: no saved spec here to add it to.", bad: true }]);
  });

  it("tries a map with the other program when its name says one without a saved spec", () => {
    const r = mergeFiles([target()], [{ name: "Escreg.clear.puya.map", kind: "clear", map: escregMap }], []);
    expect(r.recs[0].puyaMap).toBe(escregMap);
    expect(r.notes).toEqual([{ text: "Escreg.clear.puya.map fits the approval program (though its name says clear): the stack values are named." }]);
  });

  it("keeps source files under their spec paths, merged with those it has, and says what is missing", () => {
    const first = mergeFiles([target()], [], [{ name: "Contract.algo.ts", path: "MBR-manager/Contract.algo.ts", text: fileFor(MBR) }, { name: "other.ts", text: "" }]);
    expect(Object.keys(first.recs[0].sources ?? {})).toEqual([MBR]);
    expect(first.notes).toEqual([
      { text: `MBR-manager/Contract.algo.ts is ${MBR}.` },
      { text: "Ignored other.ts: not among the spec's source files.", info: true },
      { text: `Still missing: ${ESCREG}.`, info: true },
    ]);
    const q = mapping.lines.filter((l) => l.file === ESCREG)[3].line;
    const changed = fileFor(ESCREG, { [q]: "export class Changed {}" });
    const second = mergeFiles([target({ sources: first.recs[0].sources })], [], [{ name: "contract.algo.ts", text: changed }]);
    expect(Object.keys(second.recs[0].sources ?? {}).sort()).toEqual([ESCREG, MBR]);
    expect(second.recs[0].sources?.[ESCREG]).toBe(changed);
    expect(second.notes[0]).toMatchObject({ bad: true, text: expect.stringMatching(new RegExp(`^contract\\.algo\\.ts differs from the build at line ${q}: the spec has “.+”, the file “export class Changed {}”\\. Added anyway`)) });
    expect(second.notes[second.notes.length - 1]).toEqual({ text: "Every source file of the spec is added.", info: true });
  });

  it("matches only the files the TEAL quotes, and says when there's no source view", () => {
    // The map's sources name a file the TEAL doesn't quote: not one to keep.
    const t = target({ puyaMap: { ...escregMap, sources: [...escregMap.sources!, "../lib/util.algo.ts"] } });
    expect(mergeFiles([t], [], [{ name: "util.algo.ts", text: "" }]).notes[0]).toMatchObject({ info: true, text: expect.stringMatching(/^Ignored util\.algo\.ts/) });
    const bare = { ...target(), map: { ...mapping, lines: [] } };
    const r = mergeFiles([bare], [], [{ name: "contract.algo.ts", text: fileFor(ESCREG) }]);
    expect(r.recs).toEqual([]);
    expect(r.notes).toEqual([{ text: expect.stringMatching(/no TypeScript view to show contract\.algo\.ts in: not added\.$/), bad: true }]);
  });
});

describe("reading files", () => {
  it("takes source files with a spec", () => {
    const { spec, errors } = readSpecFiles([
      { name: "Escreg.arc56.json", text: text("Escreg.arc56.json") },
      { name: "contract.algo.ts", path: "escreg/contract.algo.ts", text: "x" },
    ]);
    expect(errors).toEqual([]);
    expect(spec?.files).toEqual([{ name: "contract.algo.ts", path: "escreg/contract.algo.ts", text: "x" }]);
    expect(readSpecFiles([{ name: "contract.algo.ts", text: "x" }]).errors).toEqual(["source files need their ARC-56 spec (*.arc56.json) with them"]);
    expect(readSpecFiles([{ name: "Escreg.approval.teal", text: "#pragma version 11" }]).errors).toEqual(["Escreg.approval.teal: not an ARC-56 spec, a .puya.map or a source file (.ts, .py)"]);
  });

  it("takes maps and source files for a saved spec, not another spec", () => {
    const files = [
      { name: "Escreg.approval.puya.map", text: text("Escreg.approval.puya.map") },
      { name: "contract.algo.ts", text: "x" },
      { name: "Escreg.arc56.json", text: text("Escreg.arc56.json") },
      { name: "notes.json", text: "{}" },
      { name: "Escreg.approval.teal", text: "#pragma version 11" },
    ];
    const r = readAddedFiles(files, [escreg]);
    expect(r.maps.map((m) => [m.name, m.kind])).toEqual([["Escreg.approval.puya.map", "approval"]]);
    expect(r.files.map((f) => f.name)).toEqual(["contract.algo.ts"]);
    // The saved spec itself is skipped without a word.
    expect(r.errors).toEqual(["notes.json: not a .puya.map or a source file (.ts, .py)", "Escreg.approval.teal: not a .puya.map or a source file (.ts, .py)"]);
    expect(readAddedFiles(files.slice(2, 3), [{ ...escreg, name: "Other" }]).errors).toEqual([
      "Escreg.arc56.json: a different ARC-56 spec; to replace the saved one, remove it first (specs…)",
    ]);
    const two = readAddedFiles([files[0], { ...files[0], name: "B.approval.puya.map" }, { ...files[0], name: "C.clear.puya.map" }]);
    expect(two.maps.map((m) => m.name)).toEqual(["C.clear.puya.map"]);
    expect(two.errors).toEqual(["2 .puya.maps for the approval program (Escreg.approval.puya.map, B.approval.puya.map): give one"]);
  });
});
