import { AbelGhostSDK } from "abel-ghost-sdk";
import { getNodeConfig } from "../../utils/nodeConfig";
import { AlgorandClient } from "@algorandfoundation/algokit-utils";
import { A_AssetTiny } from "../core-sdk/types";
import { AssetTinyLabels } from "abel-ghost-sdk";

const config = getNodeConfig();
const network = process.env.REACT_APP_NETWORK;
const isMainnet = network === "Mainnet";

const { url: server, port, token } = config.algod;

const algodConfig = {
  server,
  port,
  token,
};

export const algorand = AlgorandClient.fromConfig({ algodConfig });
algorand.setSuggestedParamsCacheTimeout(20000);
algorand.getSuggestedParams();

export const abel = new AbelGhostSDK({
  algorand,
  concurrency: 7,
  registryAppId: isMainnet ? BigInt(2914159523) : undefined,
  ghostAppId: isMainnet ? BigInt(3381542955) : undefined,
  readerAccount: isMainnet ? "Y76M3MSY6DKBRHBL7C3NNDXGS5IIMQVQVUAB6MP4XEMMGVF2QWNPL226CA" : undefined,
  // The SDK re-caches suggested params after every call, so this, not the 20s
  // above, is what the cache timeout ends up being. Its own default is 75ms,
  // which costs a params request per fetch that is not part of the same burst.
  // The ceiling is the 10-round validity window algokit gives these simulate
  // calls: past ~27s of staleness (10 rounds at ~2.7s) the node rejects them
  // as dead. 5s is ~2 rounds, leaving room for a burst to drain plus RTT.
  cacheParamsTimeout: 5000,
});

export const abelTinyToAssetTiny = (tiny: AssetTinyLabels): A_AssetTiny => {
  // @ts-ignore
  if ("deleted" in tiny && tiny.deleted) {
    return {
      index: Number(tiny.id),
      params: {
        decimals: 0,
        name: "(deleted)",
        "unit-name": "(none)",
      },
      peraVerified: false,
    };
  }
  return {
    index: Number(tiny.id),
    params: {
      decimals: tiny.decimals,
      name: tiny.name,
      "unit-name": tiny.unitName,
    },
    peraVerified: tiny.labels.includes("pv"),
  };
};