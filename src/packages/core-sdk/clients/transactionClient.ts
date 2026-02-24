import {Algodv2, indexerModels} from "algosdk";
import type { Indexer } from "algosdk";
import {Network} from "../network";


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
        const {transaction} = await this.indexer.lookupTransactionByID(id).do();
        return transaction;
    }
}
