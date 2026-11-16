import { describe, expect, it } from "vitest";
import { decodeAddress, encodeAddress } from "algosdk";
import { addressBefore } from "./completeAddress";

/** The public key as a bigint, to compare keys by order. */
const keyOf = (address: string) =>
  BigInt("0x" + Buffer.from(decodeAddress(address).publicKey).toString("hex"));

const zero = encodeAddress(new Uint8Array(32));
const some = encodeAddress(Uint8Array.from({ length: 32 }, (_, i) => (i * 37 + 11) & 0xff));

describe("addressBefore", () => {
  it("is undefined where the prefix range starts at the zero key", () => {
    expect(addressBefore("AAAA")).toBeUndefined();
    expect(addressBefore(zero)).toBeUndefined();
  });

  it("is the key just below a whole address, or one missing its last characters", () => {
    for (const prefix of [some, some.slice(0, 57), some.slice(0, 53), some.slice(0, 52)]) {
      expect(keyOf(addressBefore(prefix)!)).toBe(keyOf(some) - 1n);
    }
  });

  it("is just below the lowest key with a short prefix", () => {
    const before = addressBefore("B")!;
    // "B" is 00001: the lowest key with it is 0x08 then zeros
    expect(keyOf(before)).toBe((0x08n << 248n) - 1n);
    expect(before.startsWith("A")).toBe(true);
  });
});
