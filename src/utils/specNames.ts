import { ABIAddressType, ABIArrayDynamicType, ABIArrayStaticType, ABITupleType, ABIType } from "algosdk";
import {
  getABIDecodedValue,
  getABIStructFromABITuple,
  getABITupleTypeFromABIStructDefinition,
  type Arc56Contract,
  type Method,
  type StorageKey,
  type StorageMap,
  type StructField,
} from "@algorandfoundation/algokit-utils/types/app-arc56";
import { sha512_256 } from "js-sha512";
import type { SourceMapping } from "./arc56Source";
import { lineText, opName, type Frame } from "./traceStepper";
import type { AvmValue } from "./txnDevInfo";

/**
 * Names from an app's ARC-56 spec for what the TEAL view leaves anonymous:
 * the ABI method a run was called with, subroutines, failure messages, state
 * keys and their values, and logged events and return values. Every decode
 * is guarded: anything the spec doesn't fit gives undefined, and the caller
 * keeps the raw view.
 */

const hex = (b: ArrayLike<number>) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const b64Bytes = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const selectorOf = (sig: string) => hex(sha512_256.array(sig).slice(0, 4));
const startsWith = (u: Uint8Array, p: Uint8Array) => p.length <= u.length && p.every((b, i) => u[i] === b);
const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && startsWith(a, b);

/** Base64 as hex; "" for base64 that doesn't read. */
export function b64Hex(s: string): string {
  try {
    return hex(b64Bytes(s));
  } catch {
    return "";
  }
}

/** The ARC-4 return log's prefix. */
export const RETURN_PREFIX = "151f7c75";

// ---------------------------------------------------------------------------
// Text for decoded values

type Structs = Record<string, StructField[]>;
/** An ARC-56 type: an ABI type, an AVM type, a struct's name, or (inside a struct) its fields. */
type SpecType = string | StructField[];

const printable = (u: Uint8Array) => u.length > 0 && u.every((b) => b >= 0x20 && b < 0x7f);
const bytesText = (u: Uint8Array) => (printable(u) ? JSON.stringify(new TextDecoder().decode(u)) : `0x${hex(u)}`);

/** An address, short: its first 6 and last 4 characters. */
export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** A value as text without its type: numbers as they are, strings quoted, bytes as text or hex, arrays in [], objects in {}. */
function plainText(v: unknown): string {
  if (typeof v === "bigint" || typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "string") return JSON.stringify(v);
  if (v instanceof Uint8Array) return bytesText(v);
  if (Array.isArray(v)) return `[${v.map(plainText).join(", ")}]`;
  if (v && typeof v === "object") {
    return `{${Object.entries(v)
      .map(([k, x]) => `${k}: ${plainText(x)}`)
      .join(", ")}}`;
  }
  return String(v);
}

/**
 * A decoded value (as getABIDecodedValue gives it) as text, by its spec
 * type: an `address` bare (short with `short`), strings quoted, bytes as text
 * where printable else hex, arrays and tuples in [], structs in {}.
 */
export function valueText(v: unknown, type?: SpecType, structs: Structs = {}, short = false): string {
  const sub = (x: unknown, t?: SpecType) => valueText(x, t, structs, short);
  const fields = Array.isArray(type) ? type : type && structs[type];
  if (fields) {
    if (!v || typeof v !== "object" || Array.isArray(v) || v instanceof Uint8Array) return plainText(v);
    const o = v as Record<string, unknown>;
    return `{${fields.map((f) => `${f.name}: ${sub(o[f.name], f.type)}`).join(", ")}}`;
  }
  if (typeof type !== "string" || type === "AVMString" || type === "AVMUint64") return plainText(v);
  if (type === "AVMBytes") return v instanceof Uint8Array ? bytesText(v) : plainText(v);
  let abi: ABIType;
  try {
    abi = ABIType.from(type);
  } catch {
    return plainText(v);
  }
  if (abi instanceof ABIAddressType && typeof v === "string") return short ? shortAddress(v) : v;
  if ((abi instanceof ABIArrayStaticType || abi instanceof ABIArrayDynamicType) && Array.isArray(v)) {
    const child = abi.childType.toString();
    return `[${v.map((x) => sub(x, child)).join(", ")}]`;
  }
  if (abi instanceof ABITupleType && Array.isArray(v)) return `[${v.map((x, i) => sub(x, abi.childTypes[i]?.toString())).join(", ")}]`;
  return plainText(v);
}

/** The ABI type of an ABI type string or a struct's name. */
const abiTypeOf = (type: string, structs: Structs): ABIType =>
  structs[type] ? getABITupleTypeFromABIStructDefinition(structs[type], structs) : ABIType.from(type);

/**
 * Whether `u` is exactly one value of ABI type (or struct) `type`: it
 * decodes, and encodes back to as many bytes (no bytes between a tuple's
 * head and tail, or after it).
 */
function exactly(u: Uint8Array, type: string, structs: Structs): boolean {
  try {
    const t = abiTypeOf(type, structs);
    return t.encode(t.decode(u)).length === u.length;
  } catch {
    return false;
  }
}

/** Big-endian bytes as an integer. */
const beInt = (u: Uint8Array) => u.reduce((n, b) => (n << 8n) | BigInt(b), 0n);

// ---------------------------------------------------------------------------
// Methods

export type MethodName = {
  /** `name(arg types)`, as a run is labelled. */
  label: string;
  /** The ARC-4 signature: `name(arg types)return type`. */
  signature: string;
  method: Method;
};

const methodCache = new WeakMap<Arc56Contract, Map<string, MethodName>>();

/** The spec's methods by selector (hex). */
export function methodsBySelector(spec: Arc56Contract): Map<string, MethodName> {
  let m = methodCache.get(spec);
  if (m) return m;
  m = new Map();
  for (const method of Array.isArray(spec.methods) ? spec.methods : []) {
    try {
      const label = `${method.name}(${method.args.map((a) => a.type).join(",")})`;
      const signature = `${label}${method.returns?.type ?? "void"}`;
      m.set(selectorOf(signature), { label, signature, method });
    } catch {
      // A malformed method: left out.
    }
  }
  methodCache.set(spec, m);
  return m;
}

/** The method whose selector `arg0` (the first app arg) is; undefined for none (a bare call, or another method). */
export function methodOf(spec: Arc56Contract, arg0: Uint8Array | undefined): MethodName | undefined {
  if (!arg0 || arg0.length !== 4) return undefined;
  return methodsBySelector(spec).get(hex(arg0));
}

const ARG0 = /^txna?\s+ApplicationArgs\s+0\s*(\/\/.*)?$/;

/**
 * A run's first app arg, as the trace shows it: the value its first
 * `txna ApplicationArgs 0` pushed. Undefined if the run never read it.
 */
export function runArg0(f: Frame): Uint8Array | undefined {
  if (!f.prog || f.prog.synthetic) return undefined;
  for (const s of f.steps) {
    const t = lineText(f.prog, Number(s.pc));
    if (t === undefined || !ARG0.test(t.trim())) continue;
    const v = s["stack-additions"]?.[0];
    // Not recorded here (an op the trace left without its push): try the next read.
    if (!v || v.type !== 1) continue;
    try {
      return b64Bytes(v.bytes ?? "");
    } catch {
      continue;
    }
  }
  return undefined;
}

/** The ABI method an approval run was called with, from its spec. */
export function runMethod(f: Frame, spec: Arc56Contract | undefined): MethodName | undefined {
  if (!spec || f.kind !== "approval") return undefined;
  return methodOf(spec, runArg0(f));
}

// ---------------------------------------------------------------------------
// Subroutines and failures

/**
 * A subroutine's short name from its Puya header (`file::Class.name(params) -> ret`)
 * or a `.puya.map`'s `subroutine` (`file::Class.name`): `name`.
 */
export function shortSub(full: string): string {
  const at = full.indexOf("::");
  let s = at >= 0 ? full.slice(at + 2) : full;
  const p = s.indexOf("(");
  if (p >= 0) s = s.slice(0, p);
  // `Class.name[routing]`: the method's name.
  s = s.replace(/\[.*$/, "").trim();
  const dot = s.lastIndexOf(".");
  return (dot >= 0 ? s.slice(dot + 1) : s) || full;
}

/** The subroutine a callsub at op `step` of `f` went to: its short name and full header. */
export function calledSub(map: SourceMapping | undefined, f: Frame, step: number): { short: string; full: string } | undefined {
  const next = f.steps[step + 1];
  const full = next && map?.subs.get(Number(next.pc));
  return full ? { short: shortSub(full), full } : undefined;
}

export type Failure = "fails" | "passes" | "may fail";

/**
 * Whether an op fails, given the top of the stack before it: `err` does;
 * `assert` does on a zero, or on bytes (the AVM rejects them), and passes on
 * any other integer; without the top, or for any other op, it may.
 */
export function opFailure(text: string | undefined, top: AvmValue | undefined): Failure {
  const op = opName(text);
  if (op === "err") return "fails";
  if (op === "assert" && top) {
    if (top.type !== 2) return "fails";
    return BigInt(top.uint ?? 0) ? "passes" : "fails";
  }
  return "may fail";
}

/** The failure message an op has in the spec (sourceInfo, or the .puya.map's `error`), with whether it fails here. */
export function failHint(
  map: SourceMapping | undefined,
  pc: number,
  text: string | undefined,
  top: AvmValue | undefined,
): { message: string; failure: Failure } | undefined {
  const message = map?.errors.get(pc);
  return message ? { message, failure: opFailure(text, top) } : undefined;
}

/**
 * Why a run failed, from the spec: the message of its last op, when the run
 * failed there. It failed there if that op fails (an `err`, an `assert` of
 * zero or bytes), or if the trace says it was rolled back (a clear state
 * program) and that op didn't pass.
 */
export function failureReason(
  map: SourceMapping | undefined,
  f: Pick<Frame, "steps" | "prog" | "rollback">,
  topBeforeLast: AvmValue | undefined,
): { message: string; pc: number } | undefined {
  const last = f.steps[f.steps.length - 1];
  if (!map || !last) return undefined;
  const pc = Number(last.pc);
  const message = map.errors.get(pc);
  if (!message) return undefined;
  const how = opFailure(lineText(f.prog, pc), topBeforeLast);
  const failed = how === "fails" || (!!f.rollback && how !== "passes");
  return failed ? { message, pc } : undefined;
}

// ---------------------------------------------------------------------------
// State keys and values

export type StateType = "g" | "l" | "b";
const STATE: Record<StateType, "global" | "local" | "box"> = { g: "global", l: "local", b: "box" };

export type KeyName = {
  /** `name`, or `map[key]` with the key decoded (an address short). */
  name: string;
  /** The same with the key in full. */
  full: string;
  valueType: string;
  desc?: string;
};

/** A key's bytes decoded as `type`; throws where they aren't exactly one value of it. */
function decodeKey(u: Uint8Array, type: string, structs: Structs): unknown {
  if (type === "AVMBytes") return u;
  if (type === "AVMString") return new TextDecoder("utf-8", { fatal: true }).decode(u);
  if (type === "AVMUint64") {
    if (u.length !== 8) throw new Error("not 8 bytes");
    return beInt(u);
  }
  if (!exactly(u, type, structs)) throw new Error(`not one ${type}`);
  return getABIDecodedValue(u, type, structs);
}

/**
 * A state key's name from the spec: an exact `state.keys` entry, else the
 * `state.maps` entry with the longest prefix the key starts with whose key
 * type the rest is exactly one value of, shown `map[key]`. A map with no
 * prefix and raw bytes keys takes any key: the last resort.
 */
export function keyName(spec: Arc56Contract | undefined, type: StateType, keyB64: string): KeyName | undefined {
  if (!spec?.state) return undefined;
  let u: Uint8Array;
  try {
    u = b64Bytes(keyB64);
  } catch {
    return undefined;
  }
  const keys = (spec.state.keys?.[STATE[type]] ?? {}) as Record<string, StorageKey>;
  for (const [name, k] of Object.entries(keys)) {
    try {
      if (typeof k?.key === "string" && sameBytes(b64Bytes(k.key), u)) return { name, full: name, valueType: k.valueType, desc: k.desc };
    } catch {
      // An unreadable key in the spec: not this one.
    }
  }
  const structs = spec.structs ?? {};
  const maps = Object.entries((spec.state.maps?.[STATE[type]] ?? {}) as Record<string, StorageMap>).flatMap(([name, m]) => {
    try {
      return [{ name, m, prefix: b64Bytes(m.prefix ?? "") }];
    } catch {
      return [];
    }
  });
  maps.sort((a, b) => b.prefix.length - a.prefix.length);
  for (const { name, m, prefix } of maps) {
    if (!startsWith(u, prefix)) continue;
    try {
      const k = decodeKey(u.slice(prefix.length), m.keyType, structs);
      return { name: `${name}[${valueText(k, m.keyType, structs, true)}]`, full: `${name}[${valueText(k, m.keyType, structs)}]`, valueType: m.valueType, desc: m.desc };
    } catch {
      // Not this map's key type: try the next.
    }
  }
  return undefined;
}

/**
 * A state value decoded as its spec type: text, or undefined where decoding
 * adds nothing to the raw view (raw bytes, an integer stored as one) or the
 * value doesn't fit the type. An `AVMUint64` stored as bytes (a box's) is
 * their big-endian integer.
 */
export function decodeValue(spec: Arc56Contract | undefined, type: string | undefined, v: AvmValue | undefined): string | undefined {
  if (!spec || !type || !v || type === "AVMBytes") return undefined;
  if (v.type === 2) return undefined;
  try {
    const u = b64Bytes(v.bytes ?? "");
    if (type === "AVMString") return JSON.stringify(new TextDecoder("utf-8", { fatal: true }).decode(u));
    if (type === "AVMUint64") return u.length === 8 ? beInt(u).toString() : undefined;
    const structs = spec.structs ?? {};
    return valueText(getABIDecodedValue(u, type, structs), type, structs);
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Logs: events and return values

export type LogName = { kind: "event" | "return"; name: string; text: string };

/** Decodes `u` as a tuple of `args` (none: no bytes), structs named, byte arrays as bytes. */
function decodeArgs(spec: Arc56Contract, args: { type: string; name?: string; struct?: string }[], u: Uint8Array): string {
  if (!args.length) {
    if (u.length) throw new Error("bytes after an event without arguments");
    return "";
  }
  const structs = spec.structs ?? {};
  const vals = getABIDecodedValue(u, `(${args.map((a) => a.type).join(",")})`, {}) as unknown[];
  return args
    .map((a, i) => {
      const struct = a.struct && structs[a.struct] ? a.struct : undefined;
      const v = struct ? getABIStructFromABITuple(vals[i] as never, structs[struct], structs) : vals[i];
      return `${a.name ? `${a.name}: ` : ""}${valueText(v, struct ?? a.type, structs)}`;
    })
    .join(", ");
}

/**
 * A logged value named from the spec: an ARC-28 event whose selector it
 * starts with, decoded; or, with the run's method, its ARC-4 return value.
 */
export function decodeLog(spec: Arc56Contract | undefined, method: MethodName | undefined, v: AvmValue | undefined): LogName | undefined {
  if (!spec || !v || v.type !== 1) return undefined;
  let u: Uint8Array;
  try {
    u = b64Bytes(v.bytes ?? "");
  } catch {
    return undefined;
  }
  if (u.length < 4) return undefined;
  const sel = hex(u.slice(0, 4));
  const body = u.slice(4);
  for (const e of Array.isArray(spec.events) ? spec.events : []) {
    try {
      if (selectorOf(`${e.name}(${e.args.map((a) => a.type).join(",")})`) !== sel) continue;
      return { kind: "event", name: e.name, text: decodeArgs(spec, e.args, body) };
    } catch {
      // Doesn't decode as this event.
    }
  }
  const ret = method?.method.returns;
  if (sel === RETURN_PREFIX && ret && ret.type !== "void") {
    try {
      const type = ret.struct ?? ret.type;
      const structs = spec.structs ?? {};
      return { kind: "return", name: method.label, text: valueText(getABIDecodedValue(body, type, structs), type, structs) };
    } catch {
      // Not the method's return type.
    }
  }
  return undefined;
}
