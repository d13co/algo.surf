import { Networks } from "src/packages/core-sdk/constants";
import { Network } from "src/packages/core-sdk/network";
import { NodeConnectionParams } from "src/packages/core-sdk/types";
import { getOtherNetworkNodeConfigs, isLocalNodeConfig } from "./nodeConfig";

export const networkOrder = Object.keys(Networks) as Networks[];

export type NetworkConfig = [Networks, NodeConnectionParams];

/** The other networks, split by whether their node runs on the user's machine. */
export function getSearchableNetworks(): {
  local: NetworkConfig[];
  remote: NetworkConfig[];
} {
  const configs = [...getOtherNetworkNodeConfigs()] as NetworkConfig[];
  return {
    local: configs.filter(([, config]) => isLocalNodeConfig(config)),
    remote: configs.filter(([, config]) => !isLocalNodeConfig(config)),
  };
}

/**
 * Runs `probe` against each network and reports each hit as its node answers,
 * so one slow node cannot hide the ones that found something. A probe that
 * throws (not there, or the node is unreachable) counts as a miss.
 */
export async function findOnNetworks<T>(
  configs: NetworkConfig[],
  probe: (network: Network) => Promise<T | null | undefined>,
  onFound: (network: Networks, found: T) => void,
): Promise<void> {
  await Promise.all(
    configs.map(async ([name, config]) => {
      try {
        // No retries: a network that is down should not hold up the others
        const found = await probe(new Network(config, { retry: false }));
        if (found !== null && found !== undefined) {
          onFound(name, found);
        }
      } catch (e) {
        // not on this network, or the node is unreachable
      }
    }),
  );
}

/** Sorts networks in their canonical order. */
export function byNetworkOrder(a: Networks, b: Networks): number {
  return networkOrder.indexOf(a) - networkOrder.indexOf(b);
}
