import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { programHash, type SourceMapping } from "./arc56Source";
import { buildStepper, type Frame } from "./traceStepper";
import { appPrograms, bestFit, fitsBetter, folderSources, folderSpecs, mapKind, matchOnApp, otherApps, readSpecFiles, worthSaving } from "./traceSpecs";
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

describe("the trace's other apps", () => {
  const counter = JSON.parse(text("Counter.approval.disassembly.json")) as typeof disasm;
  // App 1006's approval and clear programs, then app 2000's approval program twice.
  const three: SCDevRound = {
    ...dev,
    traces: [
      ...dev.traces,
      { txid: "C", "exec-trace": { "approval-program-hash": counter.hash, "approval-program-trace": [{ pc: 1 }] } },
      { txid: "D", "exec-trace": { "approval-program-hash": counter.hash, "approval-program-trace": [{ pc: 1 }] } },
    ],
    programs: [disasm, clearProg, counter],
  };
  const T = buildStepper(three, [
    ...budget,
    { path: [2], txid: "C", kind: "approval" as const, "app-id": 2000, cost: 1, "budget-before": 697, "budget-after": 696 },
    { path: [3], txid: "D", kind: "approval" as const, "app-id": 2000, cost: 1, "budget-before": 696, "budget-after": 695 },
  ]);
  const escreg = T.frames.find((f) => f.hash === disasm.hash) as Frame;
  const ctr = T.frames.find((f) => f.hash === counter.hash) as Frame;

  it("lists each other app once, by its first run", () => {
    expect(otherApps(T, escreg).map((g) => [g.hash, g.appId])).toEqual([[counter.hash, ctr.appId]]);
    expect(otherApps(T, escreg)[0]).toBe(ctr);
    // App 1006's approval and clear programs are one app.
    expect(otherApps(T, ctr).map((g) => g.hash)).toEqual([disasm.hash]);
  });

  it("stands for an app by its approval run, even after a clear run", () => {
    const [a, b, c, d] = three.traces;
    const T2 = buildStepper({ ...three, traces: [b, a, c, d] }, [
      { ...budget[1], path: [0] },
      { ...budget[0], path: [1] },
      { path: [2], txid: "C", kind: "approval" as const, "app-id": 2000, cost: 1, "budget-before": 697, "budget-after": 696 },
      { path: [3], txid: "D", kind: "approval" as const, "app-id": 2000, cost: 1, "budget-before": 696, "budget-after": 695 },
    ]);
    const ctr2 = T2.frames.find((f) => f.hash === counter.hash) as Frame;
    expect(otherApps(T2, ctr2).map((g) => g.kind)).toEqual(["approval"]);
  });

  it("picks each app's spec from a folder's", () => {
    const escregSpec = readSpecFiles(files).spec!;
    const counterSpec = readSpecFiles([{ name: "Counter.arc56.json", text: text("Counter.arc56.json") }]).spec!;
    const cands = [
      { path: "proj/artifacts/Counter.arc56.json", spec: counterSpec },
      { path: "proj/artifacts/Escreg.arc56.json", spec: escregSpec },
    ];
    expect(bestFit(cands, (spec) => matchOnApp(T, escreg, spec))?.cand.path).toBe("proj/artifacts/Escreg.arc56.json");
    expect(bestFit(cands, (spec) => matchOnApp(T, ctr, spec))?.cand.path).toBe("proj/artifacts/Counter.arc56.json");
    expect(bestFit(cands.slice(1), (spec) => matchOnApp(T, ctr, spec))).toBeUndefined();
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

  it("ranks fits: exact, then more programs, then a map, then shallower", () => {
    const fit = (exact: boolean, programs: number, map: boolean, depth: number) => ({ exact, programs, map, depth });
    expect(fitsBetter(fit(false, 1, false, 9), undefined)).toBe(true);
    expect(fitsBetter(fit(true, 1, false, 9), fit(false, 2, true, 1))).toBe(true);
    expect(fitsBetter(fit(true, 2, false, 9), fit(true, 1, true, 1))).toBe(true);
    // A copy without maps loses to the build output with them, however shallow.
    expect(fitsBetter(fit(true, 2, false, 3), fit(true, 2, true, 6))).toBe(false);
    expect(fitsBetter(fit(true, 2, true, 6), fit(true, 2, false, 3))).toBe(true);
    expect(fitsBetter(fit(true, 2, true, 3), fit(true, 2, true, 6))).toBe(true);
    expect(fitsBetter(fit(true, 2, true, 6), fit(true, 2, true, 6))).toBe(false);
  });
});
