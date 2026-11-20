import { matchSpec, type ProgramKind, type PuyaMap, type SourceMapping, type SrcLine } from "./arc56Source";
import type { SpecRecord } from "./specStore";
import type { Program } from "./traceStepper";

/**
 * Source files (`.ts`, `.py`) and `.puya.map`s added to an ARC-56 spec on the
 * debugger: which of the spec's source paths each file is, whether it is
 * the file the program was built from, and merging them into saved specs.
 */

/** A dropped or chosen file; `path` is its path in a chosen folder (webkitRelativePath). */
export type SourceFile = { name: string; path?: string; text: string };
export type Note = { text: string; bad?: boolean; info?: boolean };

const segs = (p: string) => p.replace(/\\/g, "/").split("/").filter((s) => s && s !== "." && s !== "..");

/**
 * How many trailing path segments two paths share, ignoring case (or with
 * `exact`, in the same case): 0 when their file names differ.
 */
export function suffixLength(a: string, b: string, exact = false): number {
  const norm = (p: string) => (exact ? segs(p) : segs(p).map((x) => x.toLowerCase()));
  const x = norm(a);
  const y = norm(b);
  let n = 0;
  while (n < x.length && n < y.length && x[x.length - 1 - n] === y[y.length - 1 - n]) n++;
  return n;
}

/** A source file by its name: Algorand TypeScript or Python (`contract.algo.ts`, `contract.py`). */
export const isSourceName = (name: string) => /\.(ts|mts|py)$/i.test(name);

/**
 * A spec's source paths: those of its TEAL's `// file:line` comments, then
 * any of the map's `sources` (relative to the map, `../../x/contract.algo.ts`)
 * that isn't the end of one of those.
 */
export function specSourcePaths(lines: SrcLine[], puyaMap?: PuyaMap): string[] {
  const paths = [...new Set(lines.map((l) => l.file))];
  for (const s of Array.isArray(puyaMap?.sources) ? puyaMap.sources : []) {
    if (typeof s !== "string") continue;
    const n = segs(s).join("/");
    if (n && !paths.some((p) => suffixLength(p, n) === segs(n).length)) paths.push(n);
  }
  return paths;
}

const fileLines = (text: string) => text.split(/\r?\n/);

/** Where a file differs from the lines the spec's TEAL quotes from it: the first such line, and how many more. */
export type Differs = { line: number; spec: string; file: string; more: number };

type Quote = { text: string; part?: boolean };

/** Every line the spec quotes from source lines `lines`, by line number: a range's every line. */
function quotes(lines: SrcLine[]): Map<number, Quote> {
  const out = new Map<number, Quote>();
  for (const l of lines) {
    const q = l.quoted ?? [l.text];
    q.forEach((t, k) => {
      if (t && !out.has(l.line + k)) out.set(l.line + k, { text: t.trim(), part: l.part });
    });
  }
  return out;
}

const IDENT = /[\w$]/;

/** Whether `part` is in `line` with no identifier character running on either side: `next > 100` isn't in `next > 1000`. */
function hasPart(line: string, part: string): boolean {
  for (let i = line.indexOf(part); i >= 0; i = line.indexOf(part, i + 1)) {
    const before = IDENT.test(part[0]) && IDENT.test(line[i - 1] ?? "");
    const after = IDENT.test(part[part.length - 1]) && IDENT.test(line[i + part.length] ?? "");
    if (!before && !after) return true;
  }
  return false;
}

/** Whether a file's line is what the spec quotes: the whole line, trimmed, or for part of one (TEALScript's), in it. */
const fits = (fileLine: string | undefined, q: Quote) => {
  const f = (fileLine ?? "").trim();
  return q.part ? hasPart(f, q.text) : f === q.text;
};

/**
 * Checks a source file against the lines the spec quotes from it (`lines`,
 * that file's; every line of a range), whitespace-trimmed: undefined when
 * every quoted line is the file's line at that number (or has it, for part
 * of a line).
 */
export function checkSource(lines: SrcLine[], text: string): Differs | undefined {
  const fl = fileLines(text);
  const bad = [...quotes(lines)].filter(([n, q]) => !fits(fl[n - 1], q)).sort((a, b) => a[0] - b[0]);
  if (!bad.length) return undefined;
  const [n, q] = bad[0];
  return { line: n, spec: q.text, file: (fl[n - 1] ?? "").trim(), more: bad.length - 1 };
}

/** How many of the lines the spec quotes from `path` a file has at their numbers. */
function agreement(lines: SrcLine[], path: string, text: string): number {
  const fl = fileLines(text);
  return [...quotes(lines.filter((l) => l.file === path))].filter(([n, q]) => fits(fl[n - 1], q)).length;
}

export type SourceMatch = {
  matched: { file: SourceFile; path: string; differs?: Differs }[];
  /** A file whose name fits several paths equally, and whose text doesn't tell them apart. */
  ambiguous: { file: SourceFile; paths: string[] }[];
  unrelated: SourceFile[];
  /** A second file for a path: the better fit is used. */
  duplicate: { file: SourceFile; path: string }[];
};

/**
 * Which of the spec's source `paths` each file is: the path that shares the
 * longest end with the file's path (or name), ignoring case. Between paths
 * that share as much, the one that shares most in the same case, then the
 * one whose quoted lines (`lines`) the file has most of. A file whose name
 * is none of the paths' is unrelated.
 */
export function matchSourceFiles(paths: string[], lines: SrcLine[], files: SourceFile[]): SourceMatch {
  const out: SourceMatch = { matched: [], ambiguous: [], unrelated: [], duplicate: [] };
  const best = new Map<string, { file: SourceFile; suffix: number; score: number }>();
  for (const file of files) {
    const fp = file.path || file.name;
    const scored = paths.map((path) => ({ path, suffix: suffixLength(path, fp) })).filter((c) => c.suffix > 0);
    if (!scored.length) {
      out.unrelated.push(file);
      continue;
    }
    const top = Math.max(...scored.map((c) => c.suffix));
    const near = scored.filter((c) => c.suffix === top).map((c) => ({ ...c, exact: suffixLength(c.path, fp, true) }));
    const closest = Math.max(...near.map((c) => c.exact));
    let cands = near.filter((c) => c.exact === closest).map((c) => ({ ...c, score: agreement(lines, c.path, file.text) }));
    if (cands.length > 1) {
      const most = Math.max(...cands.map((c) => c.score));
      cands = cands.filter((c) => c.score === most);
      if (cands.length > 1 || most === 0) {
        out.ambiguous.push({ file, paths: cands.map((c) => c.path) });
        continue;
      }
    }
    const c = cands[0];
    const had = best.get(c.path);
    if (had && (had.suffix > c.suffix || (had.suffix === c.suffix && had.score >= c.score))) {
      out.duplicate.push({ file, path: c.path });
      continue;
    }
    if (had) out.duplicate.push({ file: had.file, path: c.path });
    best.set(c.path, { file, suffix: c.suffix, score: c.score });
  }
  for (const [path, { file }] of best) {
    out.matched.push({ file, path, differs: checkSource(lines.filter((l) => l.file === path), file.text) });
  }
  return out;
}

/** A saved spec of a program in the trace, with its program and mapping: a place to add files to. */
export type Target = { rec: SpecRecord; prog: Program; map: SourceMapping };
/** A `.puya.map` to add; `kind` from its name, if it says. */
export type MapFile = { name: string; kind?: ProgramKind; map: PuyaMap };

const shown = (f: SourceFile) => f.path || f.name;
const list = (xs: string[]) => (xs.length < 3 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** Why a `.puya.map` doesn't fit a saved spec's program; undefined when it does. */
function mapMisfit(t: Target, map: PuyaMap): string | undefined {
  try {
    const r = matchSpec(t.prog, t.rec.arc56, t.rec.kind, map);
    return "mismatch" in r ? r.mismatch : r.mapMismatch;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/**
 * Adds `.puya.map`s and source files to saved specs (`targets`: the app's
 * programs that have one). A map is matched again with the program its name
 * says, then the others, and kept with the first it fits. A source file is
 * kept, under its path in the spec's TEAL, in each spec that quotes that
 * path. Gives the records that changed (to save) and what to tell.
 */
export function mergeFiles(targets: Target[], maps: MapFile[], files: SourceFile[]): { recs: SpecRecord[]; notes: Note[] } {
  const notes: Note[] = [];
  const recs = targets.map((t) => ({ ...t.rec }));
  const changed = new Set<number>();

  for (const m of maps) {
    // The program its name says first, then the others.
    const order = targets.map((t, k) => k).sort((a, b) => Number(targets[b].rec.kind === m.kind) - Number(targets[a].rec.kind === m.kind));
    const whys: string[] = [];
    const k = order.find((j) => {
      const why = mapMisfit(targets[j], m.map);
      if (why) whys.push(`the ${targets[j].rec.kind} program: ${why}`);
      return !why;
    });
    if (k !== undefined) {
      recs[k].puyaMap = m.map;
      changed.add(k);
      const named = m.kind && m.kind !== recs[k].kind ? ` (though its name says ${m.kind})` : "";
      notes.push({ text: `${m.name} fits the ${recs[k].kind} program${named}: the stack values are named.` });
    } else if (!targets.length) notes.push({ text: `${m.name}: no saved spec here to add it to.`, bad: true });
    else notes.push({ text: `${m.name} doesn't fit ${targets.length > 1 ? "either program" : `the ${targets[0].rec.kind} program`} of this spec (${whys.join("; ")}): not added.`, bad: true });
  }

  const lines = targets.flatMap((t) => t.map.lines);
  if (files.length && !lines.length) {
    notes.push({ text: `This spec's TEAL has no source lines (no \`// file:line\` comments), so there is no source view to show ${list(files.map(shown))} in: not added.`, bad: true });
  } else if (files.length) {
    // Only the files the TEAL quotes: the source view shows those.
    const pathsOf = targets.map((t) => [...new Set(t.map.lines.map((l) => l.file))]);
    const paths = [...new Set(pathsOf.flat())];
    const r = matchSourceFiles(paths, lines, files);
    for (const { file, path, differs } of r.matched) {
      recs.forEach((rec, k) => {
        if (!pathsOf[k].includes(path)) return;
        rec.sources = { ...rec.sources, [path]: file.text };
        changed.add(k);
      });
      if (differs) {
        notes.push({
          text: `${shown(file)} differs from the build at line ${differs.line}: the spec has “${differs.spec}”, the file “${differs.file}”${differs.more ? ` (and ${differs.more} more ${differs.more === 1 ? "line" : "lines"})` : ""}. Added anyway; it may not be the code that ran.`,
          bad: true,
        });
      } else notes.push({ text: `${shown(file)} is ${path}.` });
    }
    for (const a of r.ambiguous) notes.push({ text: `${shown(a.file)} could be ${list(a.paths)}: choose its folder instead, so its path tells which.`, bad: true });
    for (const d of r.duplicate) notes.push({ text: `${shown(d.file)}: another file given for ${d.path} fits it better; not used.`, info: true });
    if (r.unrelated.length) notes.push({ text: `Ignored ${list(r.unrelated.map(shown))}: not among the spec's source files.`, info: true });
    const missing = paths.filter((p) => !recs.some((rec, k) => pathsOf[k].includes(p) && rec.sources?.[p] !== undefined));
    if (missing.length) notes.push({ text: `Still missing: ${list(missing)}.`, info: true });
    else if (r.matched.length) notes.push({ text: `Every source file of the spec is added.`, info: true });
  }
  return { recs: [...changed].map((k) => recs[k]), notes };
}
