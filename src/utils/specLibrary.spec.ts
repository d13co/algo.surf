import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildStepper, type Program } from "./traceStepper";
import { addFiles, fillMissing, isSpecJson, mergeSpec, specId, fromRecords, importFiles, importFolder, libPaths, mapFit, missingSources, newSpec, noteApp, pickSpec, sourceFits, specLang, toRecord, type FolderEntry } from "./specLibrary";

const text = (name: string) => readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8");
const escreg = JSON.parse(text("Escreg.arc56.json"));
const escregMap = JSON.parse(text("Escreg.approval.puya.map"));
const timeSeek = JSON.parse(text("TimeSeek.arc56.json"));
const counter = JSON.parse(text("Counter.arc56.json"));
/** A program as the debugger reads it from a trace. */
function prog(name: string): Program {
  const d = JSON.parse(text(name)) as { hash: string; lines: { pc?: number; text: string }[] };
  const T = buildStepper({ traces: [{ txid: "A", "exec-trace": { "approval-program-hash": d.hash, "approval-program-trace": [{ pc: 1 }] } }], programs: [d] });
  return T.frames.find((f) => f.kind === "approval")!.prog!;
}
const disasm = prog("Escreg.approval.disassembly.json");
const counterProg = prog("Counter.approval.disassembly.json");

const now = 1_700_000_000_000;

describe("spec library", () => {
  it("reads a spec's source paths and language from its TEAL", () => {
    const s = newSpec(escreg, "Escreg.arc56.json", undefined, now);
    expect(s.name).toBe("Escreg");
    expect(libPaths(s).length).toBeGreaterThan(0);
    expect(libPaths(s).every((p) => /\.algo\.ts$/.test(p))).toBe(true);
    expect(specLang(escreg)).toBe("TypeScript");
  });

  it("checks a .puya.map by op count", () => {
    expect(mapFit(escreg, "approval", escregMap).ok).toBe(true);
    expect(mapFit(escreg, "unplaced", escregMap)).toMatchObject({ ok: true, kind: "approval" });
    expect(mapFit(timeSeek, "approval", escregMap).ok).toBe(false);
    expect(mapFit(timeSeek, "approval", JSON.parse(text("TimeSeek.approval.puya.map"))).ok).toBe(true);
    expect(mapFit(timeSeek, "clear", JSON.parse(text("TimeSeek.clear.puya.map"))).ok).toBe(true);
  });

  it("adds loose files: a map by its name, a source file by the paths the spec names", () => {
    const path = libPaths(newSpec(escreg, undefined, undefined, now))[0];
    const name = path.slice(path.lastIndexOf("/") + 1);
    const r = importFiles(
      [
        { name: "Escreg.arc56.json", text: text("Escreg.arc56.json") },
        { name: "Escreg.approval.puya.map", text: text("Escreg.approval.puya.map") },
        { name, path: `proj/${path}`, text: "// not the file" },
      ],
      [],
      now,
    );
    expect(r.put).toHaveLength(1);
    expect(Object.keys(r.put[0].maps)).toEqual(["approval"]);
    expect(Object.keys(r.put[0].sources)).toEqual([path]);
    expect(r.notes.some((n) => /differs/.test(n.text))).toBe(true);

    // A map later, to the saved spec named as it is.
    const saved = { ...r.put[0], maps: {} };
    const later = importFiles([{ name: "Escreg.approval.puya.map", text: text("Escreg.approval.puya.map") }], [saved], now);
    expect(later.put.map((s) => Object.keys(s.maps))).toEqual([["approval"]]);
    // A map with no spec of its name.
    expect(importFiles([{ name: "Other.approval.puya.map", text: text("Escreg.approval.puya.map") }], [saved], now).notes[0]).toMatchObject({ bad: true });
  });

  it("fills a saved copy's missing files without replacing any", () => {
    const a = newSpec(escreg, undefined, undefined, now);
    a.sources["x/contract.algo.ts"] = { text: "saved" };
    const b = newSpec(escreg, undefined, undefined, now);
    b.sources["x/contract.algo.ts"] = { text: "new" };
    b.maps.approval = { name: "m", map: escregMap };
    const r = fillMissing(a, b, now + 1);
    expect(r.added).toBe(1);
    expect(r.spec.sources["x/contract.algo.ts"].text).toBe("saved");
    // Adding the same spec again: no new copy.
    const again = importFiles([{ name: "Escreg.arc56.json", text: text("Escreg.arc56.json") }], [a], now);
    expect(again.put).toEqual([]);
  });

  it("reads a folder: specs with the maps beside them and their source files", async () => {
    const path = libPaths(newSpec(escreg, undefined, undefined, now))[0];
    const entry = (p: string, body: string): FolderEntry => ({ name: p.slice(p.lastIndexOf("/") + 1), path: p, read: async () => body });
    const files = [
      entry("proj/artifacts/escreg/Escreg.arc56.json", text("Escreg.arc56.json")),
      entry("proj/artifacts/escreg/Escreg.approval.puya.map", text("Escreg.approval.puya.map")),
      entry(`proj/${path}`, "// source"),
      entry("proj/node_modules/x/Other.arc56.json", text("Counter.arc56.json")),
    ];
    const r = await importFolder(files, [], now);
    expect(r.put.map((s) => s.name)).toEqual(["Escreg"]);
    expect(Object.keys(r.put[0].maps)).toEqual(["approval"]);
    expect(Object.keys(r.put[0].sources)).toEqual([path]);
    expect(r.put[0].from).toBe("proj/artifacts/escreg/Escreg.arc56.json");
    expect((await importFolder([entry("proj/a.ts", "")], [], now)).notes[0].bad).toBe(true);
  });

  it("takes a TEALScript source file, whose TEAL quotes part of a line, as the one built", async () => {
    // TEALScript quotes `limit > 0` of `assert(limit > 0, ...)`: not a whole line, as Puya's are.
    const src = text("counter.algo.ts.txt");
    const entry = (p: string, body: string): FolderEntry => ({ name: p.slice(p.lastIndexOf("/") + 1), path: p, read: async () => body });
    const r = await importFolder([entry("proj/contracts/artifacts/Counter.arc56.json", text("Counter.arc56.json")), entry("proj/contracts/counter.algo.ts", src)], [], now);
    expect(r.notes.filter((n) => n.bad)).toEqual([]);
    expect(Object.keys(r.put[0].sources)).toEqual(["contracts/counter.algo.ts"]);
    // Loose, it goes to the saved spec whose lines it has.
    expect(sourceFits(r.put[0], { name: "counter.algo.ts", text: src })).toBe(true);
    // Another build's file is still told apart.
    const other = src.replace("assert(limit > 0, 'limit must be positive');", "assert(limit > 1, 'limit must be positive');");
    expect(sourceFits(r.put[0], { name: "counter.algo.ts", text: other })).toBe(false);
  });

  it("reads a folder's specs under a scope only, with source files from anywhere in it", async () => {
    const path = libPaths(newSpec(escreg, undefined, undefined, now))[0];
    const entry = (p: string, body: string): FolderEntry => ({ name: p.slice(p.lastIndexOf("/") + 1), path: p, read: async () => body });
    const files = [
      entry("repo/artifacts/escreg/Escreg.arc56.json", text("Escreg.arc56.json")),
      entry("repo/other/Counter.arc56.json", text("Counter.arc56.json")),
      entry(`repo/${path}`, "// source"),
    ];
    const from = (p: string) => `https://github.com/o/r/blob/abc/${p.slice("repo/".length)}`;
    const r = await importFolder(files, [], now, { scope: "repo/artifacts/", from, label: "o/r@main/artifacts" });
    expect(r.put.map((s) => s.name)).toEqual(["Escreg"]);
    expect(Object.keys(r.put[0].sources)).toEqual([path]);
    expect(r.put[0].from).toBe("https://github.com/o/r/blob/abc/artifacts/escreg/Escreg.arc56.json");
    // A spec file as the scope: that spec only.
    const one = await importFolder(files, [], now, { scope: "repo/other/Counter.arc56.json" });
    expect(one.put.map((s) => s.name)).toEqual(["Counter"]);
    // Nothing there: the note names the label.
    const none = await importFolder(files, [], now, { scope: "repo/docs", label: "o/r@main/docs" });
    expect(none.put).toEqual([]);
    expect(none.notes[0]).toMatchObject({ bad: true, text: expect.stringMatching(/^o\/r@main\/docs has no ARC-56 spec/) });
  });

  it("adds a folder's other specs when one can't be read, and a spec without a source file that can't be", async () => {
    const path = libPaths(newSpec(escreg, undefined, undefined, now))[0];
    const entry = (p: string, body: string): FolderEntry => ({ name: p.slice(p.lastIndexOf("/") + 1), path: p, read: async () => body });
    const failing = (p: string, msg: string): FolderEntry => ({ ...entry(p, ""), read: () => Promise.reject(new Error(msg)) });
    const files = [
      entry("repo/a/Escreg.arc56.json", text("Escreg.arc56.json")),
      failing(`repo/${path}`, "Couldn't read it from GitHub (429)."),
      failing("repo/a/Escreg.approval.puya.map", "Couldn't read the map from GitHub (500)."),
      failing("repo/b/Counter.arc56.json", "Couldn't read Counter from GitHub (500)."),
    ];
    const r = await importFolder(files, [], now);
    expect(r.put.map((s) => s.name)).toEqual(["Escreg"]);
    expect(r.put[0].sources).toEqual({});
    expect(r.put[0].maps).toEqual({});
    expect(r.notes).toContainEqual({ text: "Escreg.arc56.json: Couldn't read it from GitHub (429).", bad: true });
    expect(r.notes).toContainEqual({ text: "Escreg.arc56.json: Couldn't read the map from GitHub (500).", bad: true });
    expect(r.notes).toContainEqual({ text: "Counter.arc56.json: not added. Couldn't read Counter from GitHub (500).", bad: true });
  });

  it("picks the spec that matches a program, and records the app", () => {
    const e = addFiles(newSpec(escreg, undefined, undefined, now), [{ name: "Escreg.approval.puya.map", map: escregMap }], [], now).spec;
    const c = newSpec(counter, undefined, undefined, now);
    const m = pickSpec(disasm, "approval", [c, e]);
    expect(m?.lib.id).toBe(e.id);
    expect(m?.puyaMap).toBe(escregMap);
    expect(pickSpec(counterProg, "approval", [e, c])?.lib.id).toBe(c.id);
    expect(pickSpec(disasm, "approval", [c])).toBeUndefined();

    const rec = toRecord(m!, disasm.hash, "approval", 1006);
    expect(rec).toMatchObject({ hash: disasm.hash, kind: "approval", appId: 1006, name: "Escreg" });

    const seen = noteApp(e, { hash: disasm.hash, kind: "approval", network: "Localnet" }, now)!;
    expect(seen.apps).toEqual([{ hash: disasm.hash, kind: "approval", network: "Localnet", firstSeen: now, lastSeen: now }]);
    // Its app ID once known; nothing new a moment later.
    const named = noteApp(seen, { hash: disasm.hash, kind: "approval", appId: 1006, network: "Localnet" }, now + 1)!;
    expect(named.apps).toHaveLength(1);
    expect(named.apps[0]).toMatchObject({ appId: 1006, firstSeen: now, lastSeen: now + 1 });
    expect(noteApp(named, { hash: disasm.hash, kind: "approval", appId: 1006, network: "Localnet" }, now + 2)).toBeUndefined();
    // The same program as another app: a second entry.
    expect(noteApp(named, { hash: disasm.hash, kind: "approval", appId: 1010, network: "Localnet" }, now + 2)!.apps).toHaveLength(2);
  });

  it("moves the debugger's per-program records into specs", () => {
    const recs = [
      { hash: "A", kind: "approval" as const, appId: 1, name: "Escreg", arc56: escreg, puyaMap: escregMap, sources: { "a.algo.ts": "x" }, addedAt: 5 },
      { hash: "C", kind: "clear" as const, appId: 1, name: "Escreg", arc56: escreg, addedAt: 3 },
    ];
    const [s, ...rest] = fromRecords(recs, "Mainnet");
    expect(rest).toEqual([]);
    expect(s.addedAt).toBe(3);
    expect(Object.keys(s.maps)).toEqual(["approval"]);
    expect(s.sources["a.algo.ts"].text).toBe("x");
    expect(s.apps.map((a) => [a.hash, a.kind, a.appId, a.network])).toEqual([
      ["A", "approval", 1, "Mainnet"],
      ["C", "clear", 1, "Mainnet"],
    ]);
    expect(missingSources(s).length).toBeGreaterThan(0);
  });

  it("never sends a loose source file to a spec whose quoted lines it lacks, nor replaces a saved one", () => {
    const path = libPaths(newSpec(escreg, undefined, undefined, now)).find((p) => p.startsWith("smart_contracts/escreg/"))!;
    const ts = newSpec(timeSeek, undefined, undefined, now);
    const es = newSpec(escreg, undefined, undefined, now);
    es.sources[path] = { text: "SAVED" };
    // Another contract's contract.algo.ts: named by both specs, the lines of neither.
    const r = importFiles([{ name: "contract.algo.ts", path: "other/contract.algo.ts", text: "// some other contract" }], [ts, es], now);
    expect(r.put).toEqual([]);
    expect(r.notes[0]).toMatchObject({ bad: true });
    // The saved spec given again with a file for a path it has: the saved file stays.
    const again = importFiles([{ name: "Escreg.arc56.json", text: text("Escreg.arc56.json") }, { name: "contract.algo.ts", path, text: "NEW" }], [es], now);
    expect(again.put.every((x) => x.sources[path].text === "SAVED")).toBe(true);
    // "Add files" on the spec: the user chose it, so it replaces.
    const chosen = importFiles([{ name: "contract.algo.ts", path, text: "NEW" }], [es], now, es);
    expect(chosen.put[0].sources[path].text).toBe("NEW");
  });

  it("adds a .puya.map only where it fits, preferring the version of the spec it fits", () => {
    const ts = newSpec(timeSeek, "TimeSeek.arc56.json", undefined, now);
    const r = importFiles([{ name: "TimeSeek.approval.puya.map", text: text("Escreg.approval.puya.map") }], [ts], now);
    expect(r.put).toEqual([]);
    expect(r.notes[0].text).toMatch(/doesn't fit TimeSeek/);
    // Two specs named Escreg: the map goes to the one it fits.
    const other = { ...newSpec(timeSeek, undefined, undefined, now), name: "Escreg", file: "Escreg.arc56.json", addedAt: now + 1 };
    const es = newSpec(escreg, "Escreg.arc56.json", undefined, now);
    const m = importFiles([{ name: "Escreg.approval.puya.map", text: text("Escreg.approval.puya.map") }], [other, es], now);
    expect(m.put.map((x) => x.id)).toEqual([es.id]);
  });

  it("merges a change made from an old copy onto what is stored", () => {
    const base = newSpec(escreg, undefined, undefined, now);
    const app = { hash: "H", kind: "approval" as const, appId: 7, network: "Localnet", firstSeen: now, lastSeen: now + 5 };
    const cur = { ...base, apps: [app], sources: { a: { text: "from another tab" } } };
    const mine = { ...base, maps: { approval: { name: "m", map: escregMap } }, updatedAt: now + 9 };
    const out = mergeSpec(cur, mine);
    expect(out.apps).toEqual([app]);
    expect(Object.keys(out.sources)).toEqual(["a"]);
    expect(Object.keys(out.maps)).toEqual(["approval"]);
  });

  it("keys a spec by its content, whatever the key order, and refuses one that wouldn't render", () => {
    const reordered = Object.fromEntries(Object.entries(escreg).reverse()) as typeof escreg;
    expect(specId(reordered)).toBe(specId(escreg));
    expect(isSpecJson(escreg)).toBe(true);
    expect(isSpecJson({ methods: { foo: {} } })).toBe(false);
    expect(isSpecJson({ methods: [{ name: "f", args: "x" }] })).toBe(false);
    expect(isSpecJson({ source: "x" })).toBe(false);
  });

  it("takes one map per program from one batch", () => {
    const r = addFiles(newSpec(escreg, undefined, undefined, now), [{ name: "a/Escreg.approval.puya.map", map: escregMap }, { name: "b/Escreg.approval.puya.map", map: escregMap }], [], now);
    expect(r.added).toBe(1);
    expect(r.notes.filter((n) => n.bad)).toHaveLength(1);
  });

  it("brings every app running a program up to date when the app isn't named", () => {
    const e = newSpec(escreg, undefined, undefined, now);
    const two = { ...e, apps: [1, 2].map((appId) => ({ hash: "H", kind: "approval" as const, appId, network: "Localnet", firstSeen: now, lastSeen: now })) };
    const out = noteApp(two, { hash: "H", kind: "approval", network: "Localnet" }, now + 120_000)!;
    expect(out.apps.map((a) => a.lastSeen)).toEqual([now + 120_000, now + 120_000]);
  });
});
