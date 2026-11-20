import { readFileSync } from "node:fs";
import { ABIMethod, ABIType, encodeAddress } from "algosdk";
import type { Arc56Contract } from "@algorandfoundation/algokit-utils/types/app-arc56";
import { sha512_256 } from "js-sha512";
import { describe, expect, it } from "vitest";
import { matchSpec } from "./arc56Source";
import {
  calledSub,
  decodeLog,
  decodeValue,
  failHint,
  failureReason,
  keyName,
  methodOf,
  methodsBySelector,
  runArg0,
  runMethod,
  shortSub,
  valueText,
} from "./specNames";
import type { Frame, Program } from "./traceStepper";
import type { AvmValue, TraceStep } from "./txnDevInfo";

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8"));
const escreg: Arc56Contract = fixture("Escreg.arc56.json");
const timeSeek: Arc56Contract = fixture("TimeSeek.arc56.json");

const b64 = (u: Uint8Array | number[]) => Buffer.from(Uint8Array.from(u)).toString("base64");
const bytesV = (u: Uint8Array | number[]): AvmValue => ({ type: 1, bytes: b64(u) });
const uintV = (n: number): AvmValue => ({ type: 2, uint: n });
const cat = (...xs: (Uint8Array | number[])[]) => Uint8Array.from(xs.flatMap((x) => Array.from(x)));

const escregProg = (): Program => {
  const p = fixture("Escreg.approval.disassembly.json");
  return { hash: p.hash, lines: p.lines, pcLine: new Map(p.lines.flatMap((l: { pc?: number }, i: number) => (l.pc === undefined ? [] : [[l.pc, i]]))) };
};
const prog = escregProg();
const mapping = (() => {
  const m = matchSpec(prog, escreg, "approval");
  if ("mismatch" in m) throw new Error(m.mismatch);
  return m;
})();

/** A run of Escreg's approval program over `steps`. */
const frame = (steps: TraceStep[], extra: Partial<Frame> = {}): Frame => ({ kind: "approval", steps, prog, hash: prog.hash, ...extra }) as Frame;

const selector = (sig: string) => ABIMethod.fromSignature(sig).getSelector();
const addr = (n: number) => new Uint8Array(32).fill(n);

describe("methods", () => {
  it("has every method by its ARC-4 selector", () => {
    const m = methodsBySelector(escreg);
    expect(m.size).toBe(escreg.methods.length);
    expect(methodOf(escreg, selector("getWithAuthList(address[])(uint64,uint64)[]"))?.label).toBe("getWithAuthList(address[])");
    expect(methodOf(escreg, selector("depositCredits(address,pay)void"))?.signature).toBe("depositCredits(address,pay)void");
    expect(methodOf(timeSeek, selector("roundAt(uint64,uint64)(uint64,uint64,uint64,uint64)"))?.label).toBe("roundAt(uint64,uint64)");
  });

  it("finds no method for another selector, a bare call or a longer arg", () => {
    expect(methodOf(escreg, Uint8Array.of(1, 2, 3, 4))).toBeUndefined();
    expect(methodOf(escreg, undefined)).toBeUndefined();
    expect(methodOf(escreg, cat(selector("register(uint64)void"), [0]))).toBeUndefined();
  });

  it("reads a run's first app arg from its txna ApplicationArgs 0, and names the method", () => {
    // From a localnet trace: the op-up call's arg 0 (increaseBudget).
    const f = frame([{ pc: 75, "stack-additions": [uintV(1006)] }, { pc: 83 }, { pc: 157, "stack-additions": [{ type: 1, bytes: "QRjsvw==" }] }]);
    expect(Array.from(runArg0(f) ?? [])).toEqual([0x41, 0x18, 0xec, 0xbf]);
    expect(runMethod(f, escreg)?.label).toBe("increaseBudget(uint64)");
    // No spec, a clear run, or a run that never read arg 0: nothing.
    expect(runMethod(f, undefined)).toBeUndefined();
    expect(runMethod({ ...f, kind: "clear" }, escreg)).toBeUndefined();
    expect(runMethod(frame([{ pc: 75 }]), escreg)).toBeUndefined();
  });
});

describe("subroutines", () => {
  it("shortens Puya headers and .puya.map names", () => {
    expect(shortSub("smart_contracts/escreg/contract.algo.ts::Escreg.deriveAddrPrefix(appId: uint64) -> bytes")).toBe("deriveAddrPrefix");
    expect(shortSub("smart_contracts/escreg/contract.algo.ts::Escreg.register[routing]() -> void")).toBe("register");
    expect(shortSub("smart_contracts/escreg/contract.algo.ts::Escreg.get[routing]")).toBe("get");
    expect(shortSub("contracts/time_seek/contract.algo.ts::timestampAt(at: uint64, home: uint64, round: uint64) -> bytes")).toBe("timestampAt");
    expect(shortSub("puya-ts::itoa(i: uint64) -> bytes")).toBe("itoa");
    expect(shortSub("smart_contracts/escreg/contract.algo.ts::Escreg.lookup")).toBe("lookup");
    expect(shortSub("plain")).toBe("plain");
  });

  it("shortens TEALScript headers", () => {
    expect(shortSub("contracts/counter.algo.ts::add(by: uint64): uint64")).toBe("add");
    expect(shortSub("contracts/counter.algo.ts::add[routing](uint64)uint64")).toBe("add");
    expect(shortSub("contracts/counter.algo.ts::call_NoOp")).toBe("call_NoOp");
  });

  it("names a callsub's subroutine from the op it went to", () => {
    // pc 218 is `callsub label15`; the op after it is the subroutine's first.
    const at = prog.lines.findIndex((l) => l.text === "label15:");
    const target = prog.lines.slice(at).find((l) => l.pc !== undefined)!.pc!;
    const full = mapping.subs.get(target);
    expect(full).toMatch(/::/);
    const f = frame([{ pc: 218 }, { pc: target }]);
    expect(calledSub(mapping, f, 0)).toEqual({ short: shortSub(full!), full });
    // The last op, or without a mapping: nothing.
    expect(calledSub(mapping, f, 1)).toBeUndefined();
    expect(calledSub(undefined, f, 0)).toBeUndefined();
  });
});

describe("failure messages", () => {
  it("gives sourceInfo's message, and whether the op fails there", () => {
    // pc 423: `err` after loggedAssert's log (ERR:404); pc 245: `assert` (account funded).
    expect(failHint(mapping, 423, "err", undefined)).toEqual({ message: "ERR:404", failure: "fails" });
    expect(failHint(mapping, 245, "assert", uintV(0))).toEqual({ message: "account funded", failure: "fails" });
    expect(failHint(mapping, 245, "assert", uintV(1))).toEqual({ message: "account funded", failure: "passes" });
    expect(failHint(mapping, 303, "extract 2 0", undefined)?.failure).toBe("may fail");
    // assert on bytes: the AVM rejects it; with no top recorded, it may fail.
    expect(failHint(mapping, 245, "assert", bytesV([1]))?.failure).toBe("fails");
    expect(failHint(mapping, 245, "assert", undefined)?.failure).toBe("may fail");
    expect(failHint(mapping, 157, "txna ApplicationArgs 0", undefined)).toBeUndefined();
  });

  it("gives a failed run's reason from its last op", () => {
    expect(failureReason(mapping, frame([{ pc: 75 }, { pc: 423 }]), undefined)).toEqual({ message: "ERR:404", pc: 423 });
    expect(failureReason(mapping, frame([{ pc: 75 }, { pc: 245 }]), uintV(0))).toEqual({ message: "account funded", pc: 245 });
    // A passing assert last (the run went on to approve) is no failure.
    expect(failureReason(mapping, frame([{ pc: 75 }, { pc: 245 }]), uintV(1))).toBeUndefined();
    // Rolled back (a clear state program): whatever its last op, its message.
    expect(failureReason(mapping, frame([{ pc: 303 }], { rollback: "logic eval error" }), undefined)).toEqual({ message: "invalid array length header", pc: 303 });
    // Rolled back, but its last op passed (an assert of 1): the failure was elsewhere, not this message.
    expect(failureReason(mapping, frame([{ pc: 245 }], { rollback: "x" }), uintV(1))).toBeUndefined();
    // A last op without a message, or no mapping: no reason.
    expect(failureReason(mapping, frame([{ pc: 75 }], { rollback: "x" }), undefined)).toBeUndefined();
    expect(failureReason(undefined, frame([{ pc: 423 }]), undefined)).toBeUndefined();
  });
});

describe("state keys and values", () => {
  it("names a global key from state.keys", () => {
    expect(keyName(escreg, "g", b64(new TextEncoder().encode("counter")))).toMatchObject({ name: "counter", valueType: "AVMUint64" });
    // Not a local or box key, and an unknown key has no name.
    expect(keyName(escreg, "l", b64(new TextEncoder().encode("counter")))).toBeUndefined();
    expect(keyName(escreg, "g", b64(new TextEncoder().encode("other")))).toBeUndefined();
    expect(keyName(undefined, "g", "Y291bnRlcg==")).toBeUndefined();
  });

  it("names a map's key by prefix, decoding the rest as its key type", () => {
    const a = encodeAddress(addr(7));
    // userCredits: prefix "c", address key.
    expect(keyName(escreg, "b", b64(cat([0x63], addr(7))))).toEqual({
      name: `userCredits[${a.slice(0, 6)}…${a.slice(-4)}]`,
      full: `userCredits[${a}]`,
      valueType: "uint64",
      desc: undefined,
    });
    // apps: no prefix, raw bytes key; a "c" key that isn't 33 bytes is an apps bucket.
    expect(keyName(escreg, "b", b64([0xde, 0xad, 0xbe, 0xef]))?.name).toBe("apps[0xdeadbeef]");
    expect(keyName(escreg, "b", b64([0x63, 1, 2, 3]))?.name).toBe("apps[0x63010203]");
    expect(keyName(escreg, "b", b64(new TextEncoder().encode("abcd")))?.name).toBe('apps["abcd"]');
  });

  // A spec with local keys and maps, a dynamic key type, and no catch-all.
  const local: Arc56Contract = {
    ...escreg,
    state: {
      ...escreg.state,
      keys: { global: {}, box: {}, local: { score: { keyType: "AVMString", valueType: "uint64", key: b64(new TextEncoder().encode("s")) } } },
      maps: {
        global: {},
        box: { names: { keyType: "(uint64,string)", valueType: "AVMUint64", prefix: b64([0x6e]) } },
        local: { votes: { keyType: "uint64", valueType: "bool", prefix: b64([0x76]) } },
      },
    },
  };

  it("names local keys and maps, apart from global and box ones", () => {
    expect(keyName(local, "l", b64([0x73]))?.name).toBe("score");
    expect(keyName(local, "g", b64([0x73]))).toBeUndefined();
    expect(keyName(local, "l", b64(cat([0x76], ABIType.from("uint64").encode(5)))))?.toMatchObject({ name: "votes[5]", valueType: "bool" });
    expect(decodeValue(local, "bool", bytesV([0x80]))).toBe("true");
    // Not a uint64 after the prefix: no map, and no catch-all here.
    expect(keyName(local, "l", b64([0x76, 1, 2]))).toBeUndefined();
  });

  it("takes a dynamic key only if it is exactly one value, no bytes left over", () => {
    const one = ABIType.from("(uint64,string)").encode([1, "a"]);
    expect(keyName(local, "b", b64(cat([0x6e], one)))?.name).toBe('names[[1, "a"]]');
    expect(keyName(local, "b", b64(cat([0x6e], one, [0])))).toBeUndefined();
    // The string's offset skips two bytes: it decodes, but isn't how the value encodes.
    expect(keyName(local, "b", b64(cat([0x6e], [0, 0, 0, 0, 0, 0, 0, 1, 0, 12, 255, 255, 0, 1, 97])))).toBeUndefined();
  });

  it("decodes values with their ABI type and structs, else leaves them raw", () => {
    const u64 = (n: number) => ABIType.from("uint64").encode(n);
    expect(decodeValue(escreg, "uint64", bytesV(u64(2_000_000)))).toBe("2000000");
    // A uint already shows as one; raw bytes stay raw; a value of the wrong size isn't the type.
    expect(decodeValue(escreg, "AVMUint64", uintV(9))).toBeUndefined();
    // An AVMUint64 box value: 8 bytes, big-endian.
    expect(decodeValue(escreg, "AVMUint64", bytesV(u64(2_000_000)))).toBe("2000000");
    expect(decodeValue(escreg, "AVMUint64", bytesV([1, 2]))).toBeUndefined();
    expect(decodeValue(escreg, "AVMBytes", bytesV([1, 2]))).toBeUndefined();
    expect(decodeValue(escreg, "uint64", bytesV([1, 2]))).toBeUndefined();
    expect(decodeValue(escreg, "not a type", bytesV([1, 2]))).toBeUndefined();
    expect(decodeValue(escreg, "AVMString", bytesV(new TextEncoder().encode("hi")))).toBe('"hi"');
    // A struct, by name.
    const ra = ABIType.from("(uint64,uint64,uint64,uint64)").encode([1, 2, 3, 4]);
    expect(decodeValue(timeSeek, "RoundAt", bytesV(ra))).toBe("{round: 1, timestamp: 2, seeks: 3, reads: 4}");
    expect(decodeValue(escreg, "address", bytesV(addr(1)))).toBe(encodeAddress(addr(1)));
    // A string that looks like an address is still a string.
    const s58 = encodeAddress(addr(1)).toString();
    expect(decodeValue(escreg, "string", bytesV(ABIType.from("string").encode(s58)))).toBe(JSON.stringify(s58));
    expect(decodeValue(escreg, "byte[]", bytesV(ABIType.from("byte[]").encode(Uint8Array.of(0, 255))))).toBe("0x00ff");
    expect(decodeValue(escreg, "uint64[]", bytesV(ABIType.from("uint64[]").encode([1001, 2003])))).toBe("[1001, 2003]");
  });
});

describe("logs", () => {
  const ret = (type: string, v: unknown) => bytesV(cat([0x15, 0x1f, 0x7c, 0x75], ABIType.from(type).encode(v as never)));
  const method = (sig: string) => methodOf(escreg, selector(sig));

  it("decodes the ARC-4 return log with the run's method's return type", () => {
    expect(decodeLog(escreg, method("get(address)uint64"), ret("uint64", 2002))).toEqual({ kind: "return", name: "get(address)", text: "2002" });
    expect(decodeLog(escreg, method("getWithAuth(address)(uint64,uint64)"), ret("(uint64,uint64)", [1001, 0]))?.text).toBe("{appId: 1001, authAppId: 0}");
    const list = ret("(uint64,uint64)[]", [[1001, 0], [2005, 0], [0, 0], [0, 2003]]);
    expect(decodeLog(escreg, method("getWithAuthList(address[])(uint64,uint64)[]"), list)?.text).toBe("[[1001, 0], [2005, 0], [0, 0], [0, 2003]]");
    // No method, a void method, another prefix, or a value that isn't the type: nothing.
    expect(decodeLog(escreg, undefined, ret("uint64", 1))).toBeUndefined();
    expect(decodeLog(escreg, method("register(uint64)void"), ret("uint64", 1))).toBeUndefined();
    expect(decodeLog(escreg, method("get(address)uint64"), bytesV(new TextEncoder().encode("ERR:404")))).toBeUndefined();
    expect(decodeLog(escreg, method("get(address)uint64"), bytesV([0x15, 0x1f, 0x7c, 0x75, 1]))).toBeUndefined();
  });

  it("decodes an ARC-28 event by its selector, structs named", () => {
    const spec: Arc56Contract = {
      ...escreg,
      events: [
        { name: "Other", args: [{ type: "uint64" }] },
        { name: "Registered", args: [{ type: "uint64", name: "appId" }, { type: "(uint64,uint64)", name: "pair", struct: "AddressWithAuth" }, { type: "address" }] },
      ],
    };
    // ARC-28: the selector hashes the event's name and argument types, no return type.
    const sel = sha512_256.array("Registered(uint64,(uint64,uint64),address)").slice(0, 4);
    const body = ABIType.from("(uint64,(uint64,uint64),address)").encode([1001, [5, 6], encodeAddress(addr(2))]);
    expect(decodeLog(spec, undefined, bytesV(cat(sel, body)))).toEqual({
      kind: "event",
      name: "Registered",
      text: `appId: 1001, pair: {appId: 5, authAppId: 6}, ${encodeAddress(addr(2))}`,
    });
    // Byte arrays as bytes, not lists of numbers; an event without arguments is named.
    const bytesEvent: Arc56Contract = { ...escreg, events: [{ name: "Blob", args: [{ type: "byte[]", name: "data" }, { type: "byte[4]" }] }, { name: "Ping", args: [] }] };
    const blobSel = sha512_256.array("Blob(byte[],byte[4])").slice(0, 4);
    const blob = ABIType.from("(byte[],byte[4])").encode([Uint8Array.of(0, 1), Uint8Array.of(0x61, 0x62, 0x63, 0x64)]);
    expect(decodeLog(bytesEvent, undefined, bytesV(cat(blobSel, blob)))?.text).toBe('data: 0x0001, "abcd"');
    const ping = sha512_256.array("Ping()").slice(0, 4);
    expect(decodeLog(bytesEvent, undefined, bytesV(ping))).toEqual({ kind: "event", name: "Ping", text: "" });
    expect(decodeLog(bytesEvent, undefined, bytesV(cat(ping, [1])))).toBeUndefined();
    // The selector with a body that doesn't decode, and a uint: nothing.
    expect(decodeLog(spec, undefined, bytesV(cat(sel, [1, 2])))).toBeUndefined();
    expect(decodeLog(spec, undefined, uintV(1))).toBeUndefined();
  });
});

describe("valueText", () => {
  it("formats by the declared type: an address bare (short if asked), strings quoted, bytes as text or hex", () => {
    const a = encodeAddress(addr(3)).toString();
    expect(valueText(a, "address")).toBe(a);
    expect(valueText(a, "address", {}, true)).toBe(`${a.slice(0, 6)}…${a.slice(-4)}`);
    expect(valueText(a, "string")).toBe(JSON.stringify(a));
    expect(valueText(a)).toBe(JSON.stringify(a));
    expect(valueText([a, a], "address[]", {}, true)).toBe(`[${a.slice(0, 6)}…${a.slice(-4)}, ${a.slice(0, 6)}…${a.slice(-4)}]`);
    expect(valueText("hi")).toBe('"hi"');
    expect(valueText(Uint8Array.of(0x68, 0x69))).toBe('"hi"');
    expect(valueText(Uint8Array.of(0, 1))).toBe("0x0001");
    expect(valueText(10n)).toBe("10");
    expect(valueText(true)).toBe("true");
  });
});

describe("a spec whose TEAL has no source comments", () => {
  it("still matches, and names methods, keys and failures", () => {
    const teal = new TextDecoder().decode(Uint8Array.from(atob(escreg.source!.approval), (ch) => ch.charCodeAt(0)));
    const bare = teal
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");
    const spec: Arc56Contract = { ...escreg, source: { ...escreg.source!, approval: btoa(bare) } };
    const m = matchSpec(prog, spec, "approval");
    if ("mismatch" in m) throw new Error(m.mismatch);
    expect(m.lines).toEqual([]);
    expect(m.errors.get(423)).toBe("ERR:404");
    expect(failHint(m, 423, "err", undefined)?.message).toBe("ERR:404");
    expect(methodOf(spec, selector("register(uint64)void"))?.label).toBe("register(uint64)");
    expect(keyName(spec, "g", "Y291bnRlcg==")?.name).toBe("counter");
  });
});
