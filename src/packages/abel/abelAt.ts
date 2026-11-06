import { AbelGhostSDK } from "abel-ghost-sdk";
import { getTimeTravelNode, getTTAlgorand } from "src/utils/timeTravel";

const isMainnet = process.env.REACT_APP_NETWORK === "Mainnet";

let cached: { node: string; abel: AbelGhostSDK } | undefined;

/**
 * An abel SDK on the time-travel node, for reads at past rounds (block times,
 * balances, holdings and labels at rounds), or null without a node. One per
 * node, made on first use. `auto` queries where the node has them on, else
 * simulates at each round.
 */
export function getAbelAt(): AbelGhostSDK | null {
  const node = getTimeTravelNode();
  const algorand = getTTAlgorand();
  if (!node || !algorand) return null;
  const key = JSON.stringify(node);
  if (cached?.node !== key) {
    cached = {
      node: key,
      abel: new AbelGhostSDK({
        algorand,
        registryAppId: isMainnet ? 2914159523n : undefined,
        backend: "auto",
        // The mainnet fee sink (see abel.ts).
        readerAccount: isMainnet ? "Y76M3MSY6DKBRHBL7C3NNDXGS5IIMQVQVUAB6MP4XEMMGVF2QWNPL226CA" : undefined,
      }),
    };
  }
  return cached.abel;
}
