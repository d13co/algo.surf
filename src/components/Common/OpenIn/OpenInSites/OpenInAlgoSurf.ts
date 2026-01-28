import { Networks } from "../../../../packages/core-sdk/constants";
import { OpenInBase, PageType } from "../OpenInBase";

export class OpenInAlgoSurf extends OpenInBase {
  siteName = "Algo Surf";

  baseUrl = "https://{networksubdomain}algo.surf";

  baseUrlOverride: Map<Networks, string> = new Map([
    [Networks.Mainnet, "https://algo.surf"],
  ]);

  networks = new Set([
    Networks.Mainnet,
    Networks.Testnet,
    Networks.Betanet,
    Networks.Localnet,
    Networks.Fnet,
  ]);
  
  pageTypeSuffixMap: Map<PageType, string> = new Map([
    ["transaction", "/transaction"],
    ["account", "/account"],
    ["block", "/block/{id}/transactions"],
    ["asset", "/asset/{id}/transactions"],
    ["application", "/application/{id}/transactions"],
  ]);
}
