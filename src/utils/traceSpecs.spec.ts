import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { matchSpec, programHash, type SourceMapping } from "./arc56Source";
import { addFiles, newSpec, pickSpec } from "./specLibrary";
import { buildStepper, type Frame } from "./traceStepper";
import { appPrograms, folderSources, folderSpecs, mapKind, worthSaving } from "./traceSpecs";
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

  const escreg = JSON.parse(files[0].text);
  const escregMap = JSON.parse(files[1].text);

  it("names the program a .puya.map maps from its file name", () => {
    expect(mapKind("Escreg.clear.puya.map")).toBe("clear");
    expect(mapKind("ClearingHouse.approval.puya.map")).toBe("approval");
    expect(mapKind("Escreg.puya.map")).toBeUndefined();
  });

  it("finds the app's other program in the trace", () => {
    expect(appPrograms(T, approval).map((p) => [p.kind, p.current])).toEqual([
      ["approval", true],
      ["clear", false],
    ]);
    // Without the app ID, only the program it was added on.
    expect(appPrograms(buildStepper(dev), approval).length).toBe(1);
  });

  it("uses an approval match, exactly and with the map; not a clear match without source lines", () => {
    const lib = addFiles(newSpec(escreg, undefined, undefined, 0), [{ name: "Escreg.approval.puya.map", map: escregMap }], [], 0).spec;
    const m = pickSpec(approval.prog!, "approval", [lib])!;
    expect(m.map.exact).toBe(true);
    expect(m.map.stackOut?.size).toBeGreaterThan(0);
    // Puya's default clear program: many apps', with no source lines.
    expect(pickSpec(clear.prog!, "clear", [lib])).toBeUndefined();
  });

  it("tries a map whose name says neither program with both", () => {
    const lib = { ...newSpec(escreg, undefined, undefined, 0), maps: { unplaced: { name: "Escreg.puya.map", map: escregMap } } };
    const m = pickSpec(approval.prog!, "approval", [lib])!;
    expect(m.puyaMap).toBe(escregMap);
    expect(m.map.stackOut?.size).toBeGreaterThan(0);
  });

  it("uses an approval match without source lines (for its names), not a clear one", () => {
    const teal = new TextDecoder().decode(Uint8Array.from(atob(escreg.source.approval), (ch) => ch.charCodeAt(0)));
    const bare = teal
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");
    const arc56 = { ...escreg, source: { ...escreg.source, approval: btoa(bare) } };
    const r = matchSpec(approval.prog!, arc56, "approval");
    expect("mismatch" in r).toBe(false);
    expect((r as SourceMapping).lines).toEqual([]);
    expect((r as SourceMapping).errors.size).toBeGreaterThan(0);
    expect(worthSaving("approval", r)).toBe(true);
    expect(worthSaving("clear", r)).toBe(false);
    expect(pickSpec(approval.prog!, "approval", [newSpec(arc56, undefined, undefined, 0)])).toBeDefined();
  });
});

describe("a chosen folder", () => {
  const at = (path: string) => ({ name: path.slice(path.lastIndexOf("/") + 1), path });
  const files = [
    at("proj/node_modules/lib/artifacts/Escreg.arc56.json"),
    at("proj/node_modules/lib/contract.algo.ts"),
    at("proj/smart_contracts/artifacts/mbr/MbrManager.arc56.json"),
    at("proj/smart_contracts/artifacts/escreg/Escreg.arc56.json"),
    at("proj/smart_contracts/artifacts/escreg/Escreg.approval.puya.map"),
    at("proj/smart_contracts/artifacts/escreg/Escreg.clear.puya.map"),
    at("proj/smart_contracts/artifacts/escreg/Other.approval.puya.map"),
    at("proj/smart_contracts/artifacts/Escreg.approval.puya.map"),
    at("proj/Top.arc56.json"),
    at("proj/smart_contracts/escreg/contract.algo.ts"),
    at("proj/smart_contracts/mbr-manager/contract.algo.ts"),
    at("proj/smart_contracts/escreg/deploy-config.ts"),
  ];

  it("finds its specs outside node_modules, shallowest first, each with the maps beside it named for it", () => {
    const got = folderSpecs(files).map((c) => [c.spec.path, c.maps.map((m) => m.name)]);
    expect(got).toEqual([
      ["proj/Top.arc56.json", []],
      ["proj/smart_contracts/artifacts/mbr/MbrManager.arc56.json", []],
      ["proj/smart_contracts/artifacts/escreg/Escreg.arc56.json", ["Escreg.approval.puya.map", "Escreg.clear.puya.map"]],
    ]);
  });

  const specPaths = ["smart_contracts/escreg/contract.algo.ts", "smart_contracts/mbr-manager/contract.algo.ts"];

  it("picks the source files at the spec's paths, not other contracts' files of the same name, nor node_modules'", () => {
    const more = [...files, at("proj/smart_contracts/other/contract.algo.ts"), at("proj/node_modules/x/smart_contracts/escreg/contract.algo.ts")];
    expect(folderSources(more, specPaths).map((f) => f.path)).toEqual([
      "proj/smart_contracts/escreg/contract.algo.ts",
      "proj/smart_contracts/mbr-manager/contract.algo.ts",
    ]);
  });

  it("picks them in a folder chosen deeper or under another name", () => {
    // The contract's own folder: its path below the folder ends a spec path.
    expect(folderSources([at("escreg/contract.algo.ts"), at("escreg/deploy-config.ts")], specPaths).map((f) => f.path)).toEqual(["escreg/contract.algo.ts"]);
    // A copy under another name, the file right in it.
    expect(folderSources([at("copy/contract.algo.ts"), at("copy/sub/contract.algo.ts")], specPaths).map((f) => f.path)).toEqual(["copy/contract.algo.ts"]);
    // The smart_contracts folder itself.
    expect(folderSources([at("smart_contracts/escreg/contract.algo.ts"), at("smart_contracts/other/contract.algo.ts")], specPaths).map((f) => f.path)).toEqual([
      "smart_contracts/escreg/contract.algo.ts",
    ]);
  });

  it("reads spec paths with ./, .. and backslashes as their segments, from a folder above the project", () => {
    const above = [at("code/proj/smart_contracts/escreg/contract.algo.ts"), at("code/proj/smart_contracts/other/contract.algo.ts")];
    for (const p of ["../smart_contracts/escreg/contract.algo.ts", "./smart_contracts/escreg/contract.algo.ts", "smart_contracts\\escreg\\contract.algo.ts"]) {
      expect([p, folderSources(above, [p]).map((f) => f.path)]).toEqual([p, ["code/proj/smart_contracts/escreg/contract.algo.ts"]]);
    }
  });
});
