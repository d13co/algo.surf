import { Networks } from "../../../../packages/core-sdk/constants";
import { OpenInBase, PageType } from "../OpenInBase";

export class OpenInAllo extends OpenInBase {
  siteName = "Allo";

  baseUrl = "https://allo.info";

  networks = new Set([Networks.Mainnet]);

  pageTypeSuffixMap: Map<PageType, string> = new Map([
    ["block", "/block"],
    ["transaction", "/tx"],
    ["account", "/address"],
    ["asset", "/asset/{id}/token"],
    ["application", "/application"],
  ]);
}
