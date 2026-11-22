import type { ProgramKind, SourceMapping, Mismatch } from "./arc56Source";
import { isSourceName, suffixLength } from "./sourceFiles";
import type { Frame, Program, Stepper } from "./traceStepper";

/**
 * A trace's app programs, which spec matches are worth keeping, and finding
 * a folder's ARC-56 specs, their `.puya.map`s and source files (for the
 * contracts page, /debug/contracts).
 */

/** A file as read for the debugger: its name, its path in a chosen folder, its text. */
export type ReadFile = { name: string; path?: string; text: string };

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
 * Whether a match is worth using: any approval program match (TEAL without
 * `// file:line` comments, from Puya at debug level 0 or other compilers,
 * gives no source view but still names methods, keys and failures), and a
 * clear program match only with source lines: Puya's default clear program
 * is many apps', and names little.
 */
export const worthSaving = (kind: ProgramKind, r: SourceMapping | Mismatch) => !("mismatch" in r) && (r.lines.length > 0 || kind === "approval");

/** Which program a `.puya.map` maps, from its file name (`X.approval.puya.map`, `X.clear.puya.map`); undefined for neither. */
export function mapKind(name: string): ProgramKind | undefined {
  if (/\.clear\.puya\.map$/i.test(name)) return "clear";
  if (/\.approval\.puya\.map$/i.test(name)) return "approval";
  return undefined;
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
