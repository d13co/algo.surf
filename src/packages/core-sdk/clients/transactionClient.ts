import {Algodv2, decodeJSON, indexerModels} from "algosdk";
import type { Indexer } from "algosdk";
import {Network} from "../network";
import {attachPqSig, parsePqSig} from "../utils/pqsig";


export type A_TransactionsResponse = {
    'next-token': string,
    transactions: indexerModels.Transaction[]
};

/**
 * Transactions in a list's first request: a few pages, so the list of a busy
 * account, app or asset shows quickly. Later requests take more at a time.
 */
export const TXNS_FIRST_BATCH_SIZE = 50;
export const TXNS_BATCH_SIZE = 200;

/** The `limit` of a transaction list's request: `token` is set on all but the first. */
export const txnsBatchSize = (token?: string) => (token ? TXNS_BATCH_SIZE : TXNS_FIRST_BATCH_SIZE);

/**
 * The token of a transaction list's next request, if any. An empty batch ends
 * the list, whatever token came with it.
 */
export const nextTxnsToken = (page: A_TransactionsResponse) =>
    page.transactions.length ? page['next-token'] || undefined : undefined;

export class TransactionClient {
    client: Algodv2;
    indexer: Indexer;
    network: Network;

    constructor(network: Network) {
        this.network = network;
        this.client = network.getClient();
        this.indexer = network.getIndexer();
    }

    async getTransactions(token?: string): Promise<A_TransactionsResponse> {
        const req = this.indexer.searchForTransactions().limit(txnsBatchSize(token));
        if (token) {
            req.nextToken(token);
        }

        const response = await req.do();
        const transactions = (response.transactions ?? []) as indexerModels.Transaction[];
        return { 'next-token': (response['nextToken'] as string) ?? '', transactions };
    }

    async get(id: string): Promise<indexerModels.Transaction> {
        // Decode from the raw body: algosdk's models drop post-quantum
        // signatures (signature.pqsig), which fnet transactions can carry.
        const body = new TextDecoder().decode(
            await this.indexer.lookupTransactionByID(id).doRaw()
        );
        const {transaction} = decodeJSON(body, indexerModels.TransactionResponse);
        const pqsig = parsePqSig(JSON.parse(body)?.transaction?.signature?.pqsig);
        if (pqsig) {
            attachPqSig(transaction, pqsig);
        }
        return transaction;
    }
}
