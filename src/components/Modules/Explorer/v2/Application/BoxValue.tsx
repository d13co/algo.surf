import React, { useCallback, useMemo, useState } from "react";
import { ABIType } from "algosdk";
import { getABIDecodedValue } from "@algorandfoundation/algokit-utils/types/app-arc56";
import MultiFormatViewer from "src/components/v2/MultiFormatViewer";
import Copyable from "src/components/v2/Copyable";
import { Input } from "src/components/v2/ui/input";

// --- Value types: the ARC-4 types to decode an app's box values as ---

export interface ParsedTypes {
  types: string[];
  error?: string;
}

/** Space separated ARC-4 types (a tuple's spaces aside); null where there are none. */
export function parseTypeFilter(filter: string): ParsedTypes | null {
  const trimmed = filter.trim();
  if (!trimmed) return null;
  const types: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of trimmed) {
    if (char === "(") depth++;
    if (char === ")") depth--;
    if (char === " " && depth === 0) {
      if (current) types.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (current) types.push(current);
  if (types.length === 0) return null;

  for (const t of types) {
    try {
      ABIType.from(t);
    } catch {
      return { types, error: `Invalid ARC4 type: ${t}` };
    }
  }
  return { types };
}

function readStorage(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function writeStorage(key: string, value: string) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // not remembered, then
  }
}

/**
 * The value types set for an app's boxes, remembered per app: the box view
 * and the version details share them. `types` is undefined while none are
 * set or one is invalid.
 */
export function useBoxValueTypes(appId: number) {
  const storageKey = `box-value-filter:${appId}`;
  // Kept with the key it is for, so another app (same component, new id) reads its own.
  const [state, setState] = useState(() => ({ key: storageKey, value: readStorage(storageKey) }));
  const filter = state.key === storageKey ? state.value : readStorage(storageKey);
  const setFilter = useCallback(
    (v: string) => {
      setState({ key: storageKey, value: v });
      writeStorage(storageKey, v);
    },
    [storageKey],
  );
  const parsed = useMemo(() => parseTypeFilter(filter), [filter]);
  const types = parsed?.types && !parsed.error ? parsed.types : undefined;
  return { filter, setFilter, parsed, types };
}

/** The field to set an app's box value types in (see useBoxValueTypes). */
export function BoxValueTypesInput({ value, onChange, parsed }: {
  value: string;
  onChange: (value: string) => void;
  parsed: ParsedTypes | null;
}) {
  return (
    <div>
      <div className="text-sm text-muted-foreground mb-1">Value Types</div>
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Space separated ARC4 types for Values (e.g. 'string uint64 (address,bool)')"
        className={`font-mono text-sm h-8 ${parsed?.error ? "!border-secondary" : ""}`}
      />
      {parsed?.error && <div className="text-secondary text-xs mt-1">{parsed.error}</div>}
    </div>
  );
}

// --- Decoded value rendering ---

export interface DecodedEntry {
  type: string;
  value: string;
  copyValue?: string;
  base64Value?: string;
  indent: number;
}

function isByteArrayType(abiType: ABIType): boolean {
  return "childType" in abiType && (abiType as any).childType.toString() === "byte";
}

function toBase64(value: unknown): string {
  if (value instanceof Uint8Array) return Buffer.from(value).toString("base64");
  return String(value);
}

function flattenDecoded(value: unknown, type: string, indent: number): DecodedEntry[] {
  const abiType = ABIType.from(type);
  const entries: DecodedEntry[] = [];

  if ("childTypes" in abiType && Array.isArray((abiType as any).childTypes)) {
    const childTypes = (abiType as any).childTypes as ABIType[];
    const values = value as unknown[];
    entries.push({ type, value: "", indent });
    for (let i = 0; i < childTypes.length; i++) {
      entries.push(...flattenDecoded(values[i], childTypes[i].toString(), indent + 1));
    }
    return entries;
  }

  if (isByteArrayType(abiType) && value instanceof Uint8Array) {
    const b64 = Buffer.from(value).toString("base64");
    return [{ type, value: "", base64Value: b64, indent }];
  }

  if ("childType" in abiType && Array.isArray(value)) {
    const childType = (abiType as any).childType as ABIType;
    const isByteArrayChild = isByteArrayType(childType);

    if (isByteArrayChild) {
      const b64Values = (value as unknown[]).map(toBase64);
      const jsonCopy = JSON.stringify(b64Values);
      entries.push({ type, value: `(${(value as unknown[]).length} items)`, copyValue: jsonCopy, indent });
    } else {
      const jsonCopy = JSON.stringify(value, (_k, v) => typeof v === "bigint" ? v.toString() : v);
      entries.push({ type, value: `(${(value as unknown[]).length} items)`, copyValue: jsonCopy, indent });
    }
    for (let i = 0; i < (value as unknown[]).length; i++) {
      entries.push(...flattenDecoded((value as unknown[])[i], childType.toString(), indent + 1));
    }
    return entries;
  }

  const display = typeof value === "bigint" ? value.toString() : String(value);
  return [{ type, value: display, indent }];
}

/** A box value (base64) decoded as the first of `types` it decodes as, flattened into lines; null if none fits. */
export function decodeBoxValue(value: string, types: string[]): { entries: DecodedEntry[]; matchedType: string } | null {
  const buffer = new Uint8Array(Buffer.from(value, "base64"));
  for (const type of types) {
    try {
      const decoded = getABIDecodedValue(buffer, type, {});
      return { entries: flattenDecoded(decoded, type, 0), matchedType: type };
    } catch {
      continue;
    }
  }
  return null;
}

/** One decoded line's value: bytes with the format switcher, anything else as text. */
export function DecodedEntryValue({ entry, copy = true }: { entry: DecodedEntry; copy?: boolean }) {
  if (entry.base64Value) {
    return <MultiFormatViewer view="auto" includeNum="auto" value={entry.base64Value} />;
  }
  return (
    <span className="break-all">
      {entry.value}
      {copy ? <Copyable size="s" className="ml-1 opacity-60 hover:opacity-100" value={entry.copyValue ?? entry.value} /> : null}
    </span>
  );
}

export function DecodedValueView({ value, types }: { value: string; types: string[] }) {
  const result = useMemo(() => decodeBoxValue(value, types), [value, types]);

  if (!result) {
    return <MultiFormatViewer view="auto" includeNum="auto" value={value} />;
  }

  const { entries } = result;

  return (
    <div className="space-y-1 font-mono text-sm">
      {entries.map((entry, i) => (
        <div key={i} style={{ paddingLeft: entry.indent * 16 }}>
          <span className="text-muted-foreground">{entry.type}</span>
          {entry.base64Value || entry.value ? (
            <span className="inline">
              : <DecodedEntryValue entry={entry} />
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
