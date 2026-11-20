import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { programHash, type SourceMapping } from "./arc56Source";
import { buildStepper, type Frame } from "./traceStepper";
import { appPrograms, mapKind, matchOnApp, readSpecFiles, worthSaving } from "./traceSpecs";
import type { SCDevRound } from "./txnDevInfo";

const text = (name: string) => readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8");
const disasm = JSON.parse(text("Escreg.approval.disassembly.json")) as { hash: string; lines: { pc?: number; text: string }[] };
const clearHash = programHash(Uint8Array.from(atob("C4EBQw=="), (c) => c.charCodeAt(0)));
const clearProg = { hash: clearHash, lines: [{ text: "#pragma version 11" }, { pc: 1, text: "pushint 1" }, { pc: 3, text: "return" }] };

// App 1006's approval program in one transaction, its clear program in another.
const dev: SCDevRound = {
  round: 1,
  traces: [
    { txid: "A", "exec-trace": { "approval-program-hash": disasm.hash, "approval-program-trace": [{ pc: 1 }] } },
    { txid: "B", "exec-trace": { "clear-state-program-hash": clearHash, "clear-state-program-trace": [{ pc: 1 }, { pc: 3 }] } },
  ],
  programs: [disasm, clearProg],
};
const budget = [
  { path: [0], txid: "A", kind: "approval" as const, "app-id": 1006, cost: 1, "budget-before": 700, "budget-after": 699 },
  { path: [1], txid: "B", kind: "clear" as const, "app-id": 1006, cost: 2, "budget-before": 699, "budget-after": 697 },
];

const files = [
  { name: "Escreg.arc56.json", text: text("Escreg.arc56.json") },
  { name: "Escreg.approval.puya.map", text: text("Escreg.approval.puya.map") },
];

describe("trace specs", () => {
  const T = buildStepper(dev, budget);
  const approval = T.frames.find((f) => f.kind === "approval") as Frame;
  const clear = T.frames.find((f) => f.kind === "clear") as Frame;

  it("reads a spec and its maps from files", () => {
    const { spec, errors } = readSpecFiles(files);
    expect(errors).toEqual([]);
    expect(spec?.name).toBe("Escreg");
    expect(Object.keys(spec?.maps ?? {})).toEqual(["approval"]);
    expect(mapKind("Escreg.clear.puya.map")).toBe("clear");
    expect(mapKind("ClearingHouse.approval.puya.map")).toBe("approval");
    expect(mapKind("Escreg.puya.map")).toBeUndefined();
    expect(readSpecFiles([{ name: "x.json", text: "{" }]).errors).toEqual(["x.json: not JSON"]);
    expect(readSpecFiles([files[1]]).errors[0]).toMatch(/needs its ARC-56 spec/);
  });

  it("finds the app's other program in the trace", () => {
    expect(appPrograms(T, approval).map((p) => [p.kind, p.current])).toEqual([
      ["approval", true],
      ["clear", false],
    ]);
    // Without the app ID, only the program it was added on.
    expect(appPrograms(buildStepper(dev), approval).length).toBe(1);
  });

  it("matches both programs, saving the clear one only with source lines", () => {
    const { spec } = readSpecFiles(files);
    const [a, c] = matchOnApp(T, approval, spec!);
    expect(a).toMatchObject({ kind: "approval", appId: 1006, save: true, current: true });
    expect((a.result as SourceMapping).exact).toBe(true);
    expect((a.result as SourceMapping).stackOut?.size).toBeGreaterThan(0);
    expect(c).toMatchObject({ kind: "clear", save: false });
    expect((c.result as SourceMapping).lines).toEqual([]);
    // Added on the clear run: the same two programs, that one first.
    expect(matchOnApp(T, clear, spec!).map((m) => [m.kind, m.current, m.save])).toEqual([
      ["clear", true, false],
      ["approval", false, true],
    ]);
  });

  it("reports two specs, or two maps for one program, instead of keeping the last", () => {
    const two = readSpecFiles([files[0], { ...files[0], name: "Other.arc56.json" }]);
    expect(two.spec).toBeUndefined();
    expect(two.errors[0]).toMatch(/2 ARC-56 specs given \(Escreg.arc56.json, Other.arc56.json\)/);
    const maps = readSpecFiles([...files, { ...files[1], name: "Old.approval.puya.map" }]);
    expect(maps.spec).toBeUndefined();
    expect(maps.errors[0]).toMatch(/2 .puya.maps for the approval program/);
    expect(readSpecFiles([files[0], { ...files[1], name: "a.puya.map" }, { ...files[1], name: "b.puya.map" }]).errors[0]).toMatch(/don't say approval or clear/);
  });

  it("tries a map whose name says neither program with both", () => {
    const { spec } = readSpecFiles([files[0], { name: "Escreg.puya.map", text: files[1].text }]);
    expect(spec?.unplaced).toBeDefined();
    expect(spec?.maps).toEqual({});
    const [a, c] = matchOnApp(T, approval, spec!);
    expect(a.puyaMap).toBe(spec?.unplaced);
    expect((a.result as SourceMapping).stackOut?.size).toBeGreaterThan(0);
    // It doesn't fit the clear program: left out there, without a complaint.
    expect(c.puyaMap).toBeUndefined();
    expect((c.result as SourceMapping).mapMismatch).toBeUndefined();
  });

  it("saves an approval match without source lines (for its names), not a clear one", () => {
    const { spec } = readSpecFiles(files);
    const teal = new TextDecoder().decode(Uint8Array.from(atob(spec!.arc56.source!.approval), (ch) => ch.charCodeAt(0)));
    const bare = teal
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");
    const arc56 = { ...spec!.arc56, source: { ...spec!.arc56.source!, approval: btoa(bare) } };
    const [a] = matchOnApp(T, approval, { name: "bare", arc56, maps: {} });
    expect("mismatch" in a.result).toBe(false);
    expect((a.result as SourceMapping).lines).toEqual([]);
    expect((a.result as SourceMapping).errors.size).toBeGreaterThan(0);
    expect(a.save).toBe(true);
    expect(worthSaving("clear", a.result)).toBe(false);
  });
});
