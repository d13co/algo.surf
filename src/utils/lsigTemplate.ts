import { sha512_256 } from "js-sha512";

// A port of surf idx's template() (lsig.go), which ids the templates its /v0/templates and
// /v0/template/{id} list. It must match it byte for byte: a change there changes the ids.

// The fixed immediate size of each opcode a lsig may use (TEAL v1..v13); the rest take none.
const IMM_BYTES = (() => {
  const t = new Uint8Array(256);
  for (const op of [0x05, 0x06, 0x07, 0x21, 0x27, 0x2c, 0x31, 0x32, 0x34, 0x35, 0x38, 0x45, 0x46, 0x47,
    0x4b, 0x4e, 0x4f, 0x5c, 0x5e, 0x5f, 0x8b, 0x8c, 0xc0, 0xc2, 0xd0, 0xd1, 0xe0, 0xe1, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7]) {
    t[op] = 1;
  }
  for (const op of [0x33, 0x36, 0x39, 0x51, 0x57, 0x8a, 0xc1]) t[op] = 2;
  t[0x37] = 3;
  return t;
})();

/** Go's binary.Uvarint: [value, bytes read]; n is 0 when buf ends first, negative on overflow. */
function uvarint(buf: Uint8Array, at: number): [number, number] {
  let x = 0;
  let mul = 1;
  for (let i = 0; at + i < buf.length; i++) {
    if (i === 10) return [0, -(i + 1)];
    const b = buf[at + i];
    if (b < 0x80) {
      if (i === 9 && b > 1) return [0, -(i + 1)];
      return [x + b * mul, i + 1];
    }
    x += (b & 0x7f) * mul;
    mul *= 128;
  }
  return [0, 0];
}

/**
 * A lsig program's template id: the hash of its skeleton, its opcodes and fixed immediates without
 * constants or branch offsets. It says nothing about the values: it never makes a lsig genuine.
 */
export function lsigTemplate(logic: Uint8Array): string {
  const [ver, vn] = uvarint(logic, 0);
  let pc = vn;
  let ok = pc > 0 && ver <= 13;
  const skel: number[] = [0x53]; // "S"
  if (ok) skel.push(...logic.subarray(0, pc));

  const readUvarint = (): number => {
    const [v, n] = uvarint(logic, pc);
    if (n <= 0) {
      ok = false;
      return 0;
    }
    pc += n;
    return v;
  };
  const skip = (n: number) => {
    if (n > logic.length - pc) {
      ok = false;
      return;
    }
    pc += n;
  };
  const value = (isBytes: boolean): number => {
    const l = readUvarint();
    if (!isBytes) return 0x81;
    if (ok) skip(l);
    return 0x80;
  };

  while (ok && pc < logic.length) {
    const op = logic[pc];
    skel.push(op);
    pc++;
    switch (op) {
      case 0x20: case 0x26: case 0x83: case 0x82: { // const blocks and multi-pushes
        skel.pop();
        const n = readUvarint();
        for (let i = 0; ok && i < n; i++) {
          const push = value(op === 0x26 || op === 0x82);
          if (op === 0x83 || op === 0x82) skel.push(push);
        }
        break;
      }
      case 0x80: case 0x81:
        value(op === 0x80);
        break;
      case 0x21: case 0x22: case 0x23: case 0x24: case 0x25:
        skel[skel.length - 1] = 0x81;
        skip(IMM_BYTES[op]);
        break;
      case 0x27: case 0x28: case 0x29: case 0x2a: case 0x2b:
        skel[skel.length - 1] = 0x80;
        skip(IMM_BYTES[op]);
        break;
      case 0x40: case 0x41: case 0x42: case 0x88: // branches: int16, a zigzag varint from v13
        if (ver < 13) skip(2);
        else {
          const [, n] = uvarint(logic, pc); // Varint reads as many bytes as Uvarint
          if (n > 0) pc += n;
          else ok = false;
        }
        break;
      case 0x8d: case 0x8e: // switch, match: a 1-byte count, then int16s
        skip(1);
        if (ok) {
          skel.push(logic[pc - 1]);
          skip(2 * logic[pc - 1]);
        }
        break;
      default: {
        const start = pc;
        skip(IMM_BYTES[op]);
        if (ok) skel.push(...logic.subarray(start, pc));
      }
    }
  }

  let bytes: Uint8Array;
  if (ok) bytes = Uint8Array.from(skel);
  else {
    bytes = new Uint8Array(1 + logic.length);
    bytes[0] = 0x50; // "P": the program is its own template
    bytes.set(logic, 1);
  }
  return sha512_256.hex(bytes).slice(0, 16);
}
