import type { Arc56Contract } from "@algorandfoundation/algokit-utils/types/app-arc56";
import { sha512_256 } from "js-sha512";
import { isTealscript, matchSpec, parseTeal, sourceLang, specTeal, type ProgramKind, type PuyaMap, type SourceMapping, type SrcLine } from "./arc56Source";
import { isSourceName, matchSourceFiles, specSourcePaths, suffixLength, type Note, type SourceFile } from "./sourceFiles";
import type { SpecRecord } from "./specStore";
import { folderSources, folderSpecs, mapKind, worthSaving, type FolderFile, type ReadFile } from "./traceSpecs";
import type { Program } from "./traceStepper";

/**
 * The spec library (/debug/contracts): ARC-56 specs added on their own, before
 * any trace, with their `.puya.map`s and source files, and the apps each
 * matched in the debugger. A spec is kept by its JSON's hash; the debugger
 * matches the library's specs with a trace's programs and records each
 * match's app on the spec.
 */

/** Where a `.puya.map` goes: the program its name says, or `unplaced` when it says neither. */
export type MapSlot = ProgramKind | "unplaced";
export type LibMap = { name: string; map: PuyaMap };
/** A source file, under its path in the spec's TEAL; `path`: where it was read from. */
export type LibSource = { path?: string; text: string };
/** An app program the spec matched in the debugger. */
export type LibApp = { hash: string; kind: ProgramKind; appId?: number; network: string; exact?: boolean; firstSeen: number; lastSeen: number };

export type LibSpec = {
  /** SHA-512/256 (hex) of the spec's JSON. */
  id: string;
  name: string;
  /** The file it was read from, and its path in a chosen folder. */
  file?: string;
  from?: string;
  arc56: Arc56Contract;
  maps: Partial<Record<MapSlot, LibMap>>;
  /** By path in the spec's TEAL. */
  sources: Record<string, LibSource>;
  apps: LibApp[];
  addedAt: number;
  updatedAt: number;
};

/** JSON with object keys sorted: the same spec written by another tool (key order, spacing) is the same text. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? "null" : canonical(x))).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}

export const specId = (arc56: Arc56Contract) => sha512_256(canonical(arc56));

const isObj = (o: unknown): o is Record<string, unknown> => !!o && typeof o === "object" && !Array.isArray(o);

/**
 * An ARC-56 spec, as far as the page and the debugger read one: `methods`,
 * `source` or `byteCode`, each of the right shape where given (methods
 * with names and argument lists), so a stored spec always renders.
 */
export const isSpecJson = (o: unknown): o is Arc56Contract => {
  if (!isObj(o) || "pc_events" in o || !("methods" in o || "source" in o || "byteCode" in o)) return false;
  const methodsOk = !("methods" in o) || (Array.isArray(o.methods) && o.methods.every((m) => isObj(m) && typeof m.name === "string" && (m.args === undefined || Array.isArray(m.args))));
  const objOk = (k: string) => !(k in o) || isObj(o[k]);
  return methodsOk && objOk("source") && objOk("byteCode") && objOk("state");
};
export const isMapJson = (o: unknown): o is PuyaMap => !!o && typeof o === "object" && !Array.isArray(o) && "pc_events" in o;

export function newSpec(arc56: Arc56Contract, file: string | undefined, from: string | undefined, now: number): LibSpec {
  const name = arc56.name || file?.replace(/\.arc56\.json$|\.json$/i, "") || "spec";
  return { id: specId(arc56), name, ...(file && { file }), ...(from && { from }), arc56, maps: {}, sources: {}, apps: [], addedAt: now, updatedAt: now };
}

const KINDS: ProgramKind[] = ["approval", "clear"];

/**
 * The source lines the spec's TEAL quotes, both programs', one per file and
 * line (no pcs: no program to pair with). TEALScript's quote part of a line
 * (`part`), as matchSpec marks them, so a file is checked for the part only.
 */
export function specLines(arc56: Arc56Contract): SrcLine[] {
  const seen = new Map<string, SrcLine>();
  for (const kind of KINDS) {
    const teal = specTeal(arc56, kind);
    if (!teal) continue;
    const part = isTealscript(teal);
    for (const o of parseTeal(teal)) {
      if (!o.loc) continue;
      const k = `${o.loc.file}:${o.loc.line}`;
      if (!seen.has(k)) seen.set(k, { ...o.loc, ...(part && { part: true }), pcs: [] });
    }
  }
  return [...seen.values()];
}

/** The spec's source paths: its TEAL's `// file:line` comments', then its maps' `sources` not among them. */
export function libPaths(spec: Pick<LibSpec, "arc56" | "maps">, lines = specLines(spec.arc56)): string[] {
  const out = specSourcePaths(lines);
  for (const m of Object.values(spec.maps)) for (const p of specSourcePaths(lines, m?.map)) if (!out.includes(p)) out.push(p);
  return out;
}

/** The spec's source language as the debugger names it (`TypeScript`, `Python`, `TEALScript`), or none without source lines. */
export function specLang(arc56: Arc56Contract): string | undefined {
  const lines = specLines(arc56);
  if (!lines.length) return undefined;
  return sourceLang({ lines, tealscript: isTealscript(specTeal(arc56, "approval") ?? "") });
}

export function compilerLabel(arc56: Arc56Contract): string | undefined {
  const ci = arc56.compilerInfo;
  if (!ci?.compiler) return undefined;
  const v = ci.compilerVersion;
  return v ? `${ci.compiler} ${v.major}.${v.minor}.${v.patch}` : ci.compiler;
}

const opCount = (teal: string | undefined) => (teal ? parseTeal(teal).length : 0);
const mapOps = (map: PuyaMap) => Object.keys(map.pc_events ?? {}).length;

/**
 * Whether a `.puya.map` fits the spec, by op count (the debugger checks
 * each op against the program): `kind` is the program it fits, for an
 * unplaced map the first of the two that does.
 */
export function mapFit(arc56: Arc56Contract, slot: MapSlot, map: PuyaMap): { kind?: ProgramKind; ok: boolean; text: string } {
  const n = mapOps(map);
  const kinds = slot === "unplaced" ? KINDS : [slot];
  for (const kind of kinds) if (opCount(specTeal(arc56, kind)) === n && n > 0) return { kind, ok: true, text: `fits the ${kind} program (${n} ops)` };
  if (slot !== "unplaced" && !specTeal(arc56, slot)) return { ok: false, text: `the spec has no ${slot} program TEAL to check it with` };
  const theirs = kinds.map((k) => `${k} ${opCount(specTeal(arc56, k))}`).join(", ");
  return { ok: false, text: `${n} ops, the spec's TEAL has ${theirs}: likely another build` };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const list = (xs: string[]) => (xs.length < 3 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const shown = (f: SourceFile) => f.path || f.name;

/**
 * Adds `.puya.map`s and source files to a spec. A map goes in the slot of
 * the program it fits (by op count), replacing one there; a map that fits
 * neither is left out. A source file goes under the spec path it is (see
 * matchSourceFiles); one the spec has already is kept unless `replace`
 * (the spec was chosen for these files). Gives the spec (a copy) and what
 * to tell.
 */
export function addFiles(spec: LibSpec, maps: LibMap[], files: SourceFile[], now: number, replace = false): { spec: LibSpec; notes: Note[]; added: number } {
  const out: LibSpec = { ...spec, maps: { ...spec.maps }, sources: { ...spec.sources }, updatedAt: now };
  const notes: Note[] = [];
  let added = 0;
  const filled = new Set<ProgramKind>();
  for (const m of maps) {
    const named: MapSlot = mapKind(m.name) ?? "unplaced";
    const fit = mapFit(out.arc56, named, m.map);
    if (!fit.ok || !fit.kind) {
      notes.push({ text: `${m.name} doesn't fit ${spec.name}: ${fit.text}. Not added.`, bad: true });
      continue;
    }
    if (filled.has(fit.kind)) {
      notes.push({ text: `${m.name}: another map given for ${spec.name}'s ${fit.kind} program is used. Give one at a time.`, bad: true });
      continue;
    }
    filled.add(fit.kind);
    out.maps[fit.kind] = m;
    if (named === "unplaced") delete out.maps.unplaced;
    added++;
    notes.push({ text: `${m.name} ${fit.text} of ${spec.name}.` });
  }
  if (files.length) {
    const lines = specLines(out.arc56);
    const paths = libPaths(out, lines);
    if (!paths.length) notes.push({ text: `${spec.name}: its TEAL names no source files (no \`// file:line\` comments), so ${list(files.map(shown))} can't be shown. Not added.`, bad: true });
    else {
      const r = matchSourceFiles(paths, lines, files);
      for (const { file, path, differs } of r.matched) {
        if (out.sources[path] && !replace) {
          if (out.sources[path].text !== file.text) notes.push({ text: `${spec.name} has ${path} already: kept it. To replace it, use "Add files" on ${spec.name}.`, info: true });
          continue;
        }
        out.sources[path] = { ...(file.path && { path: file.path }), text: file.text };
        added++;
        if (differs) {
          notes.push({
            text: `${shown(file)} differs from ${spec.name}'s build at line ${differs.line}: the spec has “${differs.spec}”, the file “${differs.file}”${differs.more ? ` (and ${plural(differs.more, "more line")})` : ""}. Added anyway; it may not be the code that ran.`,
            bad: true,
          });
        }
      }
      for (const a of r.ambiguous) notes.push({ text: `${shown(a.file)} could be ${list(a.paths)}: add its folder instead, so its path tells which.`, bad: true });
      if (r.unrelated.length) notes.push({ text: `Ignored ${list(r.unrelated.map(shown))}: not among ${spec.name}'s source files.`, info: true });
    }
  }
  return { spec: out, notes, added };
}

/** Whether a source file is one of the spec's: a path of its TEAL, with every line the TEAL quotes from it. */
export function sourceFits(spec: LibSpec, f: SourceFile): boolean {
  const lines = specLines(spec.arc56);
  const r = matchSourceFiles(libPaths(spec, lines), lines, [f]);
  return r.matched.length === 1 && !r.matched[0].differs;
}

/** The spec's source paths without a file. */
export const missingSources = (spec: LibSpec) => libPaths(spec).filter((p) => !spec.sources[p]);

/** A saved spec with the incoming copy's maps and source files it lacks: none replaced. */
export function fillMissing(saved: LibSpec, incoming: LibSpec, now: number): { spec: LibSpec; added: number } {
  const out: LibSpec = { ...saved, maps: { ...saved.maps }, sources: { ...saved.sources } };
  let added = 0;
  for (const [k, v] of Object.entries(incoming.maps) as [MapSlot, LibMap][]) if (!out.maps[k]) ((out.maps[k] = v), added++);
  for (const [k, v] of Object.entries(incoming.sources)) if (!out.sources[k]) ((out.sources[k] = v), added++);
  if (added) out.updatedAt = now;
  return { spec: out, added };
}

/** An app entry's identity: its network, program and app. */
export const appKey = (a: LibApp) => `${a.network}:${a.hash}:${a.appId ?? ""}`;

/**
 * A spec changed from a copy read earlier (`mine`), onto what is stored now
 * (`cur`): its maps and source files win, those added since are kept, and
 * the apps are both copies', the later sighting of each.
 */
export function mergeSpec(cur: LibSpec, mine: LibSpec): LibSpec {
  const apps = new Map<string, LibApp>();
  for (const a of [...cur.apps, ...mine.apps]) {
    const had = apps.get(appKey(a));
    if (!had || a.lastSeen > had.lastSeen) apps.set(appKey(a), had ? { ...a, firstSeen: Math.min(a.firstSeen, had.firstSeen) } : a);
  }
  return { ...mine, maps: { ...cur.maps, ...mine.maps }, sources: { ...cur.sources, ...mine.sources }, apps: [...apps.values()], updatedAt: Math.max(cur.updatedAt, mine.updatedAt) };
}

/** Specs to save and what to tell, from adding files or a folder. */
export type ImportResult = { put: LibSpec[]; notes: Note[] };

/** ` with 2 .puya.maps and 1 source file`, or nothing. */
function withFiles(s: LibSpec): string {
  const m = Object.keys(s.maps).length;
  const f = Object.keys(s.sources).length;
  const t = [m && plural(m, ".puya.map"), f && plural(f, "source file")].filter(Boolean).join(" and ");
  return t ? ` with ${t}` : "";
}

/** Keeps a spec read from files: new, or filling a saved copy; `put` gets what to save. */
function keep(spec: LibSpec, saved: LibSpec[], res: ImportResult, now: number) {
  const had = saved.find((s) => s.id === spec.id) ?? res.put.find((s) => s.id === spec.id);
  if (had) {
    const r = fillMissing(had, spec, now);
    if (r.added) {
      res.put = [...res.put.filter((s) => s.id !== had.id), r.spec];
      res.notes.push({ text: `${had.name}: already saved; added ${plural(r.added, "file")} it lacked.` });
    } else res.notes.push({ text: `${had.name}: already saved${withFiles(had)}.`, info: true });
    return;
  }
  res.put.push(spec);
  const twin = saved.find((s) => s.name.toLowerCase() === spec.name.toLowerCase());
  res.notes.push({ text: `${spec.name}: added${withFiles(spec)}${spec.from && spec.from !== spec.file && !/^https?:\/\//.test(spec.from) ? ` from ${spec.from}` : ""}.${twin ? " Another version with this name is saved too; both are kept." : ""}` });
  const missing = missingSources(spec);
  if (missing.length && Object.keys(spec.sources).length) res.notes.push({ text: `${spec.name}: still missing ${list(missing)}.`, info: true });
}

/** A file in a chosen folder, readable. */
export type FolderEntry = FolderFile & { read: () => Promise<string> };

const parse = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

/** Where a folder's specs are taken from, and what to say they came from. */
export type FolderOpts = {
  /** A path in the folder (a subfolder or a spec): only specs there are taken. Maps and source files are still found anywhere in the folder. */
  scope?: string;
  /** What a spec, by its path, is said to be added from; default its path. */
  from?: (path: string) => string;
  /** The folder's name in notes; default its first path segment. */
  label?: string;
};

const under = (path: string, scope: string) => path === scope || path.startsWith(`${scope.replace(/\/+$/, "")}/`);

/**
 * A project or build output folder: each `X.arc56.json` (not under
 * node_modules) with the `.puya.map`s beside it named for it and the
 * folder's source files at its paths. Only those files are read.
 */
export async function importFolder(files: FolderEntry[], saved: LibSpec[], now: number, opts: FolderOpts = {}): Promise<ImportResult> {
  const res: ImportResult = { put: [], notes: [] };
  const folder = opts.label ?? (files[0]?.path.split("/")[0] || "The folder");
  const { scope } = opts;
  const all = folderSpecs(files).filter((c) => !scope || under(c.spec.path, scope));
  if (!all.length) {
    const text = scope && /\.json$/i.test(scope)
      ? `${folder}: not an ARC-56 spec. Link to a file named X.arc56.json, or to the folder that holds it.`
      : `${folder} has no ARC-56 spec (*.arc56.json) outside node_modules. Build output folders such as artifacts/ hold them${opts.label ? "; build output that isn't committed can be added from a local build instead" : ""}.`;
    res.notes.push({ text, bad: true });
    return res;
  }
  for (const c of all) {
    const arc56 = parse(await c.spec.read());
    if (!isSpecJson(arc56)) {
      res.notes.push({ text: `${c.spec.path}: not an ARC-56 spec.`, bad: true });
      continue;
    }
    const maps: LibMap[] = [];
    for (const m of c.maps) {
      const map = parse(await m.read());
      if (isMapJson(map)) maps.push({ name: m.name, map });
      else res.notes.push({ text: `${m.path}: not a .puya.map.`, bad: true });
    }
    let spec = newSpec(arc56, c.spec.name, opts.from ? opts.from(c.spec.path) : c.spec.path, now);
    // The maps first: their `sources` add to the spec's paths.
    const withMaps = addFiles(spec, maps, [], now);
    spec = withMaps.spec;
    res.notes.push(...withMaps.notes.filter((n) => n.bad));
    const paths = libPaths(spec);
    const sources = await Promise.all(folderSources(files, paths).map(async (f) => ({ name: f.name, path: f.path, text: await f.read() })));
    const r = addFiles(spec, [], sources, now);
    res.notes.push(...r.notes.filter((n) => n.bad));
    keep(r.spec, saved, res, now);
  }
  return res;
}

const stemOfMap = (name: string) => name.replace(/(\.(approval|clear))?\.puya\.map$/i, "").toLowerCase();
const stemsOf = (s: LibSpec) => [s.file?.replace(/\.arc56\.json$|\.json$/i, ""), s.arc56.name, s.name].filter((x): x is string => !!x).map((x) => x.toLowerCase());

/**
 * Loose files: ARC-56 specs, `.puya.map`s and source files. A map goes with
 * the spec named as it is (`X.approval.puya.map` with `X.arc56.json` or a
 * spec named X), among the files given and then the saved specs, or with
 * the only spec given. A source file goes with the specs given, else the
 * saved specs whose TEAL names its file. `target`: all go to this spec.
 */
export function importFiles(files: ReadFile[], saved: LibSpec[], now: number, target?: LibSpec): ImportResult {
  const res: ImportResult = { put: [], notes: [] };
  const batch: LibSpec[] = [];
  const maps: LibMap[] = [];
  const sources: SourceFile[] = [];
  for (const f of files) {
    if (isSourceName(f.name)) {
      sources.push(f);
      continue;
    }
    const o = parse(f.text);
    if (o === undefined) res.notes.push({ text: `${f.name}: not JSON. Add an ARC-56 spec (*.arc56.json), a .puya.map or a source file (.ts, .py).`, bad: true });
    else if (isMapJson(o)) maps.push({ name: f.name, map: o });
    else if (isSpecJson(o)) {
      if (!target) batch.push(newSpec(o, f.name, f.path, now));
      else if (specId(o) !== target.id) res.notes.push({ text: `${f.name}: a different ARC-56 spec than ${target.name}. Add it with "ARC-56 spec".`, bad: true });
    } else res.notes.push({ text: `${f.name}: not an ARC-56 spec or a .puya.map.`, bad: true });
  }
  // Specs given come before saved ones; a saved spec given again is the one given (its files fill the saved copy, see keep).
  const given = new Set(batch.map((x) => x.id));
  const pool = target ? [target] : [...batch, ...saved.filter((x) => !given.has(x.id))];
  const gets = new Map<LibSpec, { maps: LibMap[]; files: SourceFile[] }>();
  const to = (s: LibSpec) => gets.get(s) ?? (gets.set(s, { maps: [], files: [] }), gets.get(s)!);
  for (const m of maps) {
    if (target) {
      to(target).maps.push(m);
      continue;
    }
    const stem = stemOfMap(m.name);
    const named = pool.filter((x) => stemsOf(x).includes(stem));
    const slot: MapSlot = mapKind(m.name) ?? "unplaced";
    // Of the specs of its name (versions of one contract), one it fits; else the only spec given.
    const s = named.find((x) => mapFit(x.arc56, slot, m.map).ok) ?? named[0] ?? (batch.length === 1 ? batch[0] : undefined);
    if (s) to(s).maps.push(m);
    else res.notes.push({ text: `${m.name}: no spec named ${stem}. Add its ARC-56 spec with it, or use "Add files" on the spec it belongs to.`, bad: true });
  }
  for (const f of sources) {
    if (target) {
      to(target).files.push(f);
      continue;
    }
    // The specs that name the file, and of those the ones whose quoted lines it has.
    const naming = pool.filter((x) => libPaths(x).some((p) => suffixLength(p, f.path || f.name) > 0));
    const fits = naming.filter((x) => sourceFits(x, f));
    const takers = fits.length ? fits : batch.length === 1 && naming.includes(batch[0]) ? [batch[0]] : [];
    if (takers.length) for (const s of takers) to(s).files.push(f);
    else if (naming.length) res.notes.push({ text: `${shown(f)} doesn't have the lines ${list(naming.map((x) => x.name))}'s TEAL quotes from it: not added. To add it anyway, use "Add files" on the spec.`, bad: true });
    else res.notes.push({ text: `${shown(f)}: no saved spec's TEAL names this file.`, bad: true });
  }
  for (const s of pool) {
    const g = gets.get(s);
    const isNew = batch.includes(s);
    if (!g && !isNew) continue;
    const r = g ? addFiles(s, g.maps, g.files, now, !!target) : { spec: s, notes: [], added: 0 };
    if (isNew) {
      res.notes.push(...r.notes.filter((n) => n.bad));
      keep(r.spec, saved, res, now);
    } else {
      res.notes.push(...r.notes);
      if (r.added) res.put.push(r.spec);
    }
  }
  if (!files.length) res.notes.push({ text: "No files given.", bad: true });
  return res;
}

/** A library spec's match with one of a trace's programs. */
export type LibMatch = { lib: LibSpec; map: SourceMapping; puyaMap?: PuyaMap };

/**
 * The library spec for a program: one that matched it before first, then
 * the rest; of those that match with source lines (or approval programs,
 * see worthSaving), an exact (bytecode) match wins, then one with source
 * lines, then a .puya.map that fits.
 */
export function pickSpec(prog: Program, kind: ProgramKind, libs: LibSpec[]): LibMatch | undefined {
  const known = libs.filter((l) => l.apps.some((a) => a.hash === prog.hash));
  const order = [...known, ...libs.filter((l) => !known.includes(l))];
  let best: { m: LibMatch; score: number } | undefined;
  for (const lib of order) {
    const given = lib.maps[kind];
    const map = given?.map ?? lib.maps.unplaced?.map;
    let r: ReturnType<typeof matchSpec>;
    try {
      r = matchSpec(prog, lib.arc56, kind, map);
    } catch {
      continue;
    }
    if ("mismatch" in r || !worthSaving(kind, r)) continue;
    const puyaMap = map && !r.mapMismatch ? map : undefined;
    // An unplaced map that doesn't fit this program: no news.
    if (map && r.mapMismatch && !given) delete r.mapMismatch;
    const score = (r.exact ? 4 : 0) + (r.lines.length ? 2 : 0) + (puyaMap ? 1 : 0);
    if (!best || score > best.score) best = { m: { lib, map: r, puyaMap }, score };
    // A spec that matched this program before, as well as any could: no need to try the rest.
    if (known.includes(lib) && score === 7) break;
  }
  return best?.m;
}

/** The debugger's record of a library spec's match with a program. */
export function toRecord(m: LibMatch, hash: string, kind: ProgramKind, appId: number | undefined): SpecRecord {
  const sources = Object.fromEntries(Object.entries(m.lib.sources).map(([p, s]) => [p, s.text]));
  return {
    hash,
    kind,
    ...(appId !== undefined && { appId }),
    name: m.lib.name,
    arc56: m.lib.arc56,
    ...(m.puyaMap && { puyaMap: m.puyaMap }),
    ...(Object.keys(sources).length && { sources }),
    addedAt: m.lib.addedAt,
  };
}

/**
 * The spec with a match recorded: the program's entry (by hash) gets its
 * app if it lacked one and the time; undefined when nothing changed
 * (seen within `minGap` ms, same app).
 */
export function noteApp(lib: LibSpec, a: Omit<LibApp, "firstSeen" | "lastSeen">, now: number, minGap = 60_000): LibSpec | undefined {
  const same = (x: LibApp) => x.hash === a.hash && x.network === a.network;
  // Without its app ID (budget runs not in yet): every app running the program. With it: that app's entry, else one still without an ID.
  let hits: LibApp[];
  if (a.appId === undefined) hits = lib.apps.filter(same);
  else {
    const mine = lib.apps.filter((x) => same(x) && x.appId === a.appId);
    hits = mine.length ? mine : lib.apps.filter((x) => same(x) && x.appId === undefined).slice(0, 1);
  }
  if (!hits.length) return { ...lib, apps: [...lib.apps, { ...a, firstSeen: now, lastSeen: now }] };
  const fresh = (x: LibApp) => now - x.lastSeen < minGap && (x.appId !== undefined || a.appId === undefined) && (!a.exact || !!x.exact);
  if (hits.every(fresh)) return undefined;
  const next = new Map(hits.map((x) => [x, { ...x, appId: x.appId ?? a.appId, exact: a.exact || x.exact, lastSeen: now }]));
  return { ...lib, apps: lib.apps.map((x) => next.get(x) ?? x) };
}

/**
 * Specs the debugger saved by program before the library: one library spec
 * per distinct spec, with its maps, source files and the apps it matched.
 */
export function fromRecords(recs: SpecRecord[], network: string): LibSpec[] {
  const out = new Map<string, LibSpec>();
  for (const r of recs) {
    if (!r?.arc56) continue;
    const id = specId(r.arc56);
    let s = out.get(id);
    if (!s) {
      s = { ...newSpec(r.arc56, undefined, undefined, r.addedAt), name: r.name || r.arc56.name || "spec" };
      out.set(id, s);
    }
    s.addedAt = Math.min(s.addedAt, r.addedAt);
    if (r.puyaMap && !s.maps[r.kind]) s.maps[r.kind] = { name: `${s.name}.${r.kind}.puya.map`, map: r.puyaMap };
    for (const [p, text] of Object.entries(r.sources ?? {})) if (!s.sources[p]) s.sources[p] = { text };
    if (!s.apps.some((a) => a.hash === r.hash)) s.apps.push({ hash: r.hash, kind: r.kind, ...(r.appId !== undefined && { appId: r.appId }), network, firstSeen: r.addedAt, lastSeen: r.addedAt });
  }
  return [...out.values()];
}
