import { readFileSync } from "node:fs";
import type { Arc56Contract } from "@algorandfoundation/algokit-utils/types/app-arc56";
import { describe, expect, it } from "vitest";
import { matchSpec, type PuyaMap, type SourceMapping, type SrcLine } from "./arc56Source";
import { checkSource, isSourceName, matchSourceFiles, specSourcePaths, suffixLength } from "./sourceFiles";
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
