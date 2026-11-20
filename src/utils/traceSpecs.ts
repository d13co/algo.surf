import type { Arc56Contract } from "@algorandfoundation/algokit-utils/types/app-arc56";
import { matchSpec, type Mismatch, type ProgramKind, type PuyaMap, type SourceMapping } from "./arc56Source";
import { isSourceName, specSourcePaths, suffixLength, type MapFile, type SourceFile } from "./sourceFiles";
import type { Frame, Program, Stepper } from "./traceStepper";

/**
 * Matching an ARC-56 spec someone adds on the debugger with the programs of
 * the trace: the program it was added on, and the same app's other program
 * (approval or clear) when the trace has a run of it.
 */

/**
 * A spec and the `.puya.map`s that came with it, by the program they map
 * (from their names); `unplaced` is a map whose name says neither, tried with
 * both programs. `files`: source files that came with it.
 */
export type SpecInput = { name: string; arc56: Arc56Contract; maps: Partial<Record<ProgramKind, PuyaMap>>; unplaced?: PuyaMap; files?: SourceFile[] };

/** A file as read for the debugger: its name, its path in a chosen folder, its text. */
export type ReadFile = { name: string; path?: string; text: string };

export type ProgramMatch = {
  hash: string;
  kind: ProgramKind;
  appId?: number;
  prog: Program;
  result: SourceMapping | Mismatch;
  /**
   * Worth saving: any approval program match (TEAL without `// file:line`
   * comments, from Puya at debug level 0 or other compilers, gives no
   * source view but still names methods, keys and failures), and a clear
   * program match only with source lines: Puya's default clear program is
   * many apps', and names little.
   */
  save: boolean;
  /** The `.puya.map` that fits this program, to save with it. */
  puyaMap?: PuyaMap;
  /** The program it was added on. */
  current: boolean;
};

const appNum = (f: Frame) => (f.appId === undefined ? undefined : Number(f.appId) || undefined);
/** A run of an app program whose disassembly is known: one a spec can be matched with. */
export const isApp = (f: Frame): f is Frame & { kind: ProgramKind; hash: string; prog: Program } =>
  (f.kind === "approval" || f.kind === "clear") && !!f.hash && !!f.prog && !f.prog.synthetic;

/** `f`'s program, then its app's other program if a run in the trace has it. */
export function appPrograms(T: Stepper, f: Frame): { hash: string; kind: ProgramKind; prog: Program; appId?: number; current: boolean }[] {
  if (!isApp(f)) return [];
  const appId = appNum(f);
  const out = [{ hash: f.hash, kind: f.kind, prog: f.prog, appId, current: true }];
  const other = appId === undefined ? undefined : T.frames.find((g) => isApp(g) && g.kind !== f.kind && appNum(g) === appId && g.hash !== f.hash);
  if (other && isApp(other)) out.push({ hash: other.hash, kind: other.kind, prog: other.prog, appId, current: false });
  return out;
}

/**
 * The trace's other apps: a run of each app that isn't `f`'s, one per app
 * (an app's approval and clear programs are one; apps running the same
 * program are one too, as specs are saved by program), in trace order. Inner
 * calls, and the group's other app calls. An app is its approval
 * program's first run where the trace has one: a clear program alone
 * (Puya's default one has no source lines) doesn't save a spec.
 */
export function otherApps(T: Stepper, f: Frame): Frame[] {
  const seen = new Set(appPrograms(T, f).map((p) => p.hash));
  const out: Frame[] = [];
  for (const g of T.frames) {
    if (!isApp(g) || seen.has(g.hash)) continue;
    const progs = appPrograms(T, g);
    for (const p of progs) seen.add(p.hash);
    const approval = g.kind === "clear" ? progs.find((p) => p.kind === "approval") : undefined;
    out.push((approval && T.frames.find((h) => isApp(h) && h.hash === approval.hash)) || g);
  }
  return out;
}

/** Whether a match is kept: see ProgramMatch's `save`. */
export const worthSaving = (kind: ProgramKind, r: SourceMapping | Mismatch) => !("mismatch" in r) && (r.lines.length > 0 || kind === "approval");

/** Matches a spec with `f`'s program and its app's other one in the trace. */
export function matchOnApp(T: Stepper, f: Frame, spec: SpecInput): ProgramMatch[] {
  return appPrograms(T, f).map((p) => {
    const given = spec.maps[p.kind];
    const map = given ?? spec.unplaced;
    const result = matchSpec(p.prog, spec.arc56, p.kind, map);
    let puyaMap: PuyaMap | undefined;
    if (!("mismatch" in result) && map) {
      if (!result.mapMismatch) puyaMap = map;
      // A map not named for this program: no news that it doesn't fit it.
      else if (!given) delete result.mapMismatch;
    }
    const save = worthSaving(p.kind, result);
    return { ...p, result, save, puyaMap };
  });
}

/** Which program a `.puya.map` maps, from its file name (`X.approval.puya.map`, `X.clear.puya.map`); undefined for neither. */
export function mapKind(name: string): ProgramKind | undefined {
  if (/\.clear\.puya\.map$/i.test(name)) return "clear";
  if (/\.approval\.puya\.map$/i.test(name)) return "approval";
  return undefined;
}

/**
 * Reads dropped or pasted files: the ARC-56 spec (JSON with `methods`,
 * `source` or `byteCode`), `.puya.map`s (JSON with `pc_events`) and source
 * files (any other file with an extension, as `contract.algo.ts`).
 * Unreadable files are reported in `errors`, and so are two specs, or two
 * maps for one program: then no spec is given.
 */
export function readSpecFiles(files: ReadFile[]): { spec?: SpecInput; errors: string[] } {
  const errors: string[] = [];
  const specs: { name: string; arc56: Arc56Contract }[] = [];
  const maps: Record<"approval" | "clear" | "unplaced", { name: string; map: PuyaMap }[]> = { approval: [], clear: [], unplaced: [] };
  const sources: SourceFile[] = [];
  for (const { name, path, text } of files) {
    if (isSourceName(name)) {
      sources.push({ name, ...(path && { path }), text });
      continue;
    }
    let j: unknown;
    try {
      j = JSON.parse(text);
    } catch {
      errors.push(/\.(json|map)$/i.test(name) || !/\.\w+$/.test(name) ? `${name}: not JSON` : `${name}: not an ARC-56 spec, a .puya.map or a source file (.ts, .py)`);
      continue;
    }
    const o = j as Record<string, unknown> | null;
    if (!o || typeof o !== "object" || Array.isArray(o)) errors.push(`${name}: not an ARC-56 spec or a .puya.map`);
    else if ("pc_events" in o) maps[mapKind(name) ?? "unplaced"].push({ name, map: o as unknown as PuyaMap });
    else if ("methods" in o || "source" in o || "byteCode" in o) specs.push({ name, arc56: o as unknown as Arc56Contract });
    else errors.push(`${name}: not an ARC-56 spec or a .puya.map`);
  }
  const names = (xs: { name: string }[]) => xs.map((x) => x.name).join(", ");
  let clash = false;
  if (specs.length > 1) {
    errors.push(`${specs.length} ARC-56 specs given (${names(specs)}): add one at a time`);
    clash = true;
  }
  for (const k of ["approval", "clear"] as const) {
    if (maps[k].length > 1) {
      errors.push(`${maps[k].length} .puya.maps for the ${k} program (${names(maps[k])}): give one`);
      clash = true;
    }
  }
  if (maps.unplaced.length > 1) {
    errors.push(`${maps.unplaced.length} .puya.maps whose names don't say approval or clear (${names(maps.unplaced)}): name them X.approval.puya.map and X.clear.puya.map`);
    clash = true;
  }
  if (clash) return { errors };
  const spec = specs[0];
  if (!spec) {
    if (!errors.length) {
      errors.push(
        maps.approval.length + maps.clear.length + maps.unplaced.length
          ? "a .puya.map needs its ARC-56 spec (*.arc56.json) with it"
          : sources.length
            ? "source files need their ARC-56 spec (*.arc56.json) with them"
            : "no ARC-56 spec given",
      );
    }
    return { errors };
  }
  return {
    spec: {
      name: spec.arc56.name || spec.name.replace(/\.arc56\.json$|\.json$/i, "") || "spec",
      arc56: spec.arc56,
      maps: { ...(maps.approval[0] && { approval: maps.approval[0].map }), ...(maps.clear[0] && { clear: maps.clear[0].map }) },
      unplaced: maps.unplaced[0]?.map,
      ...(sources.length && { files: sources }),
    },
    errors,
  };
}

/**
 * Reads files added to a saved spec: `.puya.map`s and source files. Two maps
 * for one program are refused, as readSpecFiles does. A spec among them is
 * skipped if it is a saved one (`saved`), else refused (remove the saved
 * one to replace it), and so is any other file.
 */
export function readAddedFiles(files: ReadFile[], saved: Arc56Contract[] = []): { maps: MapFile[]; files: SourceFile[]; errors: string[] } {
  const out: { maps: MapFile[]; files: SourceFile[]; errors: string[] } = { maps: [], files: [], errors: [] };
  const same = new Set(saved.map((a) => JSON.stringify(a)));
  for (const { name, path, text } of files) {
    if (isSourceName(name)) {
      out.files.push({ name, ...(path && { path }), text });
      continue;
    }
    let o: Record<string, unknown> | null = null;
    try {
      o = JSON.parse(text);
    } catch {
      out.errors.push(`${name}: not a .puya.map or a source file (.ts, .py)`);
      continue;
    }
    if (o && typeof o === "object" && !Array.isArray(o) && "pc_events" in o) out.maps.push({ name, kind: mapKind(name), map: o as unknown as PuyaMap });
    else if (o && typeof o === "object" && ("methods" in o || "source" in o || "byteCode" in o)) {
      if (!same.has(JSON.stringify(o))) out.errors.push(`${name}: a different ARC-56 spec; to replace the saved one, remove it first (specs…)`);
    } else out.errors.push(`${name}: not a .puya.map or a source file (.ts, .py)`);
  }
  for (const k of ["approval", "clear", undefined] as const) {
    const ms = out.maps.filter((m) => m.kind === k);
    if (ms.length < 2) continue;
    out.errors.push(
      k
        ? `${ms.length} .puya.maps for the ${k} program (${ms.map((m) => m.name).join(", ")}): give one`
        : `${ms.length} .puya.maps whose names don't say approval or clear (${ms.map((m) => m.name).join(", ")}): name them X.approval.puya.map and X.clear.puya.map`,
    );
    out.maps = out.maps.filter((m) => m.kind !== k);
  }
  return out;
}

/** A file in a chosen folder, before it is read: its name and its path there. */
export type FolderFile = { name: string; path: string };

const inNodeModules = (path: string) => /(^|\/)node_modules\//.test(path);
const dirOf = (path: string) => path.slice(0, path.lastIndexOf("/") + 1);

/**
 * A chosen folder's ARC-56 specs (`X.arc56.json`, not under node_modules),
 * shallowest first, each with the `.puya.map`s beside it named for it
 * (`X.approval.puya.map`, `X.clear.puya.map`, `X.puya.map`).
 */
export function folderSpecs<F extends FolderFile>(files: F[]): { spec: F; maps: F[] }[] {
  const kept = files.filter((f) => !inNodeModules(f.path));
  const depth = (p: string) => p.split("/").length;
  return kept
    .filter((f) => /\.arc56\.json$/i.test(f.name))
    .map((spec) => {
      const stem = spec.name.replace(/\.arc56\.json$/i, "").toLowerCase();
      const names = [`${stem}.approval.puya.map`, `${stem}.clear.puya.map`, `${stem}.puya.map`];
      const d = dirOf(spec.path);
      return { spec, maps: kept.filter((m) => dirOf(m.path) === d && names.includes(m.name.toLowerCase())) };
    })
    .sort((a, b) => depth(a.spec.path) - depth(b.spec.path));
}

// A path's segment count as suffixLength reads it (backslashes as slashes, `.` and `..` dropped), so the two compare.
const segCount = (p: string) => suffixLength(p, p);

/**
 * A chosen folder's source files (not under node_modules) at one of a
 * spec's source `paths`: a spec path ends with the file's path below the
 * chosen folder (`smart_contracts/escreg/contract.algo.ts` ends with
 * `escreg/contract.algo.ts`), or the file's path ends with a spec path.
 * Another contract's `contract.algo.ts` elsewhere in the folder isn't.
 */
export function folderSources<F extends FolderFile>(files: F[], paths: string[]): F[] {
  return files.filter((f) => {
    if (!isSourceName(f.name) || inNodeModules(f.path)) return false;
    const rel = f.path.slice(f.path.indexOf("/") + 1);
    return paths.some((p) => suffixLength(p, rel) === segCount(rel) || suffixLength(p, f.path) === segCount(p));
  });
}

/**
 * Of a folder's specs, the one that fits a program best (see fitsBetter),
 * by `match`ing each with it (and its app's other program), and the source
 * paths of the matches it saves. None when no spec saves for the program.
 */
export function bestFit<C extends { path: string; spec: SpecInput }>(cands: C[], match: (spec: SpecInput) => ProgramMatch[]): { cand: C; paths: string[]; fit: FolderFit } | undefined {
  let best: { cand: C; paths: string[]; fit: FolderFit } | undefined;
  for (const c of cands) {
    const ms = match(c.spec);
    const cur = ms.find((m) => m.current);
    if (!cur?.save || "mismatch" in cur.result) continue;
    const fit: FolderFit = {
      exact: !!cur.result.exact,
      programs: ms.filter((m) => m.save && !("mismatch" in m.result)).length,
      map: !!cur.puyaMap,
      depth: c.path.split("/").length,
    };
    if (fitsBetter(fit, best?.fit)) best = { cand: c, paths: ms.flatMap((m) => (!m.save || "mismatch" in m.result ? [] : specSourcePaths(m.result.lines, m.puyaMap))), fit };
  }
  return best;
}

/** How well a folder's spec fits a program: see fitsBetter. */
export type FolderFit = { exact: boolean; programs: number; map: boolean; depth: number };

/**
 * Whether fit `a` beats `b`: an exact (bytecode) match first, then more of
 * the app's programs in the trace matched, then a .puya.map that fits the
 * program, then the shallower spec. A copy of the spec without its maps
 * loses to the build output that has them.
 */
export function fitsBetter(a: FolderFit, b: FolderFit | undefined): boolean {
  if (!b) return true;
  if (a.exact !== b.exact) return a.exact;
  if (a.programs !== b.programs) return a.programs > b.programs;
  if (a.map !== b.map) return a.map;
  return a.depth < b.depth;
}
