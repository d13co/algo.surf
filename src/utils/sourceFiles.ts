import type { PuyaMap, SrcLine } from "./arc56Source";

/**
 * Source files (`.ts`, `.py`) added to an ARC-56 spec: which of the spec's
 * source paths each file is, and whether it is the file the program was
 * built from.
 */

/** A dropped or chosen file; `path` is its path in a chosen folder (webkitRelativePath). */
export type SourceFile = { name: string; path?: string; text: string };
/** `none`: the note that a folder has no spec to add. */
export type Note = { text: string; bad?: boolean; info?: boolean; none?: boolean };

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
export function hasPart(line: string, part: string): boolean {
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
