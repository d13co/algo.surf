import { describe, expect, it } from "vitest";
import { msgpackRawDecode, msgpackRawEncode } from "algosdk";
import { omitMapKeys, skipValue } from "./msgpackOmit";

/** Bytes of a map keyed by a map, which algosdk can encode but not decode: hand-built. */
function mapWithStructKey(): Uint8Array {
  const inner = msgpackRawEncode(new Map([["Lease", new Uint8Array(32)], ["Sender", new Uint8Array(32)]]));
  const round = msgpackRawEncode(66670300n);
  // {"Txleases": {<struct>: round}, "a": 1}
  const txleasesKey = msgpackRawEncode("Txleases");
  const a = msgpackRawEncode(new Map([["a", 1]])).subarray(1);
  return Uint8Array.from([0x82, ...txleasesKey, 0x81, ...inner, ...round, ...a]);
}

describe("skipValue", () => {
  it.each([
    0,
    -1,
    255,
    70000,
    2n ** 40n,
    -(2n ** 40n),
    1.5,
    "",
    "x".repeat(40),
    "y".repeat(300),
    new Uint8Array(3),
    new Uint8Array(300),
    [1, [2, 3], "four"],
    new Array(20).fill(7),
    new Map([["k", new Map([["n", null]])]]),
    true,
    null,
  ])("skips %s whole", (v) => {
    const bytes = msgpackRawEncode(v as never);
    const padded = Uint8Array.from([...bytes, 0xc0]);
    expect(skipValue(padded, 0)).toBe(bytes.length);
  });
});

describe("omitMapKeys", () => {
  it("drops a struct-keyed entry so the rest decodes", () => {
    const bytes = mapWithStructKey();
    expect(() => msgpackRawDecode(bytes)).toThrow();
    const out = omitMapKeys(bytes, ["Txleases"]);
    expect(msgpackRawDecode(out)).toEqual({ a: 1n });
  });

  it("returns the map as is without such keys", () => {
    const bytes = msgpackRawEncode(new Map<string, unknown>([["a", 1], ["b", "two"]]) as never);
    expect(omitMapKeys(bytes, ["Txleases"])).toBe(bytes);
  });

  it("rewrites a 16-bit map header", () => {
    const entries = Array.from({ length: 20 }, (_, i): [string, number] => [`k${i}`, i]);
    const bytes = msgpackRawEncode(new Map(entries));
    const out = msgpackRawDecode(omitMapKeys(bytes, ["k3"])) as Record<string, bigint>;
    expect(Object.keys(out)).toHaveLength(19);
    expect(out.k3).toBeUndefined();
    expect(out.k19).toBe(19n);
  });
});
