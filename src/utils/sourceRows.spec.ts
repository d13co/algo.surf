import { describe, expect, it } from "vitest";
import type { SrcLine } from "./arc56Source";
import { fileRows, isMethodLine, quotedRows, type Row } from "./sourceRows";

describe("method lines", () => {
  it("are method and function declarations", () => {
    const yes = [
      "  public register(appId: uint64): void {",
      "  private deriveAddrPrefix(appId: uint64): bytes<4> {",
      "  protected settleMbrCredits(account: Account, mbrBefore: uint64) {",
      "  public withdrawCredits() {",
      "  private static async load<T>(x: T): Promise<T> {",
      "  public longOne(",
      "  constructor() {",
      "  increment(): void {",
      "export function helper(a: uint64): uint64 {",
      "function helper(",
      "    def approve(self, amount: UInt64) -> bool:",
    ];
    expect(yes.filter((t) => !isMethodLine(t))).toEqual([]);
  });

  it("aren't calls, statements, decorators, classes or arrow functions", () => {
    const no = [
      "    loggedAssert(deficit === 0, errCredit)",
      "    this.settleMbrCredits(Txn.sender, mbrBefore)",
      "    if (!this.apps(key).exists) {",
      "    for (const appId of appIds) {",
      "    while (i < n) {",
      "  @abimethod({ readonly: true })",
      "    items.forEach((x) => {",
      "    foo(() => {",
      "    foo(",
      "  handler = (x: uint64) => {",
      "export class Escreg extends MbrManager {",
      "    return this.lookup(address)",
      "",
    ];
    expect(no.filter((t) => isMethodLine(t))).toEqual([]);
  });

  it("skip long lines, quickly", () => {
    const start = Date.now();
    expect(isMethodLine(`foo(${"a):".repeat(20000)}x`)).toBe(false);
    expect(isMethodLine(`  public f(${"a: uint64, ".repeat(40)}) {`)).toBe(false);
    expect(Date.now() - start).toBeLessThan(50);
  });
});

const F = "a.algo.ts";
const line = (n: number, text: string, more: Partial<SrcLine> = {}): SrcLine => ({ file: F, line: n, text, pcs: [n * 10], ...more });
/** A row as [line number, kind, the SrcLine's line]. */
const brief = (r: Row) =>
  r.kind !== "line" ? [r.kind] : [r.cont ?? r.line.line, r.noOps ? "none" : r.cont !== undefined ? "cont" : "ops", r.line.line, r.text ?? null];

describe("whole-file rows", () => {
  const two = line(2, "let x = 1");
  const range = line(4, "foo({", { end: 6, quoted: ["foo({", "a: 1,", "})"] });
  const inner = line(5, "a: 1,");

  it("has every line: ops lines as the mapping's, others without ops", () => {
    const rows = fileRows(F, "// head\n  let x = 1\nreturn", [two]);
    expect(rows.map(brief)).toEqual([
      [1, "none", 1, "// head"],
      [2, "ops", 2, "  let x = 1"],
      [3, "none", 3, "return"],
    ]);
    expect(rows[1].kind === "line" && rows[1].line).toBe(two);
  });

  it("reads CRLF and drops one trailing newline", () => {
    expect(fileRows(F, "a\r\nlet x = 1\r\n", [two]).map(brief)).toEqual([
      [1, "none", 1, "a"],
      [2, "ops", 2, "let x = 1"],
    ]);
    expect(fileRows(F, "a\n\n", []).length).toBe(2);
  });

  it("shows a range's later lines as part of it, unless a line has its own ops", () => {
    const text = ["x", "let x = 1", "y", "foo({", "  a: 1,", "})", "z"].join("\n");
    expect(fileRows(F, text, [two, range]).map(brief)).toEqual([
      [1, "none", 1, "x"],
      [2, "ops", 2, "let x = 1"],
      [3, "none", 3, "y"],
      [4, "ops", 4, "foo({"],
      [5, "cont", 4, "  a: 1,"],
      [6, "cont", 4, "})"],
      [7, "none", 7, "z"],
    ]);
    expect(fileRows(F, text, [range, inner]).map(brief).slice(3, 6)).toEqual([
      [4, "ops", 4, "foo({"],
      [5, "ops", 5, "  a: 1,"],
      [6, "cont", 4, "})"],
    ]);
  });

  it("keeps lines past the file's end, and only its own file's", () => {
    const rows = fileRows(F, "one", [line(3, "three"), { ...line(1, "other"), file: "b.algo.ts" }]);
    expect(rows.map(brief)).toEqual([
      [1, "none", 1, "one"],
      [3, "ops", 3, null],
    ]);
  });
});

describe("quoted-line rows", () => {
  it("groups by file, with a gap between lines that aren't consecutive (a range's end counts)", () => {
    const b = { ...line(1, "b"), file: "b.algo.ts" };
    const rows = quotedRows([line(1, "x"), line(2, "y", { end: 4 }), line(5, "z"), line(9, "w"), b], true);
    expect(rows.map((r) => (r.kind === "line" ? r.line.line : r.kind === "file" ? r.file : r.kind))).toEqual([F, 1, 2, 5, "gap", 9, "b.algo.ts", 1]);
    expect(quotedRows([line(1, "x")], false).map((r) => r.kind)).toEqual(["line"]);
  });
});
