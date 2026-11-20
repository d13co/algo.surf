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
    get: call("get", (k: string) => idb.db.get(k)),
    set: call("set", (k: string, v: unknown) => void idb.db.set(k, v)),
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

// A fresh module per test: its page memory starts empty.
const load = () => import("./specStore");

beforeEach(() => {
  vi.resetModules();
  idb.db.clear();
  idb.fail.clear();
});

describe("specStore", () => {
  it("stores specs by program hash and lists them newest first", async () => {
    const s = await load();
    expect(await s.putSpec(rec("a", 1, 1))).toBe(true);
    await s.putSpec(rec("b", 1, 2));
    await s.putSpec(rec("c", 2, 3));
    expect([...idb.db.keys()]).toEqual(["a", "b", "c"]);
    const fresh = await load();
    expect((await fresh.getSpec("a"))?.hash).toBe("a");
    expect((await fresh.listSpecs()).map((r) => r.hash)).toEqual(["c", "b", "a"]);
    expect((await fresh.specsForApp(1)).map((r) => r.hash)).toEqual(["b", "a"]);
  });

  it("lists stored specs and the page's together", async () => {
    idb.db.set("a", rec("a", 1, 1));
    const s = await load();
    idb.fail.add("set");
    expect(await s.putSpec(rec("b", 1, 2))).toBe(false);
    expect((await s.listSpecs()).map((r) => r.hash)).toEqual(["b", "a"]);
  });

  it("keeps a spec read from IndexedDB for the page", async () => {
    idb.db.set("a", rec("a", 1, 1));
    const s = await load();
    await s.getSpec("a");
    idb.fail.add("all");
    expect((await s.getSpec("a"))?.hash).toBe("a");
  });

  it("prefers a spec this page couldn't store to an older one IndexedDB still holds", async () => {
    idb.db.set("a", rec("a", 1, 1));
    const s = await load();
    idb.fail.add("set");
    const newer = { ...rec("a", 1, 2), sources: { "x.ts": "x" } };
    expect(await s.putSpec(newer)).toBe(false);
    expect(await s.getSpec("a")).toEqual(newer);
    expect((await s.listSpecs()).map((r) => r.addedAt)).toEqual([2]);
    // Stored once IndexedDB takes it.
    idb.fail.clear();
    expect(await s.putSpec(rec("a", 1, 3))).toBe(true);
    expect((await s.getSpec("a"))?.addedAt).toBe(3);
  });

  it("deletes from IndexedDB first, and keeps a spec it failed to delete", async () => {
    const s = await load();
    await s.putSpec(rec("a", 1, 1));
    idb.fail.add("del");
    expect(await s.deleteSpec("a")).toBe(false);
    expect((await s.getSpec("a"))?.hash).toBe("a");
    idb.fail.clear();
    expect(await s.deleteSpec("a")).toBe(true);
    expect(await s.getSpec("a")).toBeUndefined();
    expect(idb.db.size).toBe(0);
  });

  it("drops a spec removed in another tab", async () => {
    const s = await load();
    await s.putSpec(rec("a", 1, 1));
    expect((await s.getSpec("a"))?.hash).toBe("a");
    idb.db.delete("a");
    expect(await s.getSpec("a")).toBeUndefined();
    expect(await s.listSpecs()).toEqual([]);
  });

  it("keeps specs for the page without IndexedDB", async () => {
    idb.fail.add("all");
    const s = await load();
    expect(await s.putSpec(rec("a", 1, 1))).toBe(false);
    await s.putSpec(rec("b", 2, 2));
    expect((await s.getSpec("a"))?.hash).toBe("a");
    expect((await s.specsForApp(2)).map((r) => r.hash)).toEqual(["b"]);
    expect(await s.deleteSpec("a")).toBe(true);
    expect((await s.listSpecs()).map((r) => r.hash)).toEqual(["b"]);
  });
});
