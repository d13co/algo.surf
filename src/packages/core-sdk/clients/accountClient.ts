import {Algodv2, decodeJSON, modelsv2, indexerModels} from "algosdk";
import type { Indexer } from "algosdk";
import {
    A_SearchAccount
} from "../types";
import {Network} from "../network";
import {A_TransactionsResponse} from "./transactionClient";
import { toA_AccountsResponse } from "../utils/v3Adapters";
import { attachPqSig, parsePqSig } from "../utils/pqsig";

export const ACCOUNTS_PAGE_SIZE = 100;

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

    async getAccounts(token?: string, limit: number = ACCOUNTS_PAGE_SIZE): Promise<A_AccountsResponse> {
        const req = this.indexer.searchAccounts().limit(limit);
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

        // Decode from the raw body: algosdk's models drop post-quantum
        // signatures (signature.pqsig), which fnet transactions can carry.
        const body = new TextDecoder().decode(await req.doRaw());
        const response = decodeJSON(body, indexerModels.TransactionsResponse);
        const transactions = (response.transactions ?? []) as indexerModels.Transaction[];
        const rawTxns: unknown[] = JSON.parse(body)?.transactions ?? [];
        rawTxns.forEach((rawTxn, i) => {
            const pqsig = parsePqSig(
                (rawTxn as { signature?: { pqsig?: unknown } })?.signature?.pqsig
            );
            if (pqsig && transactions[i]) {
                attachPqSig(transactions[i], pqsig);
            }
        });
        return { 'next-token': response.nextToken ?? '', transactions };
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
