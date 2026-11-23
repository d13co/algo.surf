import { describe, expect, it } from "vitest";
import { createLimit } from "./limit";

/** A promise to settle from outside. */
function deferred<T = void>() {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("createLimit", () => {
  it("runs at most n at once, the rest in order", async () => {
    const run = createLimit(2);
    const gates = [deferred(), deferred(), deferred(), deferred()];
    const started: number[] = [];
    const all = gates.map((g, i) => run(async () => (started.push(i), g.promise)));
    await tick();
    expect(started).toEqual([0, 1]);
    gates[1].resolve();
    await tick();
    expect(started).toEqual([0, 1, 2]);
    gates[0].resolve();
    await tick();
    expect(started).toEqual([0, 1, 2, 3]);
    gates[2].resolve();
    gates[3].resolve();
    await Promise.all(all);
  });

  it("frees the slot when a call throws", async () => {
    const run = createLimit(1);
    await expect(run(async () => { throw new Error("no"); })).rejects.toThrow("no");
    await expect(run(async () => 7)).resolves.toBe(7);
  });

  it("drops a waiting call whose signal aborts, without taking a slot", async () => {
    const run = createLimit(1);
    const gate = deferred();
    const first = run(() => gate.promise);
    const ac = new AbortController();
    let ranAborted = false;
    const second = run(async () => void (ranAborted = true), ac.signal);
    const started: string[] = [];
    const third = run(async () => void started.push("third"));
    ac.abort(new Error("gone"));
    await expect(second).rejects.toThrow("gone");
    gate.resolve();
    await first;
    await third;
    expect(ranAborted).toBe(false);
    expect(started).toEqual(["third"]);
    // Still one at a time afterwards.
    const g2 = deferred();
    const a = run(() => g2.promise);
    let b = false;
    const bp = run(async () => void (b = true));
    await tick();
    expect(b).toBe(false);
    g2.resolve();
    await Promise.all([a, bp]);
    expect(b).toBe(true);
  });

  it("frees the slot when a running call's signal aborts, even if fn never settles", async () => {
    const run = createLimit(1);
    const ac = new AbortController();
    const hung = run(() => new Promise<void>(() => {}), ac.signal); // a read that never answers
    let ran = false;
    const next = run(async () => void (ran = true));
    await tick();
    expect(ran).toBe(false);
    ac.abort(new Error("left"));
    await expect(hung).rejects.toThrow("left");
    await next;
    expect(ran).toBe(true);
  });

  it("drops a call aborted after its slot was handed over but before it started", async () => {
    const run = createLimit(1);
    const gate = deferred();
    const first = run(() => gate.promise);
    const ac = new AbortController();
    let ranAborted = false;
    const second = run(async () => void (ranAborted = true), ac.signal);
    gate.resolve(); // hands the slot to `second` synchronously in release()
    ac.abort(new Error("late")); // before `second` resumes
    await first;
    await expect(second).rejects.toThrow("late");
    expect(ranAborted).toBe(false);
    await expect(run(async () => 3)).resolves.toBe(3);
  });

  it("rejects a size below 1", () => {
    expect(() => createLimit(0)).toThrow(RangeError);
    expect(() => createLimit(1.5)).toThrow(RangeError);
  });

  it("rejects at once when the signal already aborted", async () => {
    const run = createLimit(1);
    const ac = new AbortController();
    ac.abort(new Error("before"));
    await expect(run(async () => 1, ac.signal)).rejects.toThrow("before");
    await expect(run(async () => 2)).resolves.toBe(2);
  });
});
