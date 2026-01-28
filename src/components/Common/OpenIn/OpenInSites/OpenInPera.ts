import { Networks } from "../../../../packages/core-sdk/constants";
import { OpenInBase, PageType } from "../OpenInBase";

export class OpenInPera extends OpenInBase {
  siteName = "Pera";

  baseUrl = "https://explorer.perawallet.app";

  baseUrlOverride: Map<Networks, string> = new Map([
    [Networks.Testnet, "https://testnet.explorer.perawallet.app"],
  ]);

  networks = new Set([Networks.Mainnet, Networks.Testnet]);

  pageTypeSuffixMap: Map<PageType, string> = new Map([
    ["block", "/block"],
    ["transaction", "/tx"],
    ["account", "/address"],
    ["asset", "/asset"],
    ["application", "/application"],
  ]);
}
