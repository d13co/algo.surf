import type { Arc56Contract, ProgramSourceInfo } from "@algorandfoundation/algokit-utils/types/app-arc56";
import { sha512_256 } from "js-sha512";
import { opName, type Program } from "./traceStepper";

/**
 * Source locations for a program from its ARC-56 spec, as Puya writes it.
 *
 * The spec's `source.approval` / `source.clear` TEAL has, before each run of
 * ops, a `// <file>:<line>` comment and the quoted source line(s), and before
 * each subroutine a header: `// <file>::<signature>:` from Algorand
 * TypeScript, `// <module>.<Class>.<name>(<params>) -> <ret>:` from Algorand
 * Python. Its ops are the
 * program's ops in the same order, so the n-th TEAL op pairs with the node's
 * disassembly's n-th op, which has the pc. An optional `.puya.map` (not part
 * of ARC-56) pairs the same way and names the stack values.
 *
 * TEALScript's TEAL has the same `// <file>:<line>` comments, a subroutine's
 * signature in the comments above its label, and a sourceInfo that gives
 * each op its source line (`source`), which wins over the comments.
 */

export type ProgramKind = "approval" | "clear";

/**
 * A source line: `text` is the line as the TEAL quotes it, trimmed. A range
 * (`<file>:<a>-<b>`) is line a, with `end` b and `quoted` every line the
 * TEAL quotes from it (a's first), trimmed. `part`: `text` is part of the
 * line, not all of it (TEALScript quotes a statement, `next > 100` from
 * `if (next > 100) {`).
 */
export type Loc = { file: string; line: number; text: string; end?: number; quoted?: string[]; part?: boolean };

/**
 * One TEAL op: its text without comments, its TEAL line (1-based), its
 * source line and subroutine, and the line's `//` comment when it is the
 * line's only op, in TEALScript's TEAL (`frame_dig -1 // limit: uint64`).
 */
export type TealOp = { op: string; line: number; loc?: Loc; sub?: string; note?: string };

/** A distinct source line and the pcs of its ops, in program order. */
export type SrcLine = Loc & { pcs: number[] };

export type SourceMapping = {
  /** Each op's source line: the same object as in `lines`. */
  byPc: Map<number, SrcLine>;
  /** Each distinct (file, line): files in program order, lines ascending. */
  lines: SrcLine[];
  /** A subroutine's header (`file::signature`, or Python's `module.Class.name(…) -> ret`) at its first op. */
  subs: Map<number, string>;
  /** Failure messages by pc, from `sourceInfo` (and a `.puya.map`'s `error`). */
  errors: Map<number, string>;
  /**
   * With a `.puya.map`: the names of the stack after each op that lists them,
   * bottom to top. They name the current subroutine's part of the stack,
   * above its frame pointer (its arguments are below), so they align with
   * the top of the stack.
   */
  stackOut?: Map<number, string[]>;
  /** With a `.puya.map`: the names of the stack before a block's first op, as stackOut. */
  stackIn?: Map<number, string[]>;
  /** The spec's byteCode hashes to the program's hash: the same program, byte for byte. */
  exact?: boolean;
  /**
   * With TEALScript's TEAL: each subroutine's frame slots' names (by its
   * first op's pc), from the TEAL's `frame_dig` / `frame_bury` comments:
   * slot -k its argument k, slot j its local j.
   */
  frameNames?: Map<number, Map<number, string>>;
  /** With TEALScript's TEAL: the pcs of the `frame_bury 0`s that put a subroutine's return value in slot 0. */
  frameReturns?: Set<number>;
  /** The TEAL is TEALScript's: its files are `.algo.ts` like Algorand TypeScript's, so the files can't tell. */
  tealscript?: boolean;
  /** Why the `.puya.map` given doesn't fit the program; the TEAL match stands without it. */
  mapMismatch?: string;
};

export type Mismatch = { mismatch: string };

/** A `.puya.map`: a v3 source map plus Puya's `pc_events`, keyed by pc. */
export type PuyaMap = {
  version?: number;
  sources?: string[];
  mappings?: string;
  op_pc_offset?: number;
  pc_events: Record<string, PcEvent>;
};
export type PcEvent = { op?: string; subroutine?: string; error?: string; stack_in?: string[]; stack_out?: string[] };

// A path with an extension, then a line or a range: `contracts/a.algo.ts:28-33`.
const LOC = /^(\S+\.\w+):(\d+)(?:-(\d+))?$/;
// A subroutine header: Algorand TypeScript's `a.algo.ts::C.f(x: uint64) -> void:`,
// or Algorand Python's `pkg.contract.C.f[routing](x: uint64) -> void:`.
const SUB = /^(.+::.+):$/;
const PY_SUB = /^([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)+(?:\[[^\]()]*\])?\(.*\)\s*->\s*.+):$/;

/**
 * The source view's name: `TEALScript` for TEALScript's TEAL, else by its
 * files' language: `TypeScript`, `Python`, or `Source` when mixed or neither.
 */
export function sourceLang({ lines, tealscript }: Pick<SourceMapping, "lines" | "tealscript">): string {
  if (tealscript) return "TEALScript";
  const langs = new Set(lines.map(({ file }) => (/\.py$/i.test(file) ? "Python" : /\.[cm]?ts$/i.test(file) ? "TypeScript" : "Source")));
  return langs.size === 1 ? [...langs][0] : "Source";
}

/**
 * A subroutine header's parts: its short name (`C.f`), its signature
 * (`(x: uint64) -> void`), and for a TypeScript header its file. A Python
 * header's dotted path (`pkg.contract.C.f`) is cut at its last capitalised
 * part before the name, the class (modules may be capitalised too, as in
 * `pkg.NttManager.NttManager.f`), or else keeps just the name.
 */
export function splitSub(header: string): { name: string; sig: string; file?: string } {
  const at = header.indexOf("::");
  const s = at >= 0 ? header.slice(at + 2) : header;
  const p = s.indexOf("(");
  const path = (p >= 0 ? s.slice(0, p) : s).trim();
  const sig = p >= 0 ? s.slice(p) : "";
  if (at >= 0) return { name: path || header, sig, file: header.slice(0, at) };
  const parts = path.split(".");
  if (parts.length < 2) return { name: path || header, sig };
  let k = parts.length - 2;
  while (k > 0 && !/^[A-Z]/.test(parts[k])) k--;
  if (k === 0 && !/^[A-Z]/.test(parts[0])) k = parts.length - 1;
  return { name: parts.slice(k).join("."), sig };
}

/** A Python file's path as module parts: `./src/pkg/contract.py` → `src pkg contract`, `pkg/__init__.py` → `pkg`. */
function moduleParts(file: string): string[] {
  const parts = file
    .replace(/\.py$/i, "")
    .split(/[\\/]/)
    .filter((x) => x && x !== "." && x !== "..");
  if (parts[parts.length - 1] === "__init__") parts.pop();
  return parts;
}

/** Whether `a` ends with `b`, part by part. */
const endsWith = (a: string[], b: string[]) => b.length > 0 && b.length <= a.length && b.every((x, i) => a[a.length - b.length + i] === x);

/**
 * Whether a subroutine header is from one of `files` (the source lines'
 * files). A TypeScript header names its file. A Python header's dotted path
 * starts with its module: one of its leading runs of parts (without the
 * name) that is a file's path (as parts, without `.py`) or its end, or that
 * ends with one, for paths relative to elsewhere (`contract.py` and
 * `pkg.contract`, `venv/…/site-packages/pkg/lib.py` and `pkg.lib`).
 */
export function subInFiles(header: string, files: ReadonlySet<string>): boolean {
  const { file } = splitSub(header);
  if (file !== undefined) return files.has(file);
  // The compiler's own: never the contract's, whatever its files are called (`state.py` and `algopy.state`).
  if (/^(algopy|_puya_lib)\./.test(header)) return false;
  const p = header.indexOf("(");
  const parts = (p >= 0 ? header.slice(0, p) : header).trim().split(".");
  const mods = [...files].map(moduleParts);
  for (let k = parts.length - 1; k > 0; k--) {
    const prefix = parts.slice(0, k);
    if (mods.some((m) => endsWith(m, prefix) || endsWith(prefix, m))) return true;
  }
  return false;
}

// TEALScript's comment above a subroutine's label: `add(by: uint64): uint64`, `createApplication(uint64)void` above its route.
const TS_SIG = /^([A-Za-z_$][\w$]*)(\(.*\).*)$/;
// TEALScript's router labels: a method's route, the OnCompletion branches, the fallback.
const TS_ROUTE = /^\*abi_route_(.+)$/;
const TS_ROUTER = /^\*((?:create|call)_\w+|NOT_IMPLEMENTED)$/;

/** Whether TEALScript wrote the TEAL: its header says so. */
export function isTealscript(teal: string): boolean {
  return /^\s*\/\/ This TEAL was generated by TEALScript\b/m.test(teal);
}

/**
 * A TEAL line's code, split into ops at `;`, without its `//` comment. As
 * go-algorand's assembler reads it: `//` and `;` inside a string don't count,
 * nor `//` inside a base64 literal (`base64 ab//cd`, `b64(ab//cd)`).
 */
function codeOf(line: string): string[] {
  return splitLine(line).ops;
}

/** A TEAL line's ops (see codeOf) and its `//` comment, trimmed, if it has one. */
function splitLine(line: string): { ops: string[]; comment?: string } {
  const ops: string[] = [];
  let start = 0;
  let tok = -1;
  let prev = "";
  let inStr = false;
  const b64 = (i: number) => prev === "base64" || prev === "b64" || /^(base64|b64)\([^)]*$/.test(line.slice(tok, i));
  const done = (comment?: string) => ({ ops: ops.map((o) => o.trim()).filter(Boolean), comment });
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inStr) {
      if (c === "\\") i++;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === " " || c === "\t") {
      if (tok >= 0) prev = line.slice(tok, i);
      tok = -1;
      continue;
    }
    if (tok < 0) tok = i;
    if (c === '"') inStr = true;
    else if (c === "/" && line[i + 1] === "/" && !b64(i)) {
      ops.push(line.slice(start, i));
      return done(line.slice(i + 2).trim());
    } else if (c === ";") {
      ops.push(line.slice(start, i));
      start = i + 1;
      tok = -1;
      prev = "";
    }
  }
  ops.push(line.slice(start));
  return done();
}

/** An op's fields: whitespace-separated, strings kept whole. */
function fields(code: string): string[] {
  return code.match(/"(?:\\.|[^"\\])*"|\S+/g) ?? [];
}

/**
 * The subroutine a TEALScript label starts, if it starts one: a label named
 * as the signature in the comments above it (`add:` under `// add(by:
 * uint64): uint64`), a method's route (`add[routing](uint64)uint64`), or the
 * router's branches (`call_NoOp`). Its `*if0_else`-style labels don't.
 */
function tealscriptSub(label: string, sig: RegExpExecArray | undefined): string | undefined {
  const route = TS_ROUTE.exec(label);
  if (route) return sig?.[1] === route[1] ? `${route[1]}[routing]${sig[2]}` : `${route[1]}[routing]`;
  const router = TS_ROUTER.exec(label);
  if (router) return router[1];
  return sig?.[1] === label ? sig[0] : undefined;
}

/**
 * The TEAL's ops in order, each with the latest `// <file>:<line>` above it
 * (a `<file>:<a>-<b>` range keeps line a, quoted first) and the latest
 * subroutine header: Puya's `// <file>::<signature>:`, or a TEALScript
 * subroutine's label (see tealscriptSub). Pragmas, labels, comments and
 * blank lines aren't ops.
 */
export function parseTeal(teal: string): TealOp[] {
  const ops: TealOp[] = [];
  const ts = isTealscript(teal);
  let loc: Loc | undefined;
  let sub: string | undefined;
  // Quoted source lines still expected under the last location comment, and how many came.
  let quoting = 0;
  let quoted = 0;
  // TEALScript: the first signature in the comments since the last op or label.
  let sig: RegExpExecArray | undefined;
  teal.split(/\r?\n/).forEach((raw, i) => {
    const t = raw.trim();
    if (t.startsWith("//")) {
      const body = t.slice(2).trim();
      const l = LOC.exec(body);
      if (l) {
        const a = Number(l[2]);
        const b = l[3] ? Number(l[3]) : a;
        loc = b > a ? { file: l[1], line: a, text: "", end: b, quoted: [] } : { file: l[1], line: a, text: "" };
        quoting = Math.max(1, b - a + 1);
        quoted = 0;
        // Code, not a subroutine's header comments.
        sig = undefined;
      } else if (quoting > 0) {
        if (quoted++ === 0) loc.text = body;
        loc.quoted?.push(body);
        quoting--;
      } else {
        const s = SUB.exec(body) ?? PY_SUB.exec(body);
        if (s) {
          sub = s[1];
          loc = undefined;
        } else if (ts && !sig) sig = TS_SIG.exec(body) ?? undefined;
      }
      return;
    }
    quoting = 0;
    if (!t || t.startsWith("#")) return;
    const { ops: code, comment } = splitLine(t);
    for (let op of code) {
      // A label, alone or before an op on its line.
      const f = fields(op);
      if (f[0].endsWith(":")) {
        op = op.slice(op.indexOf(f[0]) + f[0].length).trim();
        const s = ts ? tealscriptSub(f[0].slice(0, -1), sig) : undefined;
        if (s) {
          sub = s;
          loc = undefined;
        }
      }
      sig = undefined;
      if (!op) continue;
      const o: TealOp = { op, line: i + 1, loc, sub };
      if (ts && comment && code.length === 1) o.note = comment;
      ops.push(o);
    }
  });
  return ops;
}

// Ops the assembler may write differently from the TEAL: pseudo-ops and
// constants (`int 1` → `intc_0` or `pushint 1`), array fields
// (`txn ApplicationArgs 0` → `txna`), and immediates or not (`extract` →
// `extract3`).
const CANON: Record<string, string> = {
  pushint: "int",
  intc: "int",
  intc_0: "int",
  intc_1: "int",
  intc_2: "int",
  intc_3: "int",
  pushbytes: "byte",
  bytec: "byte",
  bytec_0: "byte",
  bytec_1: "byte",
  bytec_2: "byte",
  bytec_3: "byte",
  addr: "byte",
  method: "byte",
  txna: "txn",
  gtxna: "gtxn",
  gtxnsa: "gtxns",
  itxna: "itxn",
  gitxna: "gitxn",
  extract3: "extract",
  replace2: "replace",
  replace3: "replace",
};
const canon = (op: string) => CANON[op] ?? op;
const CBLOCKS = new Set(["intcblock", "bytecblock"]);
const INT_OPS = new Set(["intcblock", "pushint", "pushints"]);
const BYTE_OPS = new Set(["bytecblock", "pushbytes", "pushbytess"]);

/** An int literal as go-algorand reads it (decimal, 0x, 0o, 0b, leading-0 octal); undefined otherwise. */
function intValue(s: string): string | undefined {
  try {
    if (/^0[0-7]+$/.test(s)) return BigInt(`0o${s.slice(1)}`).toString();
    if (/^(\d+|0x[0-9a-f]+|0o[0-7]+|0b[01]+)$/i.test(s)) return BigInt(s).toString();
  } catch {
    // Not a literal.
  }
  return undefined;
}

const hex = (b: ArrayLike<number>) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const b64Bytes = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

const ESC: Record<string, number> = { n: 10, r: 13, t: 9, "\\": 92, '"': 34 };

/** A quoted TEAL string's bytes as hex; undefined for an escape it doesn't know. */
function stringHex(s: string): string | undefined {
  const out: number[] = [];
  const enc = new TextEncoder();
  for (const m of s.slice(1, -1).matchAll(/\\(x[0-9a-f]{2}|.)|[^\\]+/gis)) {
    if (!m[1]) out.push(...enc.encode(m[0]));
    else if (m[1].length === 3) out.push(parseInt(m[1].slice(1), 16));
    else if (ESC[m[1]] !== undefined) out.push(ESC[m[1]]);
    else return undefined;
  }
  return hex(out);
}

/** A byte op's values as hex, from 0x…, "…" and base64 forms; undefined for one it can't read (a template variable, base32). */
function byteValues(args: string[]): (string | undefined)[] {
  const out: (string | undefined)[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    let v: string | undefined;
    try {
      if (/^0x([0-9a-f]{2})*$/i.test(a)) v = a.slice(2).toLowerCase();
      else if (a.startsWith('"')) v = stringHex(a);
      else if (a === "base64" || a === "b64") v = hex(b64Bytes(args[++i]));
      else if (/^(base64|b64)\(.*\)$/.test(a)) v = hex(b64Bytes(a.slice(a.indexOf("(") + 1, -1)));
      else if (a === "base32" || a === "b32") i++;
    } catch {
      // Not readable: left out of the comparison.
    }
    out.push(v);
  }
  return out;
}

/** Literal values of a constant op, normalised; undefined where one can't be read. */
function literals(name: string, text: string): (string | undefined)[] | undefined {
  const args = fields(codeOf(text)[0] ?? "").slice(1);
  if (INT_OPS.has(name)) return args.map(intValue);
  if (BYTE_OPS.has(name)) return byteValues(args);
  return undefined;
}

type ProgOp = { pc: number; name: string; text: string };
type TheirOp = { name: string; text: string; where?: string };

/** The disassembly's ops, in order: its lines with a pc, less pragmas and labels. */
function progOps(prog: Program): ProgOp[] {
  return prog.lines.flatMap((l) => {
    const name = opName(l.text);
    return l.pc === undefined || !name || name.startsWith("#") || name.endsWith(":") ? [] : [{ pc: Number(l.pc), name, text: l.text }];
  });
}

/**
 * The program's ops less the constant blocks the assembler added at its top
 * for `int` / `byte` pseudo-ops: those of its leading cblocks that `theirs`
 * (the spec's ops) doesn't start with.
 */
function dropAddedCblocks(ours: ProgOp[], theirs: TheirOp[]): ProgOp[] {
  const want: string[] = [];
  for (const o of theirs) {
    if (!CBLOCKS.has(o.name)) break;
    want.push(o.name);
  }
  let n = 0;
  while (n < ours.length && CBLOCKS.has(ours[n].name)) n++;
  const kept = ours.slice(0, n).filter((o) => {
    const j = want.indexOf(o.name);
    if (j >= 0) want.splice(j, 1);
    return j >= 0;
  });
  return [...kept, ...ours.slice(n)];
}

/**
 * Why `ours` (the program's ops) and `theirs` don't pair, if they don't: the
 * first op whose name differs, or whose literal constants differ where both
 * sides have them, else a count difference. `who` is how a message names
 * the other side ("the spec", "the .puya.map").
 */
function pairing(ours: ProgOp[], theirs: TheirOp[], who: string, operands: boolean): string | undefined {
  const n = Math.min(ours.length, theirs.length);
  const has = who === "the spec" ? who : `${who} has`;
  for (let i = 0; i < n; i++) {
    const a = ours[i];
    const b = theirs[i];
    const at = `op ${i + 1} (pc ${a.pc}${b.where ? `, ${b.where}` : ""})`;
    if (canon(a.name) !== canon(b.name)) return `${at}: the program has \`${a.name}\`, ${has} \`${b.name}\``;
    if (!operands || a.name !== b.name) continue;
    const x = literals(a.name, a.text);
    const y = literals(b.name, b.text);
    if (!x || !y) continue;
    if (x.length !== y.length) return `${at}: \`${a.name}\` has ${x.length} values in the program, ${y.length} in ${who}`;
    const j = x.findIndex((v, k) => v !== undefined && y[k] !== undefined && v !== y[k]);
    if (j >= 0) return `${at}: \`${a.name}\` value ${j + 1} is ${x[j]} in the program, ${y[j]} in ${who}`;
  }
  if (ours.length === theirs.length) return undefined;
  const extra =
    ours.length > n
      ? `the program's op ${n + 1} (\`${ours[n].name}\` at pc ${ours[n].pc}) is extra`
      : `${who}'s op ${n + 1} (\`${theirs[n].name}\`${theirs[n].where ? `, ${theirs[n].where}` : ""}) is extra`;
  return `the program has ${ours.length} ops, ${has} ${theirs.length}: ${extra}`;
}

/**
 * Pairs the program's disassembly with the spec's TEAL op by op. They must
 * have as many ops, with the same names (template variables change only
 * arguments), and with `operands`, the same literal constants where both
 * have them. `errors` is left empty: see matchSpec.
 *
 * With `info` (the spec's sourceInfo for the program) giving ops their
 * `source` line, as TEALScript's does, those lines win over the TEAL's
 * comments, which leave ops without one above them (a branch's jump, a
 * method's `retsub`) on the line before; the comments still quote the text,
 * where they quote that line. TEALScript's quotes are part of a line (`part`).
 */
export function matchProgram(prog: Program, teal: string, operands = true, info?: ProgramSourceInfo): SourceMapping | Mismatch {
  if (prog.synthetic) return { mismatch: "the program's disassembly is unknown" };
  const ops = parseTeal(teal);
  const theirs = ops.map((o) => ({ name: opName(o.op), text: o.op, where: `TEAL line ${o.line}` }));
  const ours = dropAddedCblocks(progOps(prog), theirs);
  const why = pairing(ours, theirs, "the spec", operands);
  if (why) return { mismatch: why };

  const infoLocs = sourceInfoLocs(info, ops, ours, prog);
  const byPc = new Map<number, SrcLine>();
  const subs = new Map<number, string>();
  const byLine = new Map<string, SrcLine>();
  const fileOrder: string[] = [];
  ours.forEach(({ pc }, i) => {
    const { sub } = ops[i];
    const loc = infoLocs?.[i] ?? ops[i].loc;
    if (sub && sub !== ops[i - 1]?.sub) subs.set(pc, sub);
    if (!loc) return;
    const k = `${loc.line}:${loc.file}`;
    let s = byLine.get(k);
    if (!s) {
      byLine.set(k, (s = { ...loc, pcs: [] }));
      if (!fileOrder.includes(loc.file)) fileOrder.push(loc.file);
    } else if ((loc.end ?? loc.line) > (s.end ?? s.line)) {
      // The same line quoted again as a longer range (Puya gives one statement's ops 291-297 and 291-298): the widest.
      s.end = loc.end;
      s.quoted = loc.quoted;
    }
    s.pcs.push(pc);
    byPc.set(pc, s);
  });
  if (isTealscript(teal)) {
    for (const s of byLine.values()) s.part = true;
    // Headers as Puya writes them, `file::name(…)`, so they read as the contract's own code: by the
    // file of the subroutine's first op with a source line, or with none (no sourceInfo lines), the first file.
    let file: string | undefined;
    for (let i = ours.length - 1; i >= 0; i--) {
      const { pc } = ours[i];
      file = byPc.get(pc)?.file ?? file;
      const sub = subs.get(pc);
      if (sub === undefined) continue;
      const f = file ?? fileOrder[0];
      if (f) subs.set(pc, `${f}::${sub}`);
      file = undefined;
    }
  }
  const lines = [...byLine.values()].sort((a, b) => fileOrder.indexOf(a.file) - fileOrder.indexOf(b.file) || a.line - b.line);
  const m: SourceMapping = { byPc, lines, subs, errors: new Map() };
  if (isTealscript(teal)) {
    m.tealscript = true;
    const { frames, returns } = tealscriptFrames(ours, ops, subs);
    if (frames.size) m.frameNames = frames;
    if (returns.size) m.frameReturns = returns;
  }
  return m;
}

// TEALScript's comment on a frame op: the variable and its type, `next: uint64`.
const FRAME_NOTE = /^([A-Za-z_$][\w$]*)\s*:/;

/**
 * Each subroutine's frame slots' names, by its first op's pc (a `subs`
 * key): from its `frame_dig` / `frame_bury` ops' comments. A slot that
 * holds different variables in turn has their names joined with ` / `.
 */
function tealscriptFrames(ours: ProgOp[], ops: TealOp[], subs: Map<number, string>): { frames: Map<number, Map<number, string>>; returns: Set<number> } {
  const frames = new Map<number, Map<number, string>>();
  const returns = new Set<number>();
  let at: number | undefined;
  ours.forEach(({ pc }, i) => {
    const { op, note } = ops[i];
    const name = opName(op);
    // Only a subroutine that starts a frame has one (a route, say, doesn't).
    if (subs.has(pc)) at = name === "proto" ? pc : undefined;
    // `frame_bury 0` with no variable named, then the subroutine's end: its return value, put in slot 0.
    const next = opName(ops[i + 1]?.op);
    if (at !== undefined && !note && name === "frame_bury" && Number(fields(op)[1]) === 0 && (next === "retsub" || next === "popn")) returns.add(pc);
    if (at === undefined || !note || (name !== "frame_dig" && name !== "frame_bury")) return;
    const slot = Number(fields(op)[1]);
    const v = FRAME_NOTE.exec(note);
    if (!Number.isInteger(slot) || !v) return;
    let slots = frames.get(at);
    if (!slots) frames.set(at, (slots = new Map()));
    const had = slots.get(slot);
    if (had === undefined) slots.set(slot, v[1]);
    else if (!had.split(" / ").includes(v[1])) slots.set(slot, `${had} / ${v[1]}`);
  });
  return { frames, returns };
}

/**
 * Each op's source line from `info`'s `source` entries, by the entry's
 * `teal` line where it has one (and the entries' TEAL lines are this TEAL's
 * op lines), else by its pcs; with the text a TEAL comment quotes for that
 * line. Undefined when `info` places fewer than half the ops: it doesn't
 * describe this TEAL.
 */
function sourceInfoLocs(info: ProgramSourceInfo | undefined, ops: TealOp[], ours: ProgOp[], prog: Program): (Loc | undefined)[] | undefined {
  if (!Array.isArray(info?.sourceInfo)) return undefined;
  const off = info.pcOffsetMethod === "cblocks" ? cblocksOffset(prog) : 0;
  const byTeal = new Map<number, string>();
  const byPc = new Map<number, string>();
  // Someone's own file: skip entries that aren't { source: "file:line", teal?: number, pc?: number[] }.
  for (const s of info.sourceInfo as unknown[]) {
    const e = s as { pc?: unknown; teal?: unknown; source?: unknown } | null;
    if (!e || typeof e.source !== "string" || !LOC.test(e.source)) continue;
    if (typeof e.teal === "number") byTeal.set(e.teal, e.source);
    if (Array.isArray(e.pc)) for (const pc of e.pc) if (typeof pc === "number") byPc.set(pc + off, e.source);
  }
  // TEAL lines that mostly aren't ops' (all but the pragma's, say) are another TEAL's: by pcs instead.
  const opLines = new Set(ops.map((o) => o.line));
  if ([...byTeal.keys()].filter((n) => !opLines.has(n)).length * 10 > byTeal.size) byTeal.clear();
  if (!byTeal.size && !byPc.size) return undefined;

  // The comments' quotes by line, the widest range of each.
  const quotes = new Map<string, Loc>();
  for (const { loc } of ops) {
    if (!loc) continue;
    const k = `${loc.line}:${loc.file}`;
    const q = quotes.get(k);
    if (!q || (loc.end ?? loc.line) > (q.end ?? q.line)) quotes.set(k, loc);
  }
  // matchProgram merges a line's locs, keeping the widest range.
  const locOf = (source: string): Loc => {
    const l = LOC.exec(source)!;
    const a = Number(l[2]);
    const b = l[3] ? Number(l[3]) : a;
    return quotes.get(`${a}:${l[1]}`) ?? (b > a ? { file: l[1], line: a, text: "", end: b } : { file: l[1], line: a, text: "" });
  };
  const locs = ops.map((o, i) => {
    const source = byTeal.get(o.line) ?? byPc.get(ours[i].pc);
    return source === undefined ? undefined : locOf(source);
  });
  return locs.filter(Boolean).length * 2 >= ops.length ? locs : undefined;
}

/** The spec's TEAL for a program, decoded from base64, if it has it. */
export function specTeal(spec: Arc56Contract, kind: ProgramKind): string | undefined {
  const b64 = spec.source?.[kind];
  if (!b64) return undefined;
  try {
    return new TextDecoder().decode(b64Bytes(b64));
  } catch {
    return undefined;
  }
}

/** A program's hash as the traces give it: base64 SHA-512/256 of its bytes. */
export function programHash(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...sha512_256.array(bytes)));
}

/**
 * The PC that `cblocks` sourceInfo pcs are offset by, as algokit-utils
 * reckons it: one less than the pc of the first op after the constant blocks
 * at the top of the program, or 0 without them.
 */
function cblocksOffset(prog: Program): number {
  const ops = progOps(prog);
  const i = ops.findIndex((o) => !CBLOCKS.has(o.name));
  return i > 0 ? ops[i].pc - 1 : 0;
}

/** Failure messages by pc from a program's `sourceInfo`, at the program's op pcs only. */
export function sourceErrors(info: ProgramSourceInfo | undefined, prog: Program): Map<number, string> {
  const errors = new Map<number, string>();
  if (!Array.isArray(info?.sourceInfo)) return errors;
  const off = info.pcOffsetMethod === "cblocks" ? cblocksOffset(prog) : 0;
  // Someone's own file: skip entries that aren't { pc: number[], errorMessage: string }.
  for (const s of info.sourceInfo as unknown[]) {
    const e = s as { pc?: unknown; errorMessage?: unknown } | null;
    if (!e || typeof e.errorMessage !== "string" || !e.errorMessage || !Array.isArray(e.pc)) continue;
    for (const pc of e.pc) if (typeof pc === "number" && prog.pcLine.has(pc + off)) errors.set(pc + off, e.errorMessage);
  }
  return errors;
}

/**
 * Pairs a `.puya.map`'s `pc_events` with the program's ops, as matchProgram
 * does the TEAL; the events' pcs must be the program's, give or take one
 * constant shift.
 */
export function matchPuyaMap(
  prog: Program,
  map: PuyaMap,
): { stackOut: Map<number, string[]>; stackIn: Map<number, string[]>; subs: Map<number, string>; errors: Map<number, string> } | Mismatch {
  const events = Object.entries(map?.pc_events ?? {})
    .filter(([pc, e]) => /^\d+$/.test(pc) && e?.op)
    .map(([pc, e]) => ({ ...e, pc: Number(pc) }))
    .sort((a, b) => a.pc - b.pc);
  const theirs = events.map((e) => ({ name: opName(e.op), text: e.op, where: `map pc ${e.pc}` }));
  const ours = dropAddedCblocks(progOps(prog), theirs);
  const why = pairing(ours, theirs, "the .puya.map", true);
  if (why) return { mismatch: why };
  const shift = events.length ? events[0].pc - ours[0].pc : 0;
  const off = events.findIndex((e, i) => e.pc - shift !== ours[i].pc);
  if (off >= 0) return { mismatch: `op ${off + 1} is at pc ${ours[off].pc} in the program, ${events[off].pc} in the .puya.map` };

  // stack_out is sparse: an op without one leaves no names, rather than the
  // last op's carried forward, which would misalign them with the stack.
  const stackOut = new Map<number, string[]>();
  const stackIn = new Map<number, string[]>();
  const subs = new Map<number, string>();
  const errors = new Map<number, string>();
  ours.forEach(({ pc }, i) => {
    const e = events[i];
    if (Array.isArray(e.stack_out)) stackOut.set(pc, e.stack_out);
    if (Array.isArray(e.stack_in)) stackIn.set(pc, e.stack_in);
    if (e.subroutine) subs.set(pc, e.subroutine);
    if (e.error) errors.set(pc, e.error);
  });
  return { stackOut, stackIn, subs, errors };
}

/**
 * Matches a spec (and optionally its `.puya.map`) with one of an app's
 * programs: `kind` says which of the spec's programs to use. With the
 * program's byteCode and no template variables, the program hash decides;
 * otherwise the ops and their literal constants. A `.puya.map` that doesn't
 * fit is left out and its reason given in `mapMismatch`.
 */
export function matchSpec(prog: Program, spec: Arc56Contract, kind: ProgramKind, map?: PuyaMap): SourceMapping | Mismatch {
  const teal = specTeal(spec, kind);
  if (!teal) return { mismatch: `the spec has no ${kind} program TEAL (source.${kind})` };
  const code = spec.byteCode?.[kind];
  let exact = false;
  if (code && !Object.keys(spec.templateVariables ?? {}).length) {
    let hash: string | undefined;
    try {
      hash = programHash(b64Bytes(code));
    } catch {
      // Unreadable byteCode: match by the TEAL alone.
    }
    if (hash && hash !== prog.hash) return { mismatch: "the spec's byteCode is a different program" };
    exact = hash !== undefined;
  }
  const m = matchProgram(prog, teal, !exact, spec.sourceInfo?.[kind]);
  if ("mismatch" in m) return m;
  if (exact) m.exact = true;
  m.errors = sourceErrors(spec.sourceInfo?.[kind], prog);
  if (map) {
    const r = matchPuyaMap(prog, map);
    if ("mismatch" in r) m.mapMismatch = r.mismatch;
    else {
      m.stackOut = r.stackOut;
      m.stackIn = r.stackIn;
      if (!m.subs.size) m.subs = r.subs;
      for (const [pc, e] of r.errors) if (!m.errors.has(pc)) m.errors.set(pc, e);
    }
  }
  return m;
}
