import type { AlgorandClient } from "@algorandfoundation/algokit-utils";
import { NfdGhostSDK } from "nfd-ghost-sdk";
import { network, Networks } from "src/packages/core-sdk/constants";
import { getTTAlgorand } from "src/utils/timeTravel";

/** The NFD registry app per network; none elsewhere. */
const REGISTRY_APP_IDS: Partial<Record<string, number>> = {
  [Networks.Mainnet]: 760937186,
  [Networks.Testnet]: 84366825,
  [Networks.Betanet]: 842656530,
};

/** The first round of the registry generation with `"O" ‖ owner ‖ appId` owner boxes (MainNet). */
export const OWNER_BOXES_FROM_ROUND: number | undefined = network === Networks.Mainnet ? 42181254 : undefined;

export function nfdRegistryAppId(): number | undefined {
  return REGISTRY_APP_IDS[network];
}

/** SDK query requests in flight at once: the node answers 503 past 8, and the page reads too. */
const SDK_CONCURRENCY = 3;

/** One SDK per client: getTTAlgorand() is already one per node, so the SDK's cache and limiter are too. */
const sdks = new WeakMap<AlgorandClient, NfdGhostSDK>();

/**
 * nfd-ghost-sdk on the time-travel node: NFD reads at any round, through
 * read-only queries (`POST /v2/query`). It shares the node's HTTP client, so
 * busy 503s and 429s are retried there, with the retry toast. Null without a
 * registry on this network or a time-travel node. Whether the node runs
 * queries is `sdk.supported()`.
 */
export function getNfdGhost(): NfdGhostSDK | null {
  const registryAppId = nfdRegistryAppId();
  const algorand = getTTAlgorand();
  if (!registryAppId || !algorand) return null;
  let sdk = sdks.get(algorand);
  if (!sdk) {
    sdk = new NfdGhostSDK({ algorand, registryAppId, concurrency: SDK_CONCURRENCY });
    sdks.set(algorand, sdk);
  }
  return sdk;
}
