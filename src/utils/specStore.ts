import type { Arc56Contract } from "@algorandfoundation/algokit-utils/types/app-arc56";
import { createStore, del, values } from "idb-keyval";
import type { ProgramKind, PuyaMap } from "./arc56Source";

/**
 * The debugger's record of a spec matched with one program, by program
 * hash. The debugger builds these from the spec library (see
 * specLibrary.ts); before the library, it kept them in this browser's
 * IndexedDB (`debug-specs`), which is now only read to move them into the
 * library, and emptied as they move.
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

/** The specs saved before the library; none when IndexedDB can't be read. */
export async function listSpecs(): Promise<SpecRecord[]> {
  try {
    return (await values<SpecRecord>(store)).filter((r) => !!r?.hash);
  } catch {
    return [];
  }
}

/** Removes a spec saved before the library; false when IndexedDB still holds it. */
export async function deleteSpec(hash: string): Promise<boolean> {
  try {
    await del(hash, store);
    return true;
  } catch {
    return false;
  }
}
