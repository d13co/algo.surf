import { AlgorandClient } from "@algorandfoundation/algokit-utils";
import { NfdGhostSDK } from "nfd-ghost-sdk";
import { network, Networks } from "src/packages/core-sdk/constants";
import { clientToken } from "src/packages/core-sdk/network";
import { getNodeConfig } from "src/utils/nodeConfig";
import { getTimeTravelNode, getTTAlgorand } from "src/utils/timeTravel";

/** The NFD registry app per network; none elsewhere. */
const REGISTRY_APP_IDS: Partial<Record<string, number>> = {
  [Networks.Mainnet]: 760937186,
  [Networks.Testnet]: 84366825,
  [Networks.Betanet]: 842656530,
};

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

/** Reader query requests in flight at once: labels batch into one query per round, so few are needed. */
const READER_CONCURRENCY = 2;

let reader: { key: string; sdk: NfdGhostSDK } | undefined;

/**
 * nfd-ghost-sdk for names: address labels, the account header, the `?alt=`
 * check and `*.algo` search, at the page's round. On the time-travel node when
 * `timeTravel` (one is set and serves this network), so every read comes from
 * one node; else on the network's algod, which needs read-only queries too
 * (see useNfdReader). Its own client: labels are decoration, so their retries
 * don't raise the retry toast. Null without a registry on this network.
 */
export function getNfdReader(timeTravel: boolean): NfdGhostSDK | null {
  const registryAppId = nfdRegistryAppId();
  if (!registryAppId) return null;
  const node = timeTravel ? getTimeTravelNode() : null;
  const algod = getNodeConfig().algod;
  const key = nfdReaderKey(timeTravel);
  if (reader?.key !== key) {
    const algorand = node
      ? // The token as a header object: a string would make every read a CORS preflight.
        AlgorandClient.fromConfig({ algodConfig: { server: node.baseUrl, token: node.headers } })
      : AlgorandClient.fromConfig({ algodConfig: { server: algod.url, port: algod.port, token: clientToken(algod.token) } });
    reader = { key, sdk: new NfdGhostSDK({ algorand, registryAppId, concurrency: READER_CONCURRENCY }) };
  }
  return reader.sdk;
}

/** The node getNfdReader(timeTravel) reads from, for query keys. */
export function nfdReaderKey(timeTravel: boolean): string {
  const node = timeTravel ? getTimeTravelNode() : null;
  const algod = getNodeConfig().algod;
  return node ? `tt:${node.baseUrl}` : `algod:${algod.url}:${algod.port ?? ""}`;
}

/** A round for NFD query keys: the latest is its own key. */
export const nfdRoundKey = (round: number | undefined): number | "latest" => round ?? "latest";
