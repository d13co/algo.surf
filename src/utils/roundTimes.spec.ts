import { describe, expect, it } from "vitest";
import { roundAsOf, roundAtTime, RoundTime, RoundTimes, spreadRounds, type TimeReader } from "./roundTimes";

/** A fake chain: `segments` of [rounds, seconds per round] from `start` (at T0). */
function chain(start: bigint, tip: bigint, segments: [rounds: bigint, seconds: number][]) {
  const T0 = 1_700_000_000;
  const timestampAt = (round: bigint): number => {
    let seconds = 0;
    let from = start;
    for (const [length, blockTime] of segments) {
      const to = from + length < round ? from + length : round;
      if (to > from) seconds += Number(to - from) * blockTime;
      from += length;
      if (from >= round) break;
    }
    return Math.floor(T0 + seconds);
  };
  /** The answer, by brute-force binary search over the fake chain. */
  const firstAtOrAfter = (target: number): bigint => {
    let lo = start;
    let hi = tip;
    while (lo < hi) {
      const mid = (lo + hi) / 2n;
      if (timestampAt(mid) < target) lo = mid + 1n;
      else hi = mid;
    }
    return lo;
  };
  const point = (round: bigint): RoundTime => ({ round, timestamp: timestampAt(round) });
  /** A reader over the fake chain that counts each request. */
  const fakeReader = () => {
    const calls = { timestampsAt: 0, firstRoundAtOrAfter: 0, latest: 0, earliest: 0 };
    const reader: TimeReader = {
      async timestampsAt(rounds) {
        calls.timestampsAt++;
        expect(rounds.length).toBeLessThanOrEqual(16);
        return rounds.map(point);
      },
      async firstRoundAtOrAfter(from, target, end) {
        calls.firstRoundAtOrAfter++;
        const last = from + 999n < end ? from + 999n : end;
        for (let round = from; round <= last; round++) {
          if (timestampAt(round) >= target) return point(round);
        }
        return undefined;
      },
      async latest() {
        calls.latest++;
        return point(tip);
      },
      async earliest() {
        calls.earliest++;
        return point(start);
      },
    };
    return { reader, calls };
  };
  return { T0, timestampAt, firstAtOrAfter, point, fakeReader };
}

const CREATION = 1_000_000n;
const TIP = 21_000_000n;
/** Block time drifts: 2.9 s for 5M rounds, then 2.8 s for 10M, then 2.85 s. */
const { T0, timestampAt, firstAtOrAfter, point, fakeReader } = chain(CREATION, TIP, [
  [5_000_000n, 2.9],
  [10_000_000n, 2.8],
  [TIP, 2.85],
]);

const reads = (calls: ReturnType<typeof fakeReader>["calls"]) => calls.timestampsAt + calls.firstRoundAtOrAfter;

describe("RoundTimes", () => {
  it("keeps pairs sorted and distinct", () => {
    const cache = new RoundTimes();
    cache.addAll([point(30n), point(10n), point(20n), point(10n)]);
    expect(cache.size).toBe(3);
    expect(cache.get(20n)).toBe(timestampAt(20n));
    expect(cache.get(15n)).toBeUndefined();
    expect(cache.last()?.round).toBe(30n);
  });

  it("brackets a time between the known rounds either side of it", () => {
    const cache = new RoundTimes();
    cache.addAll([
      { round: 10n, timestamp: 100 },
      { round: 20n, timestamp: 200 },
    ]);
    expect(cache.bracket(150)).toEqual({
      below: { round: 10n, timestamp: 100 },
      above: { round: 20n, timestamp: 200 },
    });
    // A known round at exactly the time is the first at or after it
    expect(cache.bracket(200).above?.round).toBe(20n);
    expect(cache.bracket(50).below).toBeUndefined();
    expect(cache.bracket(250).above).toBeUndefined();
  });
});

describe("spreadRounds", () => {
  it("spreads distinct rounds over both ends", () => {
    expect(spreadRounds(0n, 30n, 4)).toEqual([0n, 10n, 20n, 30n]);
    expect(spreadRounds(0n, 2n, 16)).toEqual([0n, 1n, 2n]);
  });
});

describe("roundAtTime", () => {
  const targets = [
    timestampAt(1_000_500n) - 1, // just after creation
    timestampAt(5_999_999n) + 1, // across a change of block time
    timestampAt(13_456_789n),
    timestampAt(20_998_000n) - 2, // near the tip
  ];

  it.each(targets)("finds the first round at or after %i from a cold cache", async (target) => {
    const cache = new RoundTimes();
    const { reader, calls } = fakeReader();
    const result = await roundAtTime(reader, target, { cache });
    expect(result.round).toBe(firstAtOrAfter(target));
    expect(result.timestamp).toBe(timestampAt(result.round));
    // The two ends, then a few sample passes and one scan
    expect(calls.latest + calls.earliest).toBe(2);
    expect(reads(calls)).toBeLessThanOrEqual(4);
  });

  it("needs fewer reads once the cache knows the neighbourhood", async () => {
    const cache = new RoundTimes();
    const { reader, calls } = fakeReader();
    const first = timestampAt(13_456_789n);
    await roundAtTime(reader, first, { cache });
    const before = { ...calls };
    const next = first + 86_400;
    const result = await roundAtTime(reader, next, { cache });
    expect(result.round).toBe(firstAtOrAfter(next));
    expect(calls.latest + calls.earliest).toBe(before.latest + before.earliest);
    expect(reads(calls) - reads(before)).toBeLessThanOrEqual(2);
  });

  it("reads nothing when known rounds either side are adjacent", async () => {
    const cache = new RoundTimes();
    cache.addAll([point(CREATION), point(TIP), point(9_999_999n), point(10_000_000n)]);
    const { reader, calls } = fakeReader();
    const result = await roundAtTime(reader, timestampAt(10_000_000n), { cache });
    expect(result.round).toBe(firstAtOrAfter(timestampAt(10_000_000n)));
    expect(calls).toEqual({ timestampsAt: 0, firstRoundAtOrAfter: 0, latest: 0, earliest: 0 });
  });

  it("gives the earliest round for a time before it, and the latest for one after it", async () => {
    const cache = new RoundTimes();
    const { reader } = fakeReader();
    expect((await roundAtTime(reader, T0 - 1000, { cache })).round).toBe(CREATION);
    expect((await roundAtTime(reader, timestampAt(TIP) + 1000, { cache })).round).toBe(TIP);
  });

  it.each([timestampAt(5_999_999n) + 1, timestampAt(13_456_789n), timestampAt(20_000_000n)])(
    "stops at an estimate within the tolerance, after one sample pass (%i)",
    async (target) => {
      const cache = new RoundTimes();
      cache.addAll([point(CREATION), point(TIP)]);
      const { reader, calls } = fakeReader();
      const tolerance = 9 * 3600;
      const result = await roundAtTime(reader, target, { tolerance, cache });
      expect(Math.abs(timestampAt(result.round) - target)).toBeLessThanOrEqual(tolerance);
      expect(calls.timestampsAt).toBe(1);
      expect(calls.firstRoundAtOrAfter).toBe(0);
      // An estimate isn't a read, so it isn't kept
      expect(cache.get(result.round)).toBeUndefined();
    },
  );

  it("reads nothing when the known rounds already give an estimate within the tolerance", async () => {
    const cache = new RoundTimes();
    cache.addAll([point(13_450_000n), point(13_460_000n)]);
    const { reader, calls } = fakeReader();
    const target = timestampAt(13_456_789n);
    const result = await roundAtTime(reader, target, { tolerance: 3600, cache });
    expect(Math.abs(timestampAt(result.round) - target)).toBeLessThanOrEqual(3600);
    expect(reads(calls)).toBe(0);
  });

  it("stops between reads once its signal aborts", async () => {
    const cache = new RoundTimes();
    const { reader, calls } = fakeReader();
    const controller = new AbortController();
    const sample = reader.timestampsAt;
    // The viewer moves on while the first sample pass is in flight
    reader.timestampsAt = async (rounds, signal) => {
      const points = await sample(rounds, signal);
      controller.abort();
      return points;
    };
    const search = roundAtTime(reader, timestampAt(13_456_789n), { cache, signal: controller.signal });
    await expect(search).rejects.toMatchObject({ name: "AbortError" });
    expect(calls.timestampsAt).toBe(1);
    expect(calls.firstRoundAtOrAfter).toBe(0);
  });
});

describe("roundAtTime on mainnet's block times", () => {
  // Mainnet's own block times: real timestamps every 2.5M rounds, linear between them.
  const MAINNET: [bigint, number][] = [
    [1n, 1560211225], [2500000n, 1571190250], [5000000n, 1582237321], [7500000n, 1593202072],
    [10000000n, 1604222096], [12500000n, 1615245279], [15000000n, 1626249083], [17500000n, 1637218966],
    [20000000n, 1648182789], [22500000n, 1659056623], [25000000n, 1669012438], [27500000n, 1678293181],
    [30000000n, 1687583281], [32500000n, 1696103707], [35000000n, 1704529424], [37500000n, 1711865523],
    [40000000n, 1719065016], [42500000n, 1726225080], [45000000n, 1733394817], [47500000n, 1740403795],
    [50000000n, 1747449435], [52500000n, 1754515092], [55000000n, 1761583479], [57500000n, 1768598157],
    [60000000n, 1775538824], [62500000n, 1782415013], [65000000n, 1789290977], [66690000n, 1793951942],
  ];
  const m = chain(
    1n,
    66_690_000n,
    MAINNET.slice(1).map(([round, ts], i): [bigint, number] => {
      const [prevRound, prevTs] = MAINNET[i];
      return [round - prevRound, (ts - prevTs) / Number(round - prevRound)];
    }),
  );

  it.each([999_761n, 22_013_283n, 37_026_769n, 57_011_578n, 66_600_000n])(
    "finds round %i from a cold cache within the pass budget",
    async (round) => {
      const cache = new RoundTimes();
      const { reader, calls } = m.fakeReader();
      const target = m.timestampAt(round);
      const result = await roundAtTime(reader, target, { cache });
      expect(result.round).toBe(m.firstAtOrAfter(target));
      expect(reads(calls)).toBeLessThanOrEqual(8);
    },
  );
});

describe("RoundTimes.estimate", () => {
  const cache = new RoundTimes();
  cache.addAll([
    { round: 100n, timestamp: 1_000 },
    { round: 200n, timestamp: 1_300 },
    { round: 300n, timestamp: 1_500 },
  ]);

  it("gives a known round its own time", () => {
    expect(cache.estimate(200n)).toBe(1_300);
  });

  it("interpolates between the known rounds either side", () => {
    expect(cache.estimate(150n)).toBe(1_150);
    expect(cache.estimate(250n)).toBe(1_400);
  });

  it("extrapolates from the nearest known round at the average block time", () => {
    // 500 s over 200 rounds: 2.5 s a round
    expect(cache.estimate(400n)).toBe(1_750);
    expect(cache.estimate(60n)).toBe(900);
  });

  it("has no estimate with fewer than two rounds known", () => {
    const one = new RoundTimes();
    expect(one.estimate(5n)).toBeUndefined();
    one.add(10n, 100);
    expect(one.estimate(5n)).toBeUndefined();
  });
});

describe("roundAsOf", () => {
  it("is the round before the first one after the time", () => {
    expect(roundAsOf({ round: 500n, timestamp: 1_002 }, 1_000)).toBe(499n);
  });

  it("is the first round itself when it landed on that very second", () => {
    expect(roundAsOf({ round: 500n, timestamp: 1_000 }, 1_000)).toBe(500n);
  });

  it("is the latest round when the time is after it", () => {
    expect(roundAsOf({ round: 500n, timestamp: 990 }, 1_000)).toBe(500n);
  });

  it("never goes before the earliest round", () => {
    expect(roundAsOf({ round: 500n, timestamp: 1_002 }, 1_000, 500n)).toBe(500n);
  });
});
