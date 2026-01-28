import { Networks } from "../../../../packages/core-sdk/constants";
import { OpenInBase, PageType } from "../OpenInBase";

export class OpenInLora extends OpenInBase {
  siteName = "Lora";
  baseUrl = "https://lora.algokit.io/{network}";
  networks = new Set([
    Networks.Mainnet,
    Networks.Testnet,
    Networks.Betanet,
    Networks.Localnet,
    Networks.Fnet,
  ]);
  pageTypeSuffixMap: Map<PageType, string> = new Map([
    ["block", "/block"],
    ["transaction", "/transaction"],
    ["account", "/account"],
    ["asset", "/asset"],
    ["application", "/application"],
  ]);
}
