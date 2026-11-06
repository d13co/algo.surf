/**
 * Compares `*.algo` search on nfd-ghost-sdk (CoreSearch's searchNFD) with
 * what the NFD REST API search gave: the account opened and the `?alt=`
 * accounts, against REST's `depositAccount` ∪ `caAlgo`. Reads the REST API,
 * so run it by hand, once:
 *
 *   REACT_APP_NETWORK=Mainnet REACT_APP_TIMETRAVEL_ALGOD_URL=http://127.0.0.1:8080 \
 *     NFD_CHECK=scripts/nfd-search-parity.ts npx vitest run -c scripts/nfd-check.vitest.config.ts
 *
 * Names: nfd-ghost-sdk's v1-nfds.txt and NFD_SAMPLE (300) from all-nfd-apps.csv,
 * picked with a fixed seed (NFD_SDK_DIR, default ../nfd-ghost-sdk/projects/sdk).
 */
import fs from "node:fs";
import path from "node:path";
import { test } from "vitest";
import { getNfdReader } from "src/packages/nfd/nfdGhost";
import { searchNFD } from "src/components/Modules/Explorer/Search/CoreSearch";

function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function pool<T, R>(items: T[], n: number, f: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await f(items[i]);
      }
    }),
  );
  return out;
}

/** What the REST search opened: `[account, ...alt]`, or the error. */
async function rest(name: string): Promise<string[] | string> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://api.nf.domains/nfd/${name}`);
    if (res.status === 404) return "not found";
    if ((res.status === 429 || res.status >= 500) && attempt < 6) {
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      continue;
    }
    if (!res.ok) return `REST ${res.status}`;
    const data = await res.json();
    return [...new Set([data.depositAccount, ...(data.caAlgo ?? [])])].filter(Boolean);
  }
}

test("search parity with the NFD REST API", async () => {
  const dir = process.env.NFD_SDK_DIR ?? path.resolve("../nfd-ghost-sdk/projects/sdk");
  const v1 = fs.readFileSync(path.join(dir, "v1-nfds.txt"), "utf8").split("\n").map((l) => l.trim()).filter(Boolean);
  const all = fs
    .readFileSync(path.join(dir, "all-nfd-apps.csv"), "utf8")
    .split("\n")
    .slice(1)
    .map((l) => l.split(",")[1])
    .filter(Boolean);
  const rand = random(7);
  const sample = new Set<string>();
  while (sample.size < Number(process.env.NFD_SAMPLE ?? 300)) sample.add(all[Math.floor(rand() * all.length)]);
  const names = [...new Set([...v1, ...sample])];

  const nfd = getNfdReader(true)!;
  const rows = await pool(names, 6, async (name) => {
    const theirs = await rest(name);
    let notice: string | undefined;
    let ours: string[] | string;
    try {
      const to = await searchNFD(name, { nfd, onNotice: (m) => (notice = m) });
      const [pathname, query] = to.split("?alt=");
      ours = [pathname.replace("/account/", ""), ...(query ? query.split(":") : [])];
    } catch (e) {
      ours = (e as Error).message.includes("not found") ? "not found" : (e as Error).message;
    }
    const record = await nfd.resolveName(name, { fields: [] });
    return { name, theirs, ours, notice, state: record?.state ?? "none" };
  });

  const same = (a: string[] | string, b: string[] | string) =>
    typeof a === "string" || typeof b === "string"
      ? a === b
      : a[0] === b[0] && [...a.slice(1)].sort().join() === [...b.slice(1)].sort().join();
  const firstSame = (a: string[] | string, b: string[] | string) =>
    typeof a !== "string" && typeof b !== "string" && a[0] === b[0];
  const diffs = rows.filter((r) => !same(r.theirs, r.ours));
  const byKind = new Map<string, number>();
  for (const r of diffs) {
    const kind = `${r.state}, ${firstSame(r.theirs, r.ours) ? "same account, alt differs" : "account differs"}`;
    byKind.set(kind, (byKind.get(kind) ?? 0) + 1);
  }
  console.log(`${names.length} names: ${rows.length - diffs.length} the same, ${diffs.length} differ`);
  for (const [kind, n] of byKind) console.log(`  ${n} ${kind}`);
  for (const r of diffs) {
    const show = (x: string[] | string) => (typeof x === "string" ? x : x.map((a) => a.slice(0, 8)).join(" "));
    console.log(`  ${r.name} [${r.state}] REST: ${show(r.theirs)} | SDK: ${show(r.ours)}${r.notice ? ` (${r.notice})` : ""}`);
  }
});
