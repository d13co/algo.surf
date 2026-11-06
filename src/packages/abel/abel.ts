import { AbelGhostSDK } from "abel-ghost-sdk";
import { getNodeConfig } from "../../utils/nodeConfig";
import { AlgorandClient } from "@algorandfoundation/algokit-utils";
import { A_AssetTiny } from "../core-sdk/types";
import { AssetTinyLabels } from "abel-ghost-sdk";
import { retryOptions } from "../../utils/retryWaits";
import { clientToken } from "../core-sdk/network";

const config = getNodeConfig();
const network = process.env.REACT_APP_NETWORK;
const isMainnet = network === "Mainnet";

const { url: server, port, token } = config.algod;

const algodConfig = {
  server,
  port,
  token: clientToken(token),
  // algokit-utils retries by default; this reports the waits to RetryWaitToast
  retry: retryOptions("algod"),
};

export const algorand = AlgorandClient.fromConfig({ algodConfig });
algorand.setSuggestedParamsCacheTimeout(20000);
algorand.getSuggestedParams();

export const abel = new AbelGhostSDK({
  algorand,
  registryAppId: isMainnet ? BigInt(2914159523) : undefined,
  // No ghostAppId: the deployed reader (3381542955) predates this SDK's
  // reader contract and rejects its calls. Each read carries the reader instead.
  // The mainnet fee sink, explicitly: the SDK finds it per call, but its app
  // factory would otherwise default to the TestNet/BetaNet fee sink.
  readerAccount: isMainnet ? "Y76M3MSY6DKBRHBL7C3NNDXGS5IIMQVQVUAB6MP4XEMMGVF2QWNPL226CA" : undefined,
  // The SDK re-caches suggested params after every call, so this, not the 20s
  // above, is what the cache timeout ends up being. Its own default is 3s.
  // The ceiling is the 10-round validity window algokit gives these simulate
  // calls: past ~27s of staleness (10 rounds at ~2.7s) the node rejects them
  // as dead. 5s is ~2 rounds, leaving room for a burst to drain plus RTT.
  cacheParamsTimeout: 5000,
});

const DELETED_ASSET_NAME = "(deleted)";

/** abelTinyToAssetTiny's stand-in for a destroyed asset, whose decimals and unit are not known. */
export const isDeletedAssetTiny = (asset: A_AssetTiny): boolean => asset.params.name === DELETED_ASSET_NAME;

export const abelTinyToAssetTiny = (tiny: AssetTinyLabels): A_AssetTiny => {
  // @ts-ignore
  if ("deleted" in tiny && tiny.deleted) {
    return {
      index: Number(tiny.id),
      params: {
        decimals: 0,
        name: DELETED_ASSET_NAME,
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