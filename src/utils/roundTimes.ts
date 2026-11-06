/**
 * Date → round, fast (ported from reti's ui/src/api/roundTimes.ts). Every
 * round ↔ timestamp pair the page sees goes into one in-page cache. A search
 * estimates the round from the cache, narrows it with reads of the timestamps
 * at a list of rounds, then finds the exact round with one last read of up to
 * 1,000 consecutive rounds' timestamps.
 */

export type RoundTime = { round: bigint; timestamp: number };

/** The rounds whose timestamps one sample pass reads, in one request. */
export const SAMPLE_ROUNDS = 16;

/** The most consecutive rounds one exact read covers: the AVM's block lookback. */
export const BLOCK_LOOKBACK = 1000n;

/** The most sample passes a search makes before scanning. Block times are steady: 1-2 is usual. */
const MAX_SAMPLE_PASSES = 8;

/**
 * The half-width of a sample pass around its estimate: the estimate's likely
 * error, a share of how far it is from the nearest round with a known time,
 * as block times drift.
 */
const DRIFT = 0.03;
const MIN_HALF_WIDTH = 4000n;

/** Round ↔ timestamp pairs, sorted by round. Timestamps never decrease as rounds increase. */
export class RoundTimes {
  private points: RoundTime[] = [];

  get size(): number {
    return this.points.length;
  }

  /** Where `round` is, or would go, in `points`. */
  private indexOf(round: bigint): number {
    let lo = 0;
    let hi = this.points.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.points[mid].round < round) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  add(round: bigint, timestamp: number): void {
    const i = this.indexOf(round);
    if (this.points[i]?.round === round) return;
    this.points.splice(i, 0, { round, timestamp });
  }

  addAll(points: Iterable<RoundTime>): void {
    for (const { round, timestamp } of points) this.add(round, timestamp);
  }

  /** The latest round with a known time. */
  last(): RoundTime | undefined {
    return this.points[this.points.length - 1];
  }

  get(round: bigint): number | undefined {
    const point = this.points[this.indexOf(round)];
    return point?.round === round ? point.timestamp : undefined;
  }

  /**
   * A round's likely block time (seconds): its own if known, else
   * interpolated between the known rounds either side, else extrapolated from
   * the nearest at the average block time of all known. Undefined with fewer
   * than two rounds known.
   */
  estimate(round: bigint): number | undefined {
    const known = this.get(round);
    if (known !== undefined) return known;
    const first = this.points[0];
    const last = this.points[this.points.length - 1];
    if (this.points.length < 2 || last.round === first.round) return undefined;
    const i = this.indexOf(round);
    const before = this.points[i - 1];
    const after = this.points[i];
    const [from, to] = before && after ? [before, after] : [first, last];
    const secondsPerRound = (to.timestamp - from.timestamp) / Number(to.round - from.round);
    const nearest = before ?? after;
    return Math.round(nearest.timestamp + Number(round - nearest.round) * secondsPerRound);
  }

  /**
   * The known rounds either side of the first round at or after `target`
   * (seconds): `below` is the last known round before it, `above` the first
   * known round at or after it.
   */
  bracket(target: number): { below?: RoundTime; above?: RoundTime } {
    let lo = 0;
    let hi = this.points.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.points[mid].timestamp < target) lo = mid + 1;
      else hi = mid;
    }
    return { below: this.points[lo - 1], above: this.points[lo] };
  }

  /** Forgets everything; for tests. */
  clear(): void {
    this.points = [];
  }
}

/** The page's round ↔ time pairs. */
export const roundTimes = new RoundTimes();

/** The reads a search makes. Each is one request, cancelled by `signal`. */
export interface TimeReader {
  /** Each round's block timestamp, in one batched read. Rounds must be at or before the latest. */
  timestampsAt(rounds: bigint[], signal?: AbortSignal): Promise<RoundTime[]>;
  /**
   * The first round from `start` with a timestamp at or after `target`,
   * scanning at most `BLOCK_LOOKBACK` rounds, up to `end` (a round known to
   * exist at or after the answer), in one read; undefined if none reaches it.
   */
  firstRoundAtOrAfter(start: bigint, target: number, end: bigint, signal?: AbortSignal): Promise<RoundTime | undefined>;
  /** The latest round and its timestamp. */
  latest(signal?: AbortSignal): Promise<RoundTime>;
  /** The earliest round a search returns, and its timestamp. */
  earliest(signal?: AbortSignal): Promise<RoundTime | undefined>;
}

/** `count` distinct rounds spread evenly from `from` to `to`, both included. */
export function spreadRounds(from: bigint, to: bigint, count: number): bigint[] {
  if (to <= from || count < 2) return [from];
  const span = to - from;
  const steps = BigInt(count - 1);
  const rounds = new Set<bigint>();
  for (let i = 0n; i <= steps; i++) rounds.add(from + (span * i) / steps);
  return [...rounds];
}

/**
 * The round whose state is the state at `time` (seconds), from
 * {@link roundAtTime}'s answer `first`, the first round at or after it. A page
 * shows the state as of the end of its round, so that's the last round at or
 * before `time`: the round before `first`, unless `first` landed on that very
 * second, or is the earliest round (`earliestRound`).
 */
export function roundAsOf(first: RoundTime, time: number, earliestRound?: bigint): bigint {
  const atEarliest = earliestRound !== undefined && first.round <= earliestRound;
  return first.timestamp > time && !atEarliest ? first.round - 1n : first.round;
}

export interface RoundAtTimeOptions {
  /**
   * Seconds the answer may be off by: the search stops once its estimate is
   * likely that close, and returns the estimated round (with `time` as its
   * timestamp) instead of the exact one. Undefined finds the exact round.
   */
  tolerance?: number;
  /** The round ↔ time pairs to use; the page's by default. */
  cache?: RoundTimes;
  signal?: AbortSignal;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
}

/**
 * The first round whose block timestamp is at or after `time`: the round on
 * screen from that moment on. A time after the latest block gives the latest
 * round; one before the earliest round gives the earliest.
 */
export async function roundAtTime(
  reader: TimeReader,
  time: Date | number,
  { tolerance, cache = roundTimes, signal }: RoundAtTimeOptions = {},
): Promise<RoundTime> {
  const target = time instanceof Date ? Math.ceil(time.getTime() / 1000) : Math.ceil(time);
  let { below, above } = cache.bracket(target);

  // Calibrate: read whichever end is still missing
  if (!above) {
    const latest = await reader.latest(signal);
    cache.add(latest.round, latest.timestamp);
    if (latest.timestamp < target) return latest;
  }
  if (!below) {
    throwIfAborted(signal);
    const earliest = await reader.earliest(signal);
    if (earliest) cache.add(earliest.round, earliest.timestamp);
  }
  ({ below, above } = cache.bracket(target));
  if (!above) throw new Error(`No round at or after ${new Date(target * 1000).toISOString()}`);
  if (!below) return above;

  // Narrow the bracket by sampling around an estimate until the estimate is
  // close enough or one exact read can cover the bracket. A pass whose window
  // missed the target (block times changed more than the drift allows, as
  // mainnet's did) is followed by one spread over the whole bracket.
  let missed = false;
  for (let pass = 1; above.round - below.round > 1n; pass++) {
    const span = above.round - below.round;
    const ratio = (target - below.timestamp) / (above.timestamp - below.timestamp);
    const estimate = below.round + BigInt(Math.round(Number(span) * ratio));
    const nearest = estimate - below.round < above.round - estimate ? estimate - below.round : above.round - estimate;
    if (tolerance !== undefined) {
      // The estimate is likely off by the drift in block time since the nearest known round
      const secondsPerRound = (above.timestamp - below.timestamp) / Number(span);
      const error = Number(nearest) * DRIFT * secondsPerRound;
      // An estimate, not a read: kept out of the cache
      if (error <= tolerance) return { round: estimate, timestamp: target };
    }
    if (span <= BLOCK_LOOKBACK) break;
    if (pass > MAX_SAMPLE_PASSES) throw new Error(`No round found for ${new Date(target * 1000).toISOString()}`);
    const drift = BigInt(Math.ceil(Number(nearest) * DRIFT));
    const half = drift > MIN_HALF_WIDTH ? drift : MIN_HALF_WIDTH;
    const windowed = !missed;
    const from = windowed && estimate - half > below.round ? estimate - half : below.round + 1n;
    const to = windowed && estimate + half < above.round ? estimate + half : above.round - 1n;
    throwIfAborted(signal);
    const read = await reader.timestampsAt(spreadRounds(from, to, SAMPLE_ROUNDS), signal);
    if (read.length === 0) throw new Error(`No block times read for ${new Date(target * 1000).toISOString()}`);
    cache.addAll(read);
    ({ below, above } = cache.bracket(target));
    if (!below || !above) throw new Error(`No round found for ${new Date(target * 1000).toISOString()}`);
    missed = windowed && (below.round < from || above.round > to);
  }

  if (above.round - below.round === 1n) return above;

  // Scan forward from the round after the last one known to be before the target
  throwIfAborted(signal);
  const found = await reader.firstRoundAtOrAfter(below.round + 1n, target, above.round, signal);
  // Every scanned round was before the target, so the answer is the known round above
  const result = found ?? above;
  cache.add(result.round, result.timestamp);
  return result;
}
