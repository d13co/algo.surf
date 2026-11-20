import type { Arc56Contract } from "@algorandfoundation/algokit-utils/types/app-arc56";
import { matchSpec, type Mismatch, type ProgramKind, type PuyaMap, type SourceMapping } from "./arc56Source";
import { isSourceName, type MapFile, type SourceFile } from "./sourceFiles";
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
   * TypeScript view but still names methods, keys and failures), and a clear
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
