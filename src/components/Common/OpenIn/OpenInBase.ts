import { Networks } from "../../../packages/core-sdk/constants";

export type PageType = "block" | "transaction" | "account" | "asset" | "application";

export abstract class OpenInBase {
  abstract siteName: string;
  abstract baseUrl: string;
  baseUrlOverride: Map<Networks, string> = new Map()
  
  abstract networks: Set<Networks>;
  abstract pageTypeSuffixMap: Map<PageType, string>;

  has(pageType: PageType): boolean {
    return this.pageTypeSuffixMap.has(pageType);
  }

  getBaseUrl(network: Networks): string {
    if (this.baseUrlOverride.has(network)) {
      return this.baseUrlOverride.get(network)!;
    }
    if (this.baseUrl.includes("{networksubdomain}")) {
      return this.baseUrl.replace("{networksubdomain}", network.toLowerCase()+".");
    }
    return this.baseUrl.replace("{network}", network.toLowerCase());
  }

  url(
    pageType: PageType,
    identifier: string,
    network: Networks,
  ): string | null {
    if (!this.has(pageType) || !this.networks.has(network)) {
      return null;
    }
    let baseUrl = this.getBaseUrl(network);
    if (baseUrl.endsWith("/")) {
      baseUrl = baseUrl.slice(0, -1);
    }
    let suffix = this.pageTypeSuffixMap.get(pageType);
    if (suffix.startsWith("/")) {
      suffix = suffix.slice(1);
    }
    if (suffix.endsWith("/")) {
      suffix = suffix.slice(0, -1);
    }
    return `${baseUrl}/${suffix}/${identifier}`;
  }
}