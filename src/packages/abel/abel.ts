import { AbelSDK } from "abel-sdk";
import { getNodeConfig } from "../../utils/nodeConfig";
import { AlgorandClient } from "@algorandfoundation/algokit-utils";

const config = getNodeConfig();

const { url: server, port, token } = config.algod;

const algodConfig = {
  server,
  port,
  token,
};
const algorand = AlgorandClient.fromConfig({ algodConfig });

export const abel = new AbelSDK({
  algorand,
  appId: BigInt(2914159523),
});
