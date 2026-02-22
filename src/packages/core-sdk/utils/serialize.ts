import { bytesToBase64 } from "algosdk";

export function encodingDataToPlain(val: unknown): any {
    if (val instanceof Map) {
        const obj: Record<string, unknown> = {};
        for (const [k, v] of val) {
            if (v !== undefined) obj[k] = encodingDataToPlain(v);
        }
        return obj;
    }
    if (val instanceof Uint8Array) return bytesToBase64(val);
    if (typeof val === 'bigint') return Number(val);
    if (Array.isArray(val)) return val.map(encodingDataToPlain);
    return val;
}
