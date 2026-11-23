import {Algodv2, decodeJSON, modelsv2, indexerModels} from "algosdk";
import type { Indexer } from "algosdk";
import {
    A_SearchAccount
} from "../types";
import {Network} from "../network";
import {A_TransactionsResponse, txnsBatchSize} from "./transactionClient";
import { toA_AccountsResponse } from "../utils/v3Adapters";
import { attachPqSig, parsePqSig } from "../utils/pqsig";
import { withSignal } from "../utils/signal";

export const ACCOUNTS_PAGE_SIZE = 100;
/** Accounts rekeyed to one address, a page per getAuthAddr. */
export const CONTROLLERS_PAGE_SIZE = 1000;

/**
 * What algod leaves out of an account: each created app and asset comes back
 * as its id alone (`{id}` / `{index}`), with no params. Those params were
 * most of a big creator's account (9.6 MB, or 1.3 MB without them, on one with 17k assets),
 * and nothing on the page reads them; the created lists' tabs look up what
 * they show. algod has no exclude for the lists themselves, short of `all`,
 * which drops holdings and local states too.
 */
export const ACCOUNT_EXCLUDE = "created-apps-params,created-assets-params";

// How far getLastSentTransaction looks: up to 3 batches of 50.
const LAST_SENT_BATCH_SIZE = 50;
const LAST_SENT_BATCHES = 3;
// A page of getTransactionsSince: a round's worth for nearly every account.
const TXNS_SINCE_PAGE_SIZE = 100;

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
        return this.client.accountInformation(address).exclude(ACCOUNT_EXCLUDE).do();
    }

    async getAccounts(token?: string, limit: number = ACCOUNTS_PAGE_SIZE, signal?: AbortSignal): Promise<A_AccountsResponse> {
        // Lists show an account's own fields only (the totals included). Its
        // holdings, local states and created objects count toward the
        // indexer's result limit, so one big account would fail the page.
        const req = this.indexer.searchAccounts().exclude("all").limit(limit);
        if (token) {
            req.nextToken(token);
        }

        const response = await req.do(undefined, withSignal(signal));
        return toA_AccountsResponse(response);
    }

    /** With `round`, only the transactions in that round; else with `maxRound`, only those up to it. */
    async getAccountTransactions(address: string, token?: string, maxRound?: number, round?: number): Promise<A_AccountTransactionsResponse> {
        const req = this.indexer.searchForTransactions().address(address).limit(txnsBatchSize(token));
        if (token) {
            req.nextToken(token);
        }
        // The indexer takes one or the other.
        if (round !== undefined) {
            req.round(round);
        } else if (maxRound !== undefined) {
            req.maxRound(maxRound);
        }
        return searchTransactions(req);
    }

    /**
     * A page of the transactions involving `address` from `minRound` on,
     * newest first as every address search, with the round the indexer has
     * imported up to (`currentRound`), for a watcher to resume from. Decoded
     * by algosdk alone: the watcher reads no signatures, so the pqsig path is
     * skipped.
     */
    async getTransactionsSince(address: string, minRound: bigint, token?: string, signal?: AbortSignal): Promise<{ transactions: indexerModels.Transaction[]; currentRound: bigint; nextToken?: string }> {
        const req = this.indexer.searchForTransactions().address(address).minRound(minRound).limit(TXNS_SINCE_PAGE_SIZE);
        if (token) {
            req.nextToken(token);
        }
        const response = await req.do(undefined, withSignal(signal));
        return { transactions: response.transactions ?? [], currentRound: response.currentRound, nextToken: response.nextToken || undefined };
    }

    /**
     * The latest transaction `address` sent (up to `maxRound`, if given), or
     * null if it sent none lately. The indexer's sender role also matches
     * clawbacks from the account and inner transactions it sent (returned as
     * their outer transaction, which someone else sent), so this reads a few
     * batches for the first the account sent itself.
     */
    async getLastSentTransaction(address: string, maxRound?: number): Promise<indexerModels.Transaction | null> {
        let token: string | undefined;
        for (let batch = 0; batch < LAST_SENT_BATCHES; batch++) {
            const req = this.indexer.searchForTransactions().address(address).addressRole('sender').limit(LAST_SENT_BATCH_SIZE);
            if (token) {
                req.nextToken(token);
            }
            if (maxRound !== undefined) {
                req.maxRound(maxRound);
            }
            const page = await searchTransactions(req);
            const sent = page.transactions.find(({ sender }) => sender === address);
            if (sent) return sent;
            token = page['next-token'] || undefined;
            if (!token || !page.transactions.length) break;
        }
        return null;
    }

    async getAuthAddr(address: string, token?: string): Promise<A_AccountsResponse> {
        // Only the totals are shown, and the list is paged to its end: no asset or app arrays, 1000 a page.
        const req = this.indexer.searchAccounts().authAddr(address).exclude("all").limit(CONTROLLERS_PAGE_SIZE);
        if (token) {
            req.nextToken(token);
        }

        const response = await req.do();
        return toA_AccountsResponse(response);
    }
}

/**
 * Runs a transaction search, decoding from the raw body: algosdk's models
 * drop post-quantum signatures (signature.pqsig), which fnet transactions
 * can carry.
 */
async function searchTransactions(
    req: ReturnType<Indexer["searchForTransactions"]>
): Promise<A_AccountTransactionsResponse> {
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
