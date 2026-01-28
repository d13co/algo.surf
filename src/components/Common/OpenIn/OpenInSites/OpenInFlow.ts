import { Networks } from "../../../../packages/core-sdk/constants";
import { OpenInBase, PageType } from "../OpenInBase";

export class OpenInFlow extends OpenInBase {
  siteName = "Flow Algo Surf";
  baseUrl = "https://flow.algo.surf";
  baseUrlOverride: Map<Networks, string> = new Map([
    [Networks.Testnet, "https://testflow.algo.surf"],
  ]);
  networks = new Set([
    Networks.Mainnet,
    Networks.Testnet,
  ]);
  pageTypeSuffixMap: Map<PageType, string> = new Map([
    ["account", "/address"],
  ]);
}
