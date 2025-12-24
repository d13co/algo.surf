import { AbelSDK } from "abel-sdk";
import { getNodeConfig } from "../../utils/nodeConfig";
import { AlgorandClient } from "@algorandfoundation/algokit-utils";
import { AssetTinyLabels } from "abel-sdk";
import { A_AssetHoldingTiny, A_AssetTiny } from "../core-sdk/types";
import React, { useEffect } from "react";
import AssetCache from "../../components/Common/AssetCache";

const config = getNodeConfig();

const { url: server, port, token } = config.algod;

const algodConfig = {
  server,
  port,
  token,
};

const algorand = AlgorandClient.fromConfig({ algodConfig });
algorand.setSuggestedParamsCacheTimeout(20000);
algorand.getSuggestedParams();

export const abel = new AbelSDK({
  algorand,
  appId: BigInt(2914159523),
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