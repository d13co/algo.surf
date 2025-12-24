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

const algorand = AlgorandClient.fromConfig({ algodConfig });
algorand.setSuggestedParamsCacheTimeout(20000);
algorand.getSuggestedParams();

export const abel = new AbelGhostSDK({
  algorand,
  concurrency: 7,
  registryAppId: isMainnet ? BigInt(2914159523) : undefined,
  ghostAppId: isMainnet ? BigInt(3381542955) : undefined,
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