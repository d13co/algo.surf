import type { SrcLine } from "./arc56Source";

/**
 * The rows of the debugger's TypeScript view: the lines the spec's TEAL
 * quotes, or a whole source file.
 */

export type Row =
  | { kind: "file"; file: string }
  | { kind: "gap"; k: string }
  | { kind: "note"; k: string; text: string }
  /**
   * A source line. `text`: the line as the source file has it (whole-file
   * view). `noOps`: a line no op came from. `cont`: line `cont` of the range
   * that `line` starts (`// file:a-b`), shown as part of it.
   */
  | { kind: "line"; line: SrcLine; text?: string; noOps?: boolean; cont?: number };

/** The quoted lines of `lines` (one file's or all), with a header per file (`header`) and a "…" between lines that aren't consecutive. */
export function quotedRows(lines: SrcLine[], header: boolean): Row[] {
  const out: Row[] = [];
  let prev: SrcLine | undefined;
  for (const l of lines) {
    if (l.file !== prev?.file) {
      if (header) out.push({ kind: "file", file: l.file });
    } else if (l.line > (prev.end ?? prev.line) + 1) out.push({ kind: "gap", k: `${l.file}:${prev.line}…` });
    out.push({ kind: "line", line: l });
    prev = l;
  }
  return out;
}

/**
 * Every line of source file `file` (its `text`): the lines ops came from
 * as `lines` has them, the rest of a range's lines as part of it, and the
 * others as lines without ops. Lines the spec has past the file's end
 * (a file shorter than the build's) come last.
 */
export function fileRows(file: string, text: string, lines: SrcLine[]): Row[] {
  const own = lines.filter((l) => l.file === file).sort((a, b) => a.line - b.line);
  const at = new Map(own.map((l) => [l.line, l]));
  const cover = new Map<number, SrcLine>();
  for (const l of own) for (let n = l.line + 1; n <= (l.end ?? l.line); n++) if (!at.has(n) && !cover.has(n)) cover.set(n, l);
  const fl = text.split(/\r?\n/);
  if (fl.length > 1 && fl[fl.length - 1] === "") fl.pop();
  const out: Row[] = fl.map((t, i) => {
    const n = i + 1;
    const l = at.get(n);
    if (l) return { kind: "line", line: l, text: t };
    const r = cover.get(n);
    if (r) return { kind: "line", line: r, text: t, cont: n };
    return { kind: "line", line: { file, line: n, text: t, pcs: [] }, text: t, noOps: true };
  });
  for (const l of own) if (l.line > fl.length) out.push({ kind: "line", line: l });
  return out;
}

const MODIFIER = "(?:public|private|protected|static|readonly|override|abstract|async|get|set)\\s+";
// A class member: modifiers, a name and type parameters, its parameters, an optional return type, then `{` (or `(`, parameters going on below).
const MEMBER = new RegExp(`^(?:${MODIFIER})*([A-Za-z_$][\\w$]*)\\s*(?:<.*>)?\\s*\\((?:.*\\)\\s*(?::[^=]*?)?\\s*\\{|\\s*)$`);
const HAS_MODIFIER = new RegExp(`^${MODIFIER}`);
const NOT_METHODS = new Set(["if", "for", "while", "switch", "catch", "return", "do", "with", "function"]);

/**
 * Whether a source line declares a method or function, to set it apart:
 * `public register(appId: uint64): void {`, `export function f(`, `def f(self):`.
 * Calls, control statements and arrow functions aren't.
 */
export function isMethodLine(text: string): boolean {
  const t = text.trim();
  // A declaration is short; a long line (minified source) would cost the member pattern time quadratic in its length.
  if (t.length > 300) return false;
  if (/^(?:async\s+)?def\s+\w+\s*\(/.test(t)) return true;
  if (/^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\b/.test(t)) return true;
  if (t.includes("=>")) return false;
  const m = MEMBER.exec(t);
  if (!m || NOT_METHODS.has(m[1])) return false;
  // Without a modifier, only a whole signature ending in `{`, not one going on below (a call's arguments).
  return HAS_MODIFIER.test(t) || t.endsWith("{");
}
