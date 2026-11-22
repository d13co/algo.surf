import type { Arc56Contract } from "@algorandfoundation/algokit-utils/types/app-arc56";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SpecRecord } from "./specStore";

// A stand-in IndexedDB: `db` is what is stored; `fail` makes calls throw, as without IndexedDB.
const idb = vi.hoisted(() => ({ db: new Map<string, unknown>(), fail: new Set<string>() }));
vi.mock("idb-keyval", () => {
  const call =
    <A extends unknown[], R>(name: string, f: (...a: A) => R) =>
    async (...a: A) => {
      if (idb.fail.has(name) || idb.fail.has("all")) throw new Error(`${name} failed`);
      return f(...a);
    };
  return {
    createStore: () => () => undefined,
    del: call("del", (k: string) => void idb.db.delete(k)),
    values: call("values", () => [...idb.db.values()]),
  };
});

const rec = (hash: string, appId: number, addedAt: number): SpecRecord => ({
  hash,
  kind: "approval",
  appId,
  name: "T",
  arc56: {} as Arc56Contract,
  addedAt,
});

const load = () => import("./specStore");

beforeEach(() => {
  vi.resetModules();
  idb.db.clear();
  idb.fail.clear();
});

describe("specStore (specs saved before the library)", () => {
  it("lists what IndexedDB holds, and nothing when it can't be read", async () => {
    const s = await load();
    idb.db.set("a", rec("a", 1, 1));
    idb.db.set("junk", null);
    expect((await s.listSpecs()).map((r) => r.hash)).toEqual(["a"]);
    idb.fail.add("values");
    expect(await s.listSpecs()).toEqual([]);
  });

  it("deletes a spec, and says when IndexedDB still holds it", async () => {
    const s = await load();
    idb.db.set("a", rec("a", 1, 1));
    idb.fail.add("del");
    expect(await s.deleteSpec("a")).toBe(false);
    expect(idb.db.has("a")).toBe(true);
    idb.fail.clear();
    expect(await s.deleteSpec("a")).toBe(true);
    expect(idb.db.size).toBe(0);
  });
});
