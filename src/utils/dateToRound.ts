import type { QueryClient } from "@tanstack/react-query";
import { getAbelAt } from "src/packages/abel/abelAt";
import { BlockClient } from "src/packages/core-sdk/clients/blockClient";
import explorer from "src/utils/dappflow";
import { getDTAlgod } from "src/utils/timeTravel";
import { BLOCK_LOOKBACK, roundAsOf, roundAtTime, RoundTime, roundTimes, TimeReader } from "src/utils/roundTimes";

/** The earliest round a search returns: round 0 has no timestamp of its own. */
const EARLIEST_ROUND = 1n;

/** Block times on the time-travel node: abel reads them in one query or simulate per call. */
function abelReader(): TimeReader {
  const abel = getAbelAt();
  const algod = getDTAlgod();
  if (!abel || !algod) throw new Error("No time travel node configured");
  return {
    async timestampsAt(rounds) {
      const results = await abel.getBlockTimesAndTcAtRounds(rounds, 1);
      return results.flatMap((r) => (r.ok && r.value[0] ? [{ round: r.round, timestamp: r.value[0].ts }] : []));
    },
    async firstRoundAtOrAfter(start, target, end) {
      const last = end < start + BLOCK_LOOKBACK - 1n ? end : start + BLOCK_LOOKBACK - 1n;
      const blocks = await abel.getBlockTimesAndTc(start, last);
      for (const b of blocks) roundTimes.add(b.rnd, b.ts);
      const hit = blocks.find((b) => b.ts >= target);
      return hit ? { round: hit.rnd, timestamp: hit.ts } : undefined;
    },
    async latest() {
      const { lastRound } = await algod.status().do();
      return headerTime(lastRound);
    },
    earliest: () => headerTime(EARLIEST_ROUND),
  };
}

/** A round's block time from the time-travel node's header; the indexer's when the node has pruned it. */
async function headerTime(round: bigint): Promise<RoundTime> {
  try {
    const { block } = await getDTAlgod()!.block(round).headerOnly(true).do();
    return { round, timestamp: Number(block.header.timestamp) };
  } catch {
    const header = await new BlockClient(explorer.network).getHeader(Number(round));
    return { round, timestamp: Number(header.timestamp) };
  }
}

/** Adds the block headers the page has already read to the round ↔ time cache. */
export function seedFromQueryCache(queryClient: QueryClient): void {
  for (const [key, data] of queryClient.getQueriesData<{ round?: bigint | number; timestamp?: bigint | number }>({
    queryKey: ["block-header"],
  })) {
    const round = key[1];
    if (typeof round === "number" && round > 0 && data?.timestamp) roundTimes.add(BigInt(round), Number(data.timestamp));
  }
}

/**
 * The round whose state is the state at `time` (seconds): the last round at
 * or before it. Read from block times on the time-travel node; from the
 * indexer's block headers when that fails.
 */
export async function roundAsOfTime(time: number, signal?: AbortSignal): Promise<number> {
  try {
    const first = await roundAtTime(abelReader(), time, { signal });
    return Number(roundAsOf(first, time, EARLIEST_ROUND));
  } catch (e) {
    if (signal?.aborted) throw e;
    console.warn("Date to round through abel failed, asking the indexer:", e);
    const after = await new BlockClient(explorer.network).firstRoundAfter(time);
    if (after === null) {
      const { lastRound } = await explorer.network.getClient().status().do();
      return Number(lastRound);
    }
    return Math.max(Number(EARLIEST_ROUND), after - 1);
  }
}
