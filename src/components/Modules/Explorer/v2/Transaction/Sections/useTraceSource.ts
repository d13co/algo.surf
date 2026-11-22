import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { network } from "src/packages/core-sdk/constants";
import type { ProgramKind, SourceMapping } from "src/utils/arc56Source";
import { lineBpKey, parseLineBpKey, type MapFor } from "src/utils/sourceStepper";
import { noteApp, pickSpec, toRecord, type LibApp, type LibSpec } from "src/utils/specLibrary";
import { listLibrary, updateLibSpec } from "src/utils/specLibraryStore";
import type { SpecRecord } from "src/utils/specStore";
import { appPrograms, isApp } from "src/utils/traceSpecs";
import type { Frame, Program, Stepper } from "src/utils/traceStepper";

/**
 * The debugger's source view, by program hash: the spec library's specs
 * (/debug/specs) that match the trace's programs and their mappings, which
 * programs are shown as source or TEAL, and source-line breakpoints. Each
 * match is recorded on its library spec, with its app. This browser keeps
 * all of it (specs in IndexedDB, the rest in localStorage), and whether the
 * TEAL view shows the source lines beside the ops. A mapping without
 * source lines (TEAL without `// file:line` comments) still names things
 * (see SpecNames), but has no source view or source stepping.
 */

/** A program's match: the debugger's record of it, its mapping, and the library spec it came from. */
export type ProgSource = { rec: SpecRecord; map: SourceMapping; lib: LibSpec };
export type View = "ts" | "teal";

// A new key since TEAL became the default: adding a spec used to store "ts" under `trace-src-view:`, which would now read as a choice of the source view.
const viewKey = (hash: string) => `trace-view:${hash}`;
const colKey = (hash: string) => `trace-src-col:${hash}`;
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

/** The trace's app programs with a disassembly, one per hash, with every app the runs name running it (apps can share a program). */
function appProgs(T: Stepper): { hash: string; kind: ProgramKind; prog: Program; appIds: number[] }[] {
  const seen = new Map<string, { hash: string; kind: ProgramKind; prog: Program; appIds: number[] }>();
  for (const f of T.frames) {
    if (!isApp(f)) continue;
    const appId = f.appId === undefined ? undefined : Number(f.appId) || undefined;
    let had = seen.get(f.hash);
    if (!had) seen.set(f.hash, (had = { hash: f.hash, kind: f.kind, prog: f.prog, appIds: [] }));
    if (appId !== undefined && !had.appIds.includes(appId)) had.appIds.push(appId);
  }
  return [...seen.values()];
}

/** Which library specs, in which version, a run matched with: unchanged, nothing needs matching again. */
const libSig = (libs: LibSpec[]) => libs.map((l) => `${l.id}:${l.updatedAt}`).join(",");

export type TraceSource = ReturnType<typeof useTraceSource>;

export function useTraceSource(T: Stepper) {
  const [srcs, setSrcs] = useState<Map<string, ProgSource>>(() => new Map());
  const [views, setViews] = useState<Map<string, View>>(() => new Map());
  const [lineBps, setLineBps] = useState<Set<string>>(() => new Set());
  /** Programs whose TEAL view hides the source column (shown by default). */
  const [colsOff, setColsOff] = useState<Set<string>>(() => new Set());
  /** Bumped when the tab comes back into view: specs added on the Contracts & Specs page (another tab) are matched then. */
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const again = () => document.visibilityState === "visible" && setTick((t) => t + 1);
    document.addEventListener("visibilitychange", again);
    return () => document.removeEventListener("visibilitychange", again);
  }, []);
  /** The last match: its trace, the library as it was, and its results. */
  const last = useRef<{ T: Stepper; sig: string; srcs: Map<string, ProgSource> }>();

  // Budget runs arriving later rebuild T with app IDs: load again then.
  useEffect(() => {
    let live = true;
    (async () => {
      const progs = appProgs(T);
      const libs = await listLibrary(network);
      const sig = libSig(libs);
      // Back in view with the library as it was: nothing to match again, and the views keep their mappings (and scroll).
      if (last.current?.T === T && last.current.sig === sig) return;
      const prev = last.current?.srcs;
      const found = new Map<string, ProgSource>();
      const changed = new Map<string, LibSpec>();
      const notes = new Map<string, Omit<LibApp, "firstSeen" | "lastSeen">[]>();
      const now = Date.now();
      for (const p of progs) {
        const m = pickSpec(p.prog, p.kind, libs);
        if (!m) continue;
        let lib = changed.get(m.lib.id) ?? m.lib;
        for (const appId of p.appIds.length ? p.appIds : [undefined]) {
          const a = { hash: p.hash, kind: p.kind, ...(appId !== undefined && { appId }), network, ...(m.map.exact && { exact: true }) };
          const next = noteApp(lib, a, now);
          if (next) {
            lib = next;
            changed.set(next.id, next);
            notes.set(next.id, [...(notes.get(next.id) ?? []), a]);
          }
        }
        const appId = p.appIds[0];
        // The same spec, unchanged, for the same app: the mapping the views have, so they don't rebuild or scroll.
        const had = prev?.get(p.hash);
        const same = had && had.lib.id === m.lib.id && had.lib.updatedAt === m.lib.updatedAt && had.rec.appId === appId;
        found.set(p.hash, same ? had : { rec: toRecord(m, p.hash, p.kind, appId), map: m.map, lib });
      }
      // The apps each spec matched, onto the spec as stored now (not one removed meanwhile): best effort.
      for (const [id, as] of notes) {
        await updateLibSpec(id, (cur) => {
          if (!cur) return undefined;
          const out = as.reduce((x, a) => noteApp(x, a, now) ?? x, cur);
          return out === cur ? undefined : out;
        });
      }
      if (!live) return;
      last.current = { T, sig, srcs: found };
      setSrcs(found);
      setViews((prev) => new Map(progs.map((p) => [p.hash, prev.get(p.hash) ?? (readStore<View>(viewKey(p.hash)) === "ts" ? "ts" : "teal")])));
      setColsOff((prev) => new Set(progs.map((p) => p.hash).filter((h) => prev.has(h) || readStore<boolean>(colKey(h)) === false)));
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
  // TEAL (with its source lines beside it) unless the source view was chosen.
  const viewOf = useCallback((hash: string | undefined): View => (lineMap(hash) && views.get(hash!) === "ts" ? "ts" : "teal"), [lineMap, views]);
  const setView = useCallback((hash: string, v: View) => {
    writeStore(viewKey(hash), v);
    setViews((prev) => new Map(prev).set(hash, v));
  }, []);
  /** Whether the TEAL view shows a program's source lines beside its ops. */
  const colOf = useCallback((hash: string | undefined) => !!hash && !colsOff.has(hash), [colsOff]);
  const setCol = useCallback((hash: string, on: boolean) => {
    writeStore(colKey(hash), on ? undefined : false);
    setColsOff((prev) => {
      const next = new Set(prev);
      if (on) next.delete(hash);
      else next.add(hash);
      return next;
    });
  }, []);
  /** The mapping of each program shown as source. */
  const mapFor: MapFor = useCallback((hash) => (hash && views.get(hash) === "ts" ? lineMap(hash) : undefined), [lineMap, views]);

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
  return { srcs, hashes, viewOf, setView, colOf, setCol, mapFor, lineMap, lineBps, toggleLineBp, appPrograms: progsOf };
}
