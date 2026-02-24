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

/**
 * Deep-convert any object (including model instances) to plain JSON-safe values.
 * Converts bigint → number, Uint8Array → base64 string, recurses into objects/arrays.
 */
export function toPlainJson(val: unknown): any {
    if (val == null) return val;
    if (val instanceof Uint8Array) return bytesToBase64(val);
    if (typeof val === 'bigint') return Number(val);
    if (val instanceof Map) {
        const obj: Record<string, unknown> = {};
        for (const [k, v] of val) {
            if (v !== undefined) obj[k] = toPlainJson(v);
        }
        return obj;
    }
    if (Array.isArray(val)) return val.map(toPlainJson);
    if (typeof val === 'object') {
        const obj: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(val)) {
            if (v !== undefined) obj[k] = toPlainJson(v);
        }
        return obj;
    }
    return val;
}
