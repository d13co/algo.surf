import {Algodv2} from "algosdk";
import type { Indexer } from "algosdk";
import {Network} from "../network";
import {A_SearchTransaction} from "../types";
import { toA_SearchTransaction } from "../utils/v3Adapters";


export type A_TransactionsResponse = {
    'next-token': string,
    transactions: A_SearchTransaction[]
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
        const transactions = (response.transactions ?? []).map((t: unknown) => toA_SearchTransaction(t));
        return { 'next-token': (response['next-token'] as string) ?? '', transactions } as A_TransactionsResponse;
    }

    async get(id: string): Promise<A_SearchTransaction> {
        const {transaction} = await this.indexer.lookupTransactionByID(id).do();
        return toA_SearchTransaction(transaction);
    }
}