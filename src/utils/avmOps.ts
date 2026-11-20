import type { AvmValue, TraceStep } from "./txnDevInfo";

/**
 * The AVM opcode reference (src/data/avmOps.json, made by scripts/gen-avm-ops.mjs
 * from puya-ts's langspec), and what an op of a trace took and gave: its
 * stack inputs and outputs under the names its doc uses (A, B… and X, Y…).
 */

/** [name, type], as the doc names it: A, B… in, X, Y… out. */
export type StackArg = [string, string];
/** [name, immediate type, doc, field table, the input or output whose type the field sets]. */
export type Immediate = [string, string, string, string?, ["in" | "out", number]?];
export type AvmOp = {
  in: StackArg[];
  out: StackArg[];
  imm: Immediate[];
  doc: string;
  extra?: string;
  cost: string;
  /** The AVM version that added it. */
  v: number;
  /** Where it can run: anywhere, apps only, or logic sigs only. */
  mode: "any" | "app" | "sig";
  group: string;
  halts?: boolean;
};
/** [type, doc, version, mode]. */
export type FieldInfo = [string, string, number, string];
export type AvmOps = { ops: Record<string, AvmOp>; enums: Record<string, Record<string, FieldInfo>> };

/** The newest AVM version the reference describes: its costs are that version's. */
export const AVM_LATEST = 14;

let cache: AvmOps | undefined;
let loading: Promise<AvmOps> | undefined;

/** The reference, once loaded (it's a separate chunk). */
export const avmOpsLoaded = () => cache;

export function loadAvmOps(): Promise<AvmOps> {
  loading ??= import("src/data/avmOps.json").then(
    (m) => (cache = (m.default ?? m) as unknown as AvmOps),
    (e) => {
      // Asked again, it tries again (a chunk can go missing after a deploy).
      loading = undefined;
      throw e;
    },
  );
  return loading;
}

/** A disassembly line's op and immediates, without its comment. */
export function parseLine(text: string | undefined): { name: string; imms: string[] } {
  let body = text ?? "";
  if (/^\s*\/\//.test(body)) return { name: "", imms: [] };
  const ci = body.indexOf(" //");
  if (ci >= 0) body = body.slice(0, ci);
  const [name = "", ...imms] = body.trim().split(/\s+/);
  return { name, imms };
}

export type Field = { imm: string; table: string; name: string; type: string; doc: string; v: number };
export type OpDesc = {
  name: string;
  op: AvmOp;
  /** Stack inputs and outputs, with the types the line's field gives them. */
  in: StackArg[];
  out: StackArg[];
  /** The fields its immediates name (txn's F, ecdsa_verify's V…). */
  fields: Field[];
  /** The cost, for the line's field where it depends on one. */
  cost: string;
};

/** What `ops` says about a disassembly line's op; undefined for a label, a pragma, or an op it doesn't know. */
export function describe(ops: AvmOps, text: string | undefined): OpDesc | undefined {
  const { name, imms } = parseLine(text);
  const op = ops.ops[name];
  if (!op) return undefined;
  const ins = op.in.map((a) => [...a] as StackArg);
  const outs = op.out.map((a) => [...a] as StackArg);
  const fields: Field[] = [];
  op.imm.forEach(([imm, , , table, mod], k) => {
    const v = imms[k];
    const f = table && v !== undefined ? ops.enums[table]?.[v] : undefined;
    if (!table || !f) return;
    fields.push({ imm, table, name: v, type: f[0], doc: f[1], v: f[2] });
    const arg = mod && (mod[0] === "in" ? ins : outs)[mod[1]];
    if (arg && f[0] !== "none") arg[1] = f[0];
  });
  return { name, op, in: ins, out: outs, fields, cost: costFor(op.cost, fields) };
}

/** "Secp256k1=1700; Secp256r1=2500" → "1700" for a line on Secp256k1. */
function costFor(cost: string, fields: Field[]): string {
  const parts = cost.split(/;\s*/);
  if (parts.length < 2) return cost;
  for (const f of fields) {
    const p = parts.find((x) => x.startsWith(`${f.name}=`));
    if (p) return p.slice(f.name.length + 1);
  }
  return cost;
}

/** `A: uint64, B: uint64 → X: uint64`; empty for an op the spec gives no stack effect. */
export function signature(d: Pick<OpDesc, "in" | "out">): string {
  if (!d.in.length && !d.out.length) return "";
  const side = (xs: StackArg[]) => xs.map(([n, t]) => `${n}: ${t}`).join(", ");
  return [side(d.in), "→", side(d.out)].filter(Boolean).join(" ");
}

/**
 * Ops whose spec models deeper stack slots (or a variable count) as inputs
 * and outputs: what the trace says they took and gave doesn't line up with
 * the spec's names, so their values are shown unnamed.
 */
const POSITIONAL = new Set(["cover", "uncover", "dig", "dupn", "bury", "popn", "frame_bury", "proto", "retsub", "callsub", "match", "pushints", "pushbytess"]);

/** Pairs of uint64s that are one 128-bit number (high, low), by op: input and output indexes. */
const WIDE: Record<string, { in?: [number, number][]; out?: [number, number][] }> = {
  addw: { out: [[0, 1]] },
  mulw: { out: [[0, 1]] },
  expw: { out: [[0, 1]] },
  divw: { in: [[0, 1]] },
  divmodw: { in: [[0, 1], [2, 3]], out: [[0, 1], [2, 3]] },
};

export type IOValue = { name?: string; type?: string; v: AvmValue };
export type Wide = { names: string; value: bigint };
export type OpIO = {
  inputs: IOValue[];
  outputs: IOValue[];
  /** 128-bit numbers made of two of the inputs or outputs. */
  wideIn: Wide[];
  wideOut: Wide[];
  /** The spec gives it outputs but the trace has none, and it's the run's last op: it failed. */
  failed: boolean;
};

const wides = (pairs: [number, number][] | undefined, xs: IOValue[]): Wide[] =>
  (pairs ?? []).flatMap(([h, l]) => {
    const a = xs[h];
    const b = xs[l];
    if (!a?.name || !b?.name || a.v.type !== 2 || b.v.type !== 2) return [];
    return [{ names: `${a.name},${b.name}`, value: (BigInt(a.v.uint ?? 0) << 64n) | BigInt(b.v.uint ?? 0) }];
  });

/**
 * What op `s` took from the stack (`stack` is the stack before it) and what it
 * gave, named as its doc names them where the trace's counts match the spec.
 * `restated`: the trace's additions are to be ignored (itxn_submit, see isRestated).
 */
export function opIO(d: OpDesc | undefined, stack: AvmValue[], s: TraceStep, opts: { restated?: boolean; last?: boolean } = {}): OpIO {
  const pops = Math.min(Number(s["stack-pop-count"] ?? 0), stack.length);
  const taken = stack.slice(stack.length - pops);
  const given = opts.restated ? [] : s["stack-additions"] ?? [];
  const named = d && !POSITIONAL.has(d.name);
  const inNames = named && d.in.length === taken.length ? d.in : undefined;
  const outNames = named && d.out.length === given.length ? d.out : undefined;
  const inputs = taken.map((v, k) => ({ name: inNames?.[k][0], type: inNames?.[k][1], v }));
  const outputs = given.map((v, k) => ({ name: outNames?.[k][0], type: outNames?.[k][1], v }));
  const failed = !!opts.last && !!d && !d.op.halts && d.out.length > 0 && !given.length && !opts.restated;
  return {
    inputs,
    outputs,
    wideIn: d ? wides(WIDE[d.name]?.in, inputs) : [],
    wideOut: d ? wides(WIDE[d.name]?.out, outputs) : [],
    failed,
  };
}

/**
 * The names the next op gives the values it takes from the stack, by stack
 * index, for the stack panel: A at the deepest. Empty where the trace's count
 * doesn't match the spec.
 */
export function popNames(d: OpDesc | undefined, stackLen: number, s: TraceStep | undefined): Map<number, string> {
  const m = new Map<number, string>();
  if (!d || !s || POSITIONAL.has(d.name)) return m;
  const pops = Number(s["stack-pop-count"] ?? 0);
  if (pops !== d.in.length || pops > stackLen) return m;
  d.in.forEach(([n], k) => m.set(stackLen - pops + k, n));
  return m;
}

/** "apps only" / "logic sigs only", where it can't run in both. */
export const modeText = (mode: string) => (mode === "app" ? "apps only" : mode === "sig" ? "logic sigs only" : "");
