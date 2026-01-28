import { Networks } from "../../../packages/core-sdk/constants";

export type PageType =
  | "block"
  | "transaction"
  | "account"
  | "asset"
  | "application";

export abstract class OpenInBase {
  /** Site name to display */
  abstract siteName: string;
  /** Base URL, can include {network} or {networksubdomain} placeholders */
  abstract baseUrl: string;
  /** Map of network-specific base URL overrides */
  baseUrlOverride: Map<Networks, string> = new Map();

  /** Supported networks */
  abstract networks: Set<Networks>;
  /** Map of supported page types to URL suffixes */
  abstract pageTypeSuffixMap: Map<PageType, string>;

  /** Check if the page type is supported */
  has(pageType: PageType): boolean {
    return this.pageTypeSuffixMap.has(pageType);
  }

  /** Get the base URL for a given network */
  getBaseUrl(network: Networks): string {
    if (this.baseUrlOverride.has(network)) {
      return this.baseUrlOverride.get(network)!;
    }
    if (this.baseUrl.includes("{networksubdomain}")) {
      return this.baseUrl.replace(
        "{networksubdomain}",
        network.toLowerCase() + ".",
      );
    }
    return this.baseUrl.replace("{network}", network.toLowerCase());
  }

  /** Construct the full URL for a given page type, identifier, and network */
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
