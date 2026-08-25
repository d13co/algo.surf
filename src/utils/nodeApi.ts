import explorer from "./dappflow";

export type ApiService = "algod" | "indexer";

const tokenHeaderName: Record<ApiService, string> = {
    algod: "X-Algo-API-Token",
    indexer: "X-Indexer-API-Token",
};

/**
 * Base URL of a service on the currently configured node, port included.
 */
export function getApiBaseUrl(service: ApiService): string {
    const {network} = explorer;
    return service === "algod" ? network.getAlgodUrl() : network.getIndexerUrl();
}

/**
 * Absolute URL for a path such as `/v2/accounts/ABC...`.
 */
export function getApiUrl(service: ApiService, path: string): string {
    return `${getApiBaseUrl(service).replace(/\/+$/, "")}${path}`;
}

/**
 * Auth headers a request to `service` needs.
 *
 * A node token is `string | AlgodTokenHeader | IndexerTokenHeader | CustomTokenHeader`,
 * so normalise all three shapes to plain header pairs. An empty string means the
 * endpoint is public and needs none.
 */
export function getApiHeaders(service: ApiService): Record<string, string> {
    const token = explorer.network[service].token;

    if (typeof token === "string") {
        return token ? {[tokenHeaderName[service]]: token} : {};
    }

    return {...token} as Record<string, string>;
}

/**
 * Whether reaching the endpoint needs a header a browser cannot send when it
 * simply navigates to the URL - in which case a link would only get a 401.
 */
export function apiRequiresToken(service: ApiService): boolean {
    return Object.keys(getApiHeaders(service)).length > 0;
}

/**
 * A curl invocation for endpoints a plain link cannot authenticate against.
 */
export function getApiCurlCommand(service: ApiService, path: string): string {
    const headers = Object.entries(getApiHeaders(service))
        .map(([name, value]) => `-H "${name}: ${value}" `)
        .join("");
    return `curl ${headers}"${getApiUrl(service, path)}"`;
}
