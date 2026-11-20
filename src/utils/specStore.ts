import type { Arc56Contract } from "@algorandfoundation/algokit-utils/types/app-arc56";
import { createStore, del, get, set, values } from "idb-keyval";
import type { ProgramKind, PuyaMap } from "./arc56Source";

/**
 * ARC-56 specs added on the debugger, kept in this browser's IndexedDB
 * (`debug-specs`) by program hash: an app update changes the program and its
 * spec. Nothing is uploaded. A spec IndexedDB doesn't take is kept in
 * memory, so without IndexedDB a spec lasts for the page.
 */

export type SpecRecord = {
  /** The program hash (base64), as the traces name programs. */
  hash: string;
  /** Which of the spec's programs it matched. */
  kind: ProgramKind;
  appId?: number;
  name: string;
  arc56: Arc56Contract;
  puyaMap?: PuyaMap;
  /** Source files by their path in the spec's TEAL comments. */
  sources?: Record<string, string>;
  addedAt: number;
};

const store = createStore("debug-specs", "specs");
/** Specs IndexedDB didn't take (its write failed): kept for this page only. */
const pageOnly = new Map<string, SpecRecord>();
/** IndexedDB's specs as last read or written: used only while it can't be read. */
const seen = new Map<string, SpecRecord>();

/** Saves a spec; false when it is kept for this page only. */
export async function putSpec(r: SpecRecord): Promise<boolean> {
  try {
    await set(r.hash, r, store);
    pageOnly.delete(r.hash);
    seen.set(r.hash, r);
    return true;
  } catch {
    pageOnly.set(r.hash, r);
    return false;
  }
}

/**
 * A spec by program hash: one this page couldn't store (newer than what
 * IndexedDB holds, if anything), else what IndexedDB holds, so a spec
 * removed in another tab stays removed.
 */
export async function getSpec(hash: string): Promise<SpecRecord | undefined> {
  const page = pageOnly.get(hash);
  if (page) return page;
  try {
    const r = await get<SpecRecord>(hash, store);
    if (r) {
      seen.set(hash, r);
      return r;
    }
    seen.delete(hash);
    return undefined;
  } catch {
    return seen.get(hash);
  }
}

/** Every spec, newest first. Loads whole records: fine for the few specs anyone adds. */
export async function listSpecs(): Promise<SpecRecord[]> {
  const all = new Map<string, SpecRecord>();
  try {
    const rs = await values<SpecRecord>(store);
    seen.clear();
    for (const r of rs) {
      if (!r?.hash) continue;
      all.set(r.hash, r);
      seen.set(r.hash, r);
    }
  } catch {
    // No IndexedDB: what was last read from it, and the page's specs.
    for (const [h, r] of seen) all.set(h, r);
  }
  for (const [h, r] of pageOnly) all.set(h, r);
  return [...all.values()].sort((a, b) => b.addedAt - a.addedAt);
}

/** The specs added for an app, any program version: to suggest, never to apply without a match. */
export async function specsForApp(appId: number): Promise<SpecRecord[]> {
  return (await listSpecs()).filter((r) => r.appId === appId);
}

/**
 * Removes a spec, from IndexedDB first. False when it is still stored there:
 * then it stays on the page too. Without IndexedDB, it goes from the page.
 */
export async function deleteSpec(hash: string): Promise<boolean> {
  try {
    await del(hash, store);
  } catch {
    if (await stored(hash)) return false;
  }
  pageOnly.delete(hash);
  seen.delete(hash);
  return true;
}

async function stored(hash: string): Promise<boolean> {
  try {
    return (await get(hash, store)) !== undefined;
  } catch {
    return false;
  }
}
