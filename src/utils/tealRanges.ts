import { splitSub, subInFiles, type SourceMapping, type SrcLine } from "./arc56Source";
import { hasPart } from "./sourceFiles";
import type { Program } from "./traceStepper";

/**
 * The TEAL view's source column: the disassembly cut into ranges of ops
 * that came from one source line, each drawn with its line beside it.
 *
 * Lines without a pc (labels, the pragma) go with the next op, since a
 * label is where a jump lands; one between two ops of the same source line
 * (a loop's head) stays inside their range. A short run of ops from another
 * line between two ranges of one line (Puya puts a state key's constant on
 * the key's declaration, splitting `this.counter.value += 1` around it) is
 * folded back in and kept as asides, drawn on its ops.
 */

export type TealRange = {
  /** Index into `prog.lines` of its first line (a label, or its first op). */
  first: number;
  /** Index of its last line, inclusive. */
  last: number;
  /** Its ops' source line; none for ops the compiler added or library code. */
  line?: SrcLine;
  /** Without a line: in a subroutine from outside the contract's files (its short name), else added by the compiler. */
  library?: string;
  /** Which of the line's ranges in the program this is (1-based), and how many it has. */
  part: number;
  parts: number;
  /** A subroutine's header (`file::signature`), when one starts at this range. */
  sub?: string;
  /** Ops folded in from another line: pc → that line. */
  asides?: Map<number, SrcLine>;
};

/** The longest run of ops from another line folded into the range around it. */
export const FOLD = 2;

type Raw = TealRange & { ops: number[]; curSub?: string };

export function tealRanges(prog: Program, map: SourceMapping, fold = FOLD): TealRange[] {
  const raw: Raw[] = [];
  let pend: number | undefined;
  let curSub: string | undefined;
  prog.lines.forEach((l, i) => {
    if (l.pc === undefined) {
      if (pend === undefined) pend = i;
      return;
    }
    const pc = l.pc;
    const line = map.byPc.get(pc);
    const sub = map.subs.get(pc);
    if (sub) curSub = sub;
    const cur = raw[raw.length - 1];
    if (cur && !sub && cur.line === line) {
      cur.last = i;
      cur.ops.push(pc);
    } else {
      raw.push({ first: pend ?? i, last: i, line, part: 0, parts: 0, ops: [pc], curSub, ...(sub && { sub }) });
    }
    pend = undefined;
  });
  if (pend !== undefined) {
    const cur = raw[raw.length - 1];
    if (cur) cur.last = prog.lines.length - 1;
    else raw.push({ first: pend, last: prog.lines.length - 1, part: 0, parts: 0, ops: [] });
  }

  // Fold: a short run between two ranges of another line, none of them starting a subroutine.
  for (let i = 1; i < raw.length - 1; ) {
    const [a, r, b] = [raw[i - 1], raw[i], raw[i + 1]];
    if (r.line && a.line && a.line === b.line && r.line !== a.line && r.ops.length <= fold && !r.sub && !b.sub) {
      const asides = a.asides ?? new Map<number, SrcLine>();
      for (const pc of r.ops) asides.set(pc, r.line);
      for (const [pc, l] of b.asides ?? []) asides.set(pc, l);
      a.asides = asides;
      a.last = b.last;
      a.ops.push(...r.ops, ...b.ops);
      raw.splice(i, 2);
    } else i++;
  }

  const files = new Set(map.lines.map((l) => l.file));
  const parts = new Map<SrcLine, number>();
  for (const r of raw) if (r.line) parts.set(r.line, (parts.get(r.line) ?? 0) + 1);
  const seen = new Map<SrcLine, number>();
  return raw.map(({ ops: _ops, curSub: cs, ...r }) => {
    if (r.line) {
      const k = (seen.get(r.line) ?? 0) + 1;
      seen.set(r.line, k);
      r.part = k;
      r.parts = parts.get(r.line)!;
    } else {
      r.part = r.parts = 1;
      if (cs !== undefined && !subInFiles(cs, files)) r.library = splitSub(cs).name;
    }
    return r;
  });
}

/** The range of each of `prog.lines`, by index. */
export function rangeIndex(ranges: TealRange[], n: number): Int32Array {
  const out = new Int32Array(n).fill(-1);
  ranges.forEach((r, k) => out.fill(k, r.first, r.last + 1));
  return out;
}

/** A source line's key, as rows and chips carry it for highlighting. */
export const srcKey = (l: { file: string; line: number }) => `${l.file}:${l.line}`;

/** Source files' lines, by path: what lineText reads. */
export type FileLines = Map<string, string[]>;

/** Each source file's lines. */
export function fileLines(sources: Record<string, string> | undefined): FileLines {
  return new Map(Object.entries(sources ?? {}).map(([path, text]) => [path, text.split(/\r?\n/)]));
}

/**
 * A source line's text to show: the spec's quote of the whole line, else the
 * line from its added source file (the spec quotes none of it, or part, as
 * TEALScript does: `next > 100` from `if (next > 100) {`) and has it (a
 * file that differs from the build may not), else the quote. Empty when
 * there is neither.
 */
export function lineText(l: SrcLine, files: FileLines): string {
  if (l.text && !l.part) return l.text;
  const line = files.get(l.file)?.[l.line - 1]?.trim();
  return line && (!l.text || hasPart(line, l.text)) ? line : l.text;
}
