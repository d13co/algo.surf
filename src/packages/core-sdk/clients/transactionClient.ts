import {Algodv2, decodeJSON, indexerModels} from "algosdk";
import type { Indexer } from "algosdk";
import {Network} from "../network";
import {attachPqSig, parsePqSig} from "../utils/pqsig";


export type A_TransactionsResponse = {
    'next-token': string,
    transactions: indexerModels.Transaction[]
};

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
        const req = this.indexer.searchForTransactions();
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
