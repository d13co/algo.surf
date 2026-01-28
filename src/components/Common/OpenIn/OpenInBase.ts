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

  /** Base URL, can include {network} or {networksubdomain} placeholders.
   * {network} will be replaced with the lowercase network name (e.g., "mainnet", "testnet").
   * {networksubdomain} will be replaced with the lowercase network name followed by a dot (e.g., "mainnet.", "testnet.")
   */
  abstract baseUrl: string;

  /** Map of network-specific base URL overrides
   * You can use this to set explicit base URLs for specific networks
   */
  baseUrlOverride: Map<Networks, string> = new Map();

  /** Supported networks */
  abstract networks: Set<Networks>;

  /** Map of supported page types to URL suffixes
   * The suffix can include an {id} placeholder for the entity identifier
   * Otherwise, the id will be appended to the suffix
  */
  abstract pageTypeSuffixMap: Map<PageType, string>;

  /** Check if the network is supported */
  supportsNetwork(network: Networks): boolean {
    return this.networks.has(network);
  }

  /** Check if the page type is supported */
  supportsPageType(pageType: PageType): boolean {
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

  /** Construct the full URL for a given network, page type and id */
  getUrl(network: Networks, pageType: PageType, id: string): string | null {
    if (!this.supportsPageType(pageType) || !this.supportsNetwork(network)) {
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
    if (suffix.includes("{id}")) {
      suffix = `${suffix.replace("{id}", id)}`;
    } else {
      suffix = `${suffix}/${id}`;
    }
    return `${baseUrl}/${suffix}`;
  }
}
