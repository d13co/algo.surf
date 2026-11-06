/**
 * Drops entries from a msgpack map without decoding it, by skipping over
 * the bytes of each value. For maps algosdk can't decode: a ledger delta's
 * `Txleases` is keyed by {Sender, Lease} structs, and algosdk's decoder only
 * takes string, number, bigint or byte keys.
 */

/** The byte offset just past the msgpack value starting at `at`. */
export function skipValue(b: Uint8Array, at: number): number {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const t = b[at];
  if (t === undefined) throw new RangeError("msgpack: unexpected end");
  const u8 = (o: number) => view.getUint8(o);
  const u16 = (o: number) => view.getUint16(o);
  const u32 = (o: number) => view.getUint32(o);
  const items = (n: number, from: number) => {
    let p = from;
    for (let i = 0; i < n; i++) p = skipValue(b, p);
    return p;
  };
  if (t <= 0x7f || t >= 0xe0) return at + 1; // fixint
  if (t >= 0x80 && t <= 0x8f) return items(2 * (t & 0x0f), at + 1); // fixmap
  if (t >= 0x90 && t <= 0x9f) return items(t & 0x0f, at + 1); // fixarray
  if (t >= 0xa0 && t <= 0xbf) return at + 1 + (t & 0x1f); // fixstr
  switch (t) {
    case 0xc0: // nil
    case 0xc2: // false
    case 0xc3: // true
      return at + 1;
    case 0xc4: // bin 8
    case 0xd9: // str 8
      return at + 2 + u8(at + 1);
    case 0xc5: // bin 16
    case 0xda: // str 16
      return at + 3 + u16(at + 1);
    case 0xc6: // bin 32
    case 0xdb: // str 32
      return at + 5 + u32(at + 1);
    case 0xc7: // ext 8
      return at + 3 + u8(at + 1);
    case 0xc8: // ext 16
      return at + 4 + u16(at + 1);
    case 0xc9: // ext 32
      return at + 6 + u32(at + 1);
    case 0xca: // float 32
      return at + 5;
    case 0xcb: // float 64
      return at + 9;
    case 0xcc: // uint 8
    case 0xd0: // int 8
      return at + 2;
    case 0xcd: // uint 16
    case 0xd1: // int 16
      return at + 3;
    case 0xce: // uint 32
    case 0xd2: // int 32
      return at + 5;
    case 0xcf: // uint 64
    case 0xd3: // int 64
      return at + 9;
    case 0xd4: // fixext 1
      return at + 3;
    case 0xd5: // fixext 2
      return at + 4;
    case 0xd6: // fixext 4
      return at + 6;
    case 0xd7: // fixext 8
      return at + 10;
    case 0xd8: // fixext 16
      return at + 18;
    case 0xdc: // array 16
      return items(u16(at + 1), at + 3);
    case 0xdd: // array 32
      return items(u32(at + 1), at + 5);
    case 0xde: // map 16
      return items(2 * u16(at + 1), at + 3);
    case 0xdf: // map 32
      return items(2 * u32(at + 1), at + 5);
  }
  throw new RangeError(`msgpack: unknown type 0x${t.toString(16)} at ${at}`);
}

/** A string key's text, or undefined for a key of another type. */
function keyText(b: Uint8Array, at: number): string | undefined {
  const t = b[at];
  let start: number;
  let len: number;
  if (t >= 0xa0 && t <= 0xbf) [start, len] = [at + 1, t & 0x1f];
  else if (t === 0xd9) [start, len] = [at + 2, b[at + 1]];
  else return undefined;
  return new TextDecoder().decode(b.subarray(start, start + len));
}

/** `encoded`, a msgpack map, without its entries whose (string) key is in `keys`; as is when it has none. */
export function omitMapKeys(encoded: Uint8Array, keys: string[]): Uint8Array {
  const t = encoded[0];
  let count: number;
  let at: number;
  if (t >= 0x80 && t <= 0x8f) [count, at] = [t & 0x0f, 1];
  else if (t === 0xde) [count, at] = [new DataView(encoded.buffer, encoded.byteOffset).getUint16(1), 3];
  else if (t === 0xdf) [count, at] = [new DataView(encoded.buffer, encoded.byteOffset).getUint32(1), 5];
  else throw new RangeError("msgpack: not a map");

  const kept: Uint8Array[] = [];
  let dropped = 0;
  for (let i = 0; i < count; i++) {
    const end = skipValue(encoded, skipValue(encoded, at));
    const key = keyText(encoded, at);
    if (key !== undefined && keys.includes(key)) dropped++;
    else kept.push(encoded.subarray(at, end));
    at = end;
  }
  if (!dropped) return encoded;

  const n = count - dropped;
  const header = n <= 15 ? Uint8Array.of(0x80 | n) : n <= 0xffff ? Uint8Array.of(0xde, n >> 8, n & 0xff) : Uint8Array.of(0xdf, n >>> 24, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff);
  const out = new Uint8Array(header.length + kept.reduce((s, k) => s + k.length, 0));
  out.set(header, 0);
  let p = header.length;
  for (const k of kept) {
    out.set(k, p);
    p += k.length;
  }
  return out;
}
