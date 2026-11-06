/**
 * Cross-checks the NFD history loader (src/utils/nfdHistory.ts) against
 * nfd-ghost-sdk's own answers at sampled rounds. Reads a live dtalgod, so it
 * is not part of `pnpm test`:
 *
 *   REACT_APP_NETWORK=Mainnet REACT_APP_TIMETRAVEL_ALGOD_URL=http://127.0.0.1:8080 \
 *     NFD_ACCOUNTS=20 npx vitest run -c scripts/nfd-check.vitest.config.ts
 *
 * Accounts: the fixtures, plus NFD_ACCOUNTS from nfd-ghost-sdk's addresses.txt
 * (NFD_ADDRESSES_FILE, default ../nfd-ghost-sdk/projects/sdk/addresses.txt from the working directory),
 * picked with a fixed seed. NFD_ADDRESSES=a,b,c checks only those.
 *
 * Rounds: 64 spread from the registry's creation to the latest round, 16
 * random ones, every period's from-1, from, to-1 and to, and every round the
 * loader checked ±1 (even spacing alone only catches over-reporting).
 *
 * - Links: `reverseLookup` at each round must match the loader's link periods
 *   then exactly, primary included.
 * - Ownership: the loader's owned set must include `getOwned`'s, which only
 *   knows owner boxes and assets held at the round. Extras are checked with
 *   `getRecord`: each must name the account as its owner.
 */
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";
import { getNfdGhost, nfdRegistryAppId } from "src/packages/nfd/nfdGhost";
import { loadNfdAssetHistory, loadNfdHistory, NfdPeriod } from "src/utils/nfdHistory";

const FIXTURES = [
  "22T47MKF2YHPJVOJN4PKSAD5EPRBWWL4VZ4G6I6XIDFI5FS7OZYYY3PPWU", // king.dragonfi.algo
  "43H6L4VKWP23F3UO64GUS4M5TFT5MOZRJPUFO57M3X2SDONQXJCT5MQZRE", // dealer: 818.algo (v1 lsig), building.algo
  "27CZLZFHMRXQNRAQP5FQJ6E7KEKXTNGIIAPAG5LNPE4JCUGEAEUXJHR43Y", // bakare.algo: expiry
  "XSKED5VKZZCSYNDWXZJI65JM2HP7HZFJWCOBIMOONKHTK5UVKENBNVDEYM", // Tinyman escrow: many assets
];

/** A small seeded PRNG (mulberry32), so a run can be repeated. */
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function accounts(): string[] {
  if (process.env.NFD_ADDRESSES) return process.env.NFD_ADDRESSES.split(",").filter(Boolean);
  const file = process.env.NFD_ADDRESSES_FILE ?? path.resolve("../nfd-ghost-sdk/projects/sdk/addresses.txt");
  const all = fs.readFileSync(file, "utf8").split("\n").map((l) => l.trim()).filter(Boolean);
  const rand = random(Number(process.env.NFD_SEED ?? 1));
  const picked = new Set<string>();
  const want = Number(process.env.NFD_ACCOUNTS ?? 16);
  while (picked.size < Math.min(want, all.length)) picked.add(all[Math.floor(rand() * all.length)]);
  return [...new Set([...FIXTURES, ...picked])];
}

const held = (p: NfdPeriod, r: number) => p.from <= r && (p.to === undefined || r < p.to);

test("NFD history matches nfd-ghost-sdk at sampled rounds", async () => {
  const sdk = getNfdGhost()!;
  const registryAppId = nfdRegistryAppId()!;
  expect(await sdk.supported()).toBe(true);
  const creation = Number(await sdk.getRegistryCreationRound());
  const failures: string[] = [];

  for (const address of accounts()) {
    const started = Date.now();
    const h = await loadNfdHistory(address, { sdk, registryAppId });
    const a = await loadNfdAssetHistory(address, { sdk, registryAppId, latestRound: h.latestRound, known: h.candidates });
    const periods = [...h.periods, ...a.periods];
    const latest = h.latestRound;
    const ms = Date.now() - started;

    const rand = random(address.charCodeAt(0) * 7919 + address.charCodeAt(1));
    const rounds = new Set<number>();
    for (let i = 0; i < 64; i++) rounds.add(Math.round(creation + ((latest - creation) * i) / 63));
    for (let i = 0; i < 16; i++) rounds.add(creation + Math.floor(rand() * (latest - creation)));
    for (const p of periods) for (const r of [p.from - 1, p.from, p.to! - 1, p.to!]) if (Number.isFinite(r)) rounds.add(r);
    for (const r of h.checkedRounds) for (const d of [-1, 0, 1]) rounds.add(r + d);
    const list = [...rounds].filter((r) => r >= creation && r <= latest).sort((x, y) => x - y);

    // Links
    const series = await sdk.reverseLookupSeries([address], list, { fields: [], maxPoints: list.length });
    let linkMismatches = 0;
    for (const point of series) {
      const r = Number(point.round);
      if (!point.ok) {
        failures.push(`${address} links at ${r}: ${(point as { error: Error }).error.message}`);
        continue;
      }
      const want = (point.value.get(address) ?? []).map((rec, i) => `${rec.appId}:${i === 0 ? "primary" : "linked"}`).sort();
      const got = periods.filter((p) => p.role !== "owner" && held(p, r)).map((p) => `${p.appId}:${p.role}`).sort();
      if (want.join() !== got.join()) {
        linkMismatches++;
        if (linkMismatches <= 5) failures.push(`${address} links at ${r}: sdk [${want}] loader [${got}]`);
      }
    }

    // Ownership: a superset of getOwned, and every extra owned per getRecord
    let ownerMissing = 0;
    let extrasChecked = 0;
    const extras: { appId: number; round: number }[] = [];
    for (let i = 0; i < list.length; i += 8) {
      await Promise.all(
        list.slice(i, i + 8).map(async (r) => {
          const owned = new Set((await sdk.getOwned(address, { round: r, fields: [] })).map((rec) => Number(rec.appId)));
          const loader = new Set(periods.filter((p) => p.role === "owner" && held(p, r)).map((p) => p.appId));
          for (const id of owned) {
            if (!loader.has(id)) {
              ownerMissing++;
              if (ownerMissing <= 5) failures.push(`${address} owner at ${r}: getOwned has ${id}, the loader doesn't`);
            }
          }
          for (const id of loader) if (!owned.has(id)) extras.push({ appId: id, round: r });
        }),
      );
    }
    if (extras.length) {
      const records = await sdk.getRecordsAt(extras, { fields: [] });
      records.forEach((rec, i) => {
        extrasChecked++;
        if (rec?.owner !== address) {
          failures.push(`${address} owner at ${extras[i].round}: the loader has ${extras[i].appId}, getRecord says ${rec ? rec.owner : "null"}`);
        }
      });
    }
    console.log(
      `${address.slice(0, 8)}… ${periods.length} periods, ${list.length} rounds, ${linkMismatches} link mismatches, ` +
        `${ownerMissing} owners missing, ${extrasChecked} extras checked by hand; loaded in ${(ms / 1000).toFixed(1)} s ` +
        `(${h.stats.requests + a.stats.requests} feed pages, ${h.stats.recordPairs + a.stats.recordPairs} pairs)` +
        (h.notes.length + a.notes.length ? `; notes: ${[...h.notes, ...a.notes].join(" | ")}` : ""),
    );
  }
  if (failures.length) console.log(failures.join("\n"));
  expect(failures).toEqual([]);
});
