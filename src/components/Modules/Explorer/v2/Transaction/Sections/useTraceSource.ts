import { useCallback, useEffect, useMemo, useState } from "react";
import { matchSpec, type ProgramKind, type SourceMapping } from "src/utils/arc56Source";
import { mergeFiles, type MapFile, type Note, type SourceFile, type Target } from "src/utils/sourceFiles";
import { lineBpKey, parseLineBpKey, type MapFor } from "src/utils/sourceStepper";
import { deleteSpec, getSpec, listSpecs, putSpec, specsForApp, type SpecRecord } from "src/utils/specStore";
import { appPrograms, isApp, matchOnApp, worthSaving, type ProgramMatch, type SpecInput } from "src/utils/traceSpecs";
import type { Frame, Program, Stepper } from "src/utils/traceStepper";

/**
 * The debugger's TypeScript view, by program hash: the ARC-56 specs saved
 * for the trace's programs and their mappings, which programs are shown as
 * TypeScript or TEAL, and source-line breakpoints. This browser keeps all
 * three (specs in IndexedDB, the rest in localStorage). A mapping without
 * source lines (TEAL without `// file:line` comments) still names things
 * (see SpecNames), but has no TypeScript view or source stepping.
 */

export type ProgSource = { rec: SpecRecord; map: SourceMapping };
export type View = "ts" | "teal";
/** A match, and whether this browser stored it (else it lasts for the page). */
export type Added = ProgramMatch & { stored?: boolean };

const viewKey = (hash: string) => `trace-src-view:${hash}`;
const lineBpStoreKey = (hash: string) => `trace-src-bp:${hash}`;

function readStore<T>(k: string): T | undefined {
  try {
    const v = localStorage.getItem(k);
    return v === null ? undefined : (JSON.parse(v) as T);
  } catch {
    return undefined;
  }
}

function writeStore(k: string, v: unknown) {
  try {
    if (v === undefined) localStorage.removeItem(k);
    else localStorage.setItem(k, JSON.stringify(v));
  } catch {
    // Storage off: kept for this page only.
  }
}

const hashesOf = (T: Stepper) => [...new Set(T.frames.map((f) => f.hash).filter((h): h is string => !!h))];

function loadLineBps(hashes: string[]): Set<string> {
  const out = new Set<string>();
  for (const h of hashes) for (const pcs of readStore<number[][]>(lineBpStoreKey(h)) ?? []) if (Array.isArray(pcs)) out.add(lineBpKey(h, pcs));
  return out;
}

function saveLineBps(hash: string, bps: Set<string>) {
  const lines = [...bps].map(parseLineBpKey).filter((b) => b.hash === hash).map((b) => b.pcs);
  writeStore(lineBpStoreKey(hash), lines.length ? lines : undefined);
}

/** The trace's app programs with a disassembly, one per hash, with their app where a run names it. */
function appProgs(T: Stepper): { hash: string; kind: ProgramKind; prog: Program; appId?: number }[] {
  const seen = new Map<string, { hash: string; kind: ProgramKind; prog: Program; appId?: number }>();
  for (const f of T.frames) {
    if (!isApp(f)) continue;
    const appId = f.appId === undefined ? undefined : Number(f.appId) || undefined;
    const had = seen.get(f.hash);
    if (!had) seen.set(f.hash, { hash: f.hash, kind: f.kind, prog: f.prog, appId });
    else if (had.appId === undefined) had.appId = appId;
  }
  return [...seen.values()];
}

export type TraceSource = ReturnType<typeof useTraceSource>;

export function useTraceSource(T: Stepper) {
  const [srcs, setSrcs] = useState<Map<string, ProgSource>>(() => new Map());
  const [views, setViews] = useState<Map<string, View>>(() => new Map());
  const [lineBps, setLineBps] = useState<Set<string>>(() => new Set());
  /** Per program hash without a spec: specs saved for an older version of its app. */
  const [older, setOlder] = useState<Map<string, SpecRecord[]>>(() => new Map());
  const [saved, setSaved] = useState<SpecRecord[]>([]);
  const [tick, setTick] = useState(0);

  // Budget runs arriving later rebuild T with app IDs: load again then.
  useEffect(() => {
    let live = true;
    (async () => {
      const progs = appProgs(T);
      const found = new Map<string, ProgSource>();
      const old = new Map<string, SpecRecord[]>();
      for (const p of progs) {
        let rec = await getSpec(p.hash);
        let m: SourceMapping | undefined;
        try {
          const r = rec ? matchSpec(p.prog, rec.arc56, rec.kind, rec.puyaMap) : undefined;
          if (r && !("mismatch" in r) && worthSaving(rec!.kind, r)) m = r;
        } catch {
          // A stored spec this version can't read: as if there were none.
        }
        if (rec && m) {
          // Added before the budget runs named its app: name it now.
          if (rec.appId === undefined && p.appId !== undefined) {
            rec = { ...rec, appId: p.appId };
            await putSpec(rec);
          }
          found.set(p.hash, { rec, map: m });
        } else if (p.appId !== undefined) {
          const recs = (await specsForApp(p.appId)).filter((r) => r.hash !== p.hash && r.kind === p.kind);
          if (recs.length) old.set(p.hash, recs);
        }
      }
      const all = await listSpecs();
      if (!live) return;
      setSrcs(found);
      setOlder(old);
      setSaved(all);
      setViews((prev) => new Map(progs.map((p) => [p.hash, prev.get(p.hash) ?? (readStore<View>(viewKey(p.hash)) === "teal" ? "teal" : "ts")])));
    })().catch(() => {
      // Storage unreadable: no specs, as before any was added.
    });
    return () => {
      live = false;
    };
  }, [T, tick]);

  // Line breakpoints, per program: again only when the programs change (not when budget runs rebuild T).
  const hashList = useMemo(() => hashesOf(T), [T]);
  const hashKey = hashList.join(" ");
  useEffect(() => setLineBps(loadLineBps(hashList)), [hashKey]);

  /** A program's mapping if it has source lines, whichever view is on. */
  const lineMap = useCallback((hash: string | undefined) => {
    const m = hash ? srcs.get(hash)?.map : undefined;
    return m?.lines.length ? m : undefined;
  }, [srcs]);
  const viewOf = useCallback((hash: string | undefined): View => (lineMap(hash) && views.get(hash!) !== "teal" ? "ts" : "teal"), [lineMap, views]);
  const setView = useCallback((hash: string, v: View) => {
    writeStore(viewKey(hash), v);
    setViews((prev) => new Map(prev).set(hash, v));
  }, []);
  /** The mapping of each program shown as TypeScript. */
  const mapFor: MapFor = useCallback((hash) => (hash && views.get(hash) !== "teal" ? lineMap(hash) : undefined), [lineMap, views]);

  const toggleLineBp = useCallback(
    (hash: string, pcs: number[]) =>
      setLineBps((prev) => {
        const next = new Set(prev);
        const k = lineBpKey(hash, pcs);
        if (next.has(k)) next.delete(k);
        else next.add(k);
        saveLineBps(hash, next);
        return next;
      }),
    [],
  );

  /**
   * Saves the matches worth saving, with the spec's source files that are
   * theirs, and shows them as TypeScript. `notes` tells about the files.
   */
  const apply = useCallback(async (ms: ProgramMatch[], spec: SpecInput): Promise<{ added: Added[]; notes: Note[] }> => {
    const added: Added[] = [];
    const addedAt = Date.now();
    const targets: Target[] = [];
    for (const m of ms) {
      if (m.save && !("mismatch" in m.result)) {
        const rec: SpecRecord = { hash: m.hash, kind: m.kind, appId: m.appId, name: spec.name, arc56: spec.arc56, puyaMap: m.puyaMap, addedAt };
        targets.push({ rec, prog: m.prog, map: m.result });
      }
    }
    let notes: Note[] = [];
    if (spec.files?.length && targets.length) {
      const r = mergeFiles(targets, [], spec.files);
      notes = r.notes;
      for (const rec of r.recs) targets.find((t) => t.rec.hash === rec.hash)!.rec = rec;
    }
    for (const m of ms) {
      const t = targets.find((x) => x.rec.hash === m.hash);
      if (!t) {
        added.push(m);
        continue;
      }
      const stored = await putSpec(t.rec);
      if (!stored && Object.keys(t.rec.sources ?? {}).length) notes.push({ text: `The ${m.kind} program's source files are kept for this page only too.`, bad: true });
      if (t.map.lines.length) {
        writeStore(viewKey(m.hash), "ts");
        setViews((prev) => new Map(prev).set(m.hash, "ts"));
      }
      added.push({ ...m, stored });
    }
    setTick((t) => t + 1);
    return { added, notes };
  }, []);

  /** Matches a spec with frame `f`'s program and its app's other one in the trace, and saves the matches. */
  const addSpec = useCallback((f: Frame, spec: SpecInput) => apply(matchOnApp(T, f, spec), spec), [T, apply]);

  /** Tries a spec saved for another version of the app; saved under this program only if it matches. */
  const tryRecord = useCallback(
    (f: Frame, rec: SpecRecord) => {
      // Its source files too, checked again against this program's spec lines.
      const files = Object.entries(rec.sources ?? {}).map(([path, text]) => ({ name: path.slice(path.lastIndexOf("/") + 1), path, text }));
      const spec: SpecInput = { name: rec.name, arc56: rec.arc56, maps: rec.puyaMap ? { [rec.kind]: rec.puyaMap } : {}, ...(files.length && { files }) };
      return apply(
        matchOnApp(T, f, spec).filter((m) => m.current),
        spec,
      );
    },
    [T, apply],
  );

  /**
   * Adds `.puya.map`s and source files to the saved specs of frame `f`'s
   * app (its program, and the other one if saved and in the trace).
   */
  const addFiles = useCallback(
    async (f: Frame, maps: MapFile[], files: SourceFile[]): Promise<Note[]> => {
      const targets: Target[] = [];
      for (const p of appPrograms(T, f)) {
        const have = srcs.get(p.hash);
        if (have) targets.push({ rec: have.rec, prog: p.prog, map: have.map });
      }
      if (!targets.length) return [{ text: "No saved spec for this program to add files to.", bad: true }];
      const { recs, notes } = mergeFiles(targets, maps, files);
      for (const rec of recs) {
        if (!(await putSpec(rec))) notes.push({ text: `The browser didn't store the ${rec.kind} program's spec: kept for this page only.`, bad: true });
      }
      if (recs.length) setTick((t) => t + 1);
      return notes;
    },
    [T, srcs],
  );

  /** Removes a spec, its view choice and its line breakpoints; false when the browser still holds it. */
  const removeSpec = useCallback(async (hash: string): Promise<boolean> => {
    if (!(await deleteSpec(hash))) return false;
    writeStore(viewKey(hash), undefined);
    writeStore(lineBpStoreKey(hash), undefined);
    setViews((prev) => {
      const next = new Map(prev);
      next.delete(hash);
      return next;
    });
    setLineBps((prev) => new Set([...prev].filter((k) => parseLineBpKey(k).hash !== hash)));
    setTick((t) => t + 1);
    return true;
  }, []);

  const hashes = useMemo(() => new Set(hashList), [hashList]);
  // A frame's programs to match a spec with, worked out once per run.
  const progsOf = useMemo(() => {
    const cache = new Map<number, ReturnType<typeof appPrograms>>();
    return (f: Frame) => {
      let r = cache.get(f.id);
      if (!r) cache.set(f.id, (r = appPrograms(T, f)));
      return r;
    };
  }, [T]);
  return { srcs, older, saved, hashes, viewOf, setView, mapFor, lineMap, lineBps, toggleLineBp, addSpec, tryRecord, addFiles, removeSpec, appPrograms: progsOf };
}
