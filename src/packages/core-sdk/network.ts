import type { Indexer } from "algosdk";
import {Algodv2} from "algosdk";
import { ClientManager } from "@algorandfoundation/algokit-utils/types/client-manager";
import { retryOptions } from "../../utils/retryWaits";
import {AlgodTokenHeader, CustomTokenHeader, IndexerTokenHeader} from "algosdk";
import {AlgodConnectionParams, IndexerConnectionParams, NodeConnectionParams} from "./types";

/**
 * A node token as algokit-utils' client config takes it. An empty string
 * becomes no header at all, as algosdk does: algokit-utils would send an empty
 * token header, which makes every request a CORS preflight.
 */
export function clientToken<T>(token: string | T): string | T | {} {
    return token === "" ? {} : token;
}

/**
 * Retries for the explorer's own algod and indexer reads: rate limits and
 * gateway or busy errors only. A 500 or 504 from a heavy indexer search is
 * the same on every try, so it fails at once instead of after ~14 s.
 */
const EXPLORER_RETRY = { retryStatuses: [429, 502, 503] };

export class Network {
    public id: string
    public label: string

    public algod: AlgodConnectionParams
    public indexer: IndexerConnectionParams

    private algodClient?: Algodv2
    private indexerClient?: Indexer
    private retry: boolean

    /**
     * @param options.retry - false for clients that fail at once and report
     *   no waits, e.g. probes of other networks, which may well be unreachable.
     */
    constructor(params: NodeConnectionParams, options: { retry?: boolean } = {}) {
        this.retry = options.retry ?? true;
        this.id = params.id;
        this.label = params.label;
        this.algod = params.algod;
        this.indexer = params.indexer;
    }

    getAlgodUrl(): string {
        const {url, port} = this.algod;
        return port ? `${url}:${port}` : url;
    }

    getAlgodToken(): string | AlgodTokenHeader | CustomTokenHeader {
        return this.algod.token;
    }

    getIndexerToken(): string | IndexerTokenHeader | CustomTokenHeader {
        return this.indexer.token;
    }

    getIndexerUrl(): string {
        const {url, port} = this.indexer;
        return port ? `${url}:${port}` : url;
    }

    /**
     * This network's algod client, one per network. It retries 429s, 502s,
     * 503s and network errors (dt-algosdk's retry policy, through
     * algokit-utils), reporting each wait for RetryWaitToast.
     */
    getClient(): Algodv2{
        const {url, port, token} = this.algod;
        const retry = this.retry && retryOptions("algod", EXPLORER_RETRY);
        return this.algodClient ??= ClientManager.getAlgodClient({server: url, port, token: clientToken(token), retry});
    }

    /** This network's indexer client, one per network, retrying as getClient's. */
    getIndexer(): Indexer {
        const {url, port, token} = this.indexer;
        const retry = this.retry && retryOptions("indexer", EXPLORER_RETRY);
        return this.indexerClient ??= ClientManager.getIndexerClient({server: url, port, token: clientToken(token), retry});
    }
}
