import {Algodv2, modelsv2, indexerModels} from "algosdk";
import type { Indexer } from "algosdk";
import {
    A_SearchAccount
} from "../types";
import {Network} from "../network";
import {A_TransactionsResponse} from "./transactionClient";
import { toA_AccountsResponse } from "../utils/v3Adapters";

export type A_AccountsResponse = {
    'next-token': string,
    accounts: A_SearchAccount[]
};

export type A_AccountTransactionsResponse = A_TransactionsResponse;

export class AccountClient{
    client: Algodv2;
    indexer: Indexer;
    network: Network

    constructor(network: Network) {
        this.network = network;
        this.client = network.getClient();
        this.indexer = network.getIndexer();
    }

    async getAccountInformation(address: string): Promise<modelsv2.Account> {
        return this.client.accountInformation(address).do();
    }

    async getAccounts(token?: string, limit?: number): Promise<A_AccountsResponse> {
        const req = this.indexer.searchAccounts();
        if (limit) {
            req.limit(limit);
        }
        if (token) {
            req.nextToken(token);
        }

        const response = await req.do();
        return toA_AccountsResponse(response);
    }

    async getAccountTransactions(address: string, token?: string): Promise<A_AccountTransactionsResponse> {
        const req = this.indexer.searchForTransactions().address(address);
        if (token) {
            req.nextToken(token);
        }

        const response = await req.do();
        const transactions = (response.transactions ?? []) as indexerModels.Transaction[];
        return { 'next-token': (response['nextToken'] as string) ?? '', transactions };
    }

    async getAuthAddr(address: string, token?: string): Promise<A_AccountsResponse> {
        const req = this.indexer.searchAccounts().authAddr(address).limit(100);
        if (token) {
            req.nextToken(token);
        }

        const response = await req.do();
        return toA_AccountsResponse(response);
    }
}
