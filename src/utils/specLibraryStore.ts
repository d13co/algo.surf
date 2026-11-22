import { clear, createStore, del, get, promisifyRequest, values } from "idb-keyval";
import { fillMissing, fromRecords, mergeSpec, specId, type LibSpec } from "./specLibrary";
import { deleteSpec, listSpecs } from "./specStore";

/**
 * The spec library, kept in this browser's IndexedDB (`debug-spec-library`)
 * by spec id. Nothing is uploaded. A spec IndexedDB doesn't take is kept in
 * memory, so without IndexedDB a spec lasts for the page. Specs the
 * debugger saved by program before (`debug-specs`) move here on first read.
 */

const store = createStore("debug-spec-library", "specs");
/** Specs IndexedDB didn't take: kept for this page only. */
const pageOnly = new Map<string, LibSpec>();
/** IndexedDB's specs as last read or written: used only while it can't be read. */
const seen = new Map<string, LibSpec>();

let moved: Promise<void> | undefined;

/**
 * Changes a stored spec in one transaction: `fn` gets what is stored now
 * (undefined when nothing is) and gives what to store, or undefined to
 * leave it. So a change made from a copy read earlier doesn't undo one
 * made since (in another tab, or by the debugger). Gives what was stored,
 * or false when IndexedDB failed and the result is kept for this page only.
 */
export async function updateLibSpec(id: string, fn: (cur: LibSpec | undefined) => LibSpec | undefined): Promise<LibSpec | undefined | false> {
  try {
    const next = await store("readwrite", (os) =>
      new Promise<LibSpec | undefined>((resolve, reject) => {
        const req = os.get(id);
        req.onsuccess = () => {
          try {
            const page = pageOnly.get(id);
            const out = fn(page ?? (req.result as LibSpec | undefined));
            if (!out) return resolve(undefined);
            os.put(out, id);
            promisifyRequest(os.transaction).then(() => resolve(out), reject);
          } catch (e) {
            reject(e);
          }
        };
        req.onerror = () => reject(req.error);
      }),
    );
    if (next) {
      pageOnly.delete(id);
      seen.set(id, next);
    }
    return next;
  } catch {
    const next = fn(pageOnly.get(id) ?? seen.get(id));
    if (!next) return undefined;
    pageOnly.set(id, next);
    return false;
  }
}

/** Saves a spec from the specs page, merged with what is stored now (see mergeSpec); false when it is kept for this page only. */
export async function putLibSpec(s: LibSpec): Promise<boolean> {
  return (await updateLibSpec(s.id, (cur) => (cur ? mergeSpec(cur, s) : s))) !== false;
}

/**
 * Moves the debugger's per-program specs into the library: once per page,
 * or again on the next read while some couldn't move.
 * Each spec's old records are deleted as soon as the library holds it, so
 * a spec moved and then removed here doesn't come back.
 */
function moveOld(network: string): Promise<void> {
  moved ??= (async () => {
    let done = true;
    try {
      const old = await listSpecs();
      for (const spec of fromRecords(old, network)) {
        const r = await updateLibSpec(spec.id, (had) => (had ? fillMissing({ ...had, apps: [...had.apps, ...spec.apps.filter((a) => !had.apps.some((b) => b.hash === a.hash))] }, spec, spec.updatedAt).spec : spec));
        // Not stored (IndexedDB busy or full): left in the old store, tried again on the next read.
        if (r === false) {
          done = false;
          continue;
        }
        for (const rec of old) if (rec?.arc56 && specId(rec.arc56) === spec.id && !(await deleteSpec(rec.hash))) done = false;
      }
    } catch {
      done = false;
    }
    if (!done) moved = undefined;
  })();
  return moved;
}

/** Every spec, newest first. `network` names the apps of specs moved from the old store. */
export async function listLibrary(network: string): Promise<LibSpec[]> {
  await moveOld(network);
  const all = new Map<string, LibSpec>();
  try {
    const rs = await values<LibSpec>(store);
    seen.clear();
    for (const r of rs) {
      if (!r?.id) continue;
      all.set(r.id, r);
      seen.set(r.id, r);
    }
  } catch {
    for (const [id, r] of seen) all.set(id, r);
  }
  for (const [id, r] of pageOnly) all.set(id, r);
  return [...all.values()].sort((a, b) => b.addedAt - a.addedAt);
}

/** Removes a spec. False when IndexedDB still holds it. */
export async function deleteLibSpec(id: string): Promise<boolean> {
  // Its records in the old store too, should any be left there: else the next move brings it back.
  for (const r of await listSpecs()) if (r.arc56 && specId(r.arc56) === id) await deleteSpec(r.hash);
  try {
    await del(id, store);
  } catch {
    try {
      if ((await get(id, store)) !== undefined) return false;
    } catch {
      // No IndexedDB: only the page has it.
    }
  }
  pageOnly.delete(id);
  seen.delete(id);
  return true;
}

/** Removes every spec. False when IndexedDB couldn't be emptied: then it still holds them. */
export async function clearLibrary(): Promise<boolean> {
  for (const r of await listSpecs()) await deleteSpec(r.hash);
  try {
    await clear(store);
  } catch {
    try {
      if ((await values(store)).length) return false;
    } catch {
      // No IndexedDB: only the page has them.
    }
  }
  pageOnly.clear();
  seen.clear();
  return true;
}
