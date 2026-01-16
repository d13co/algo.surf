import { Algodv2} from 'algosdk';
import type { Indexer } from "algosdk";
import { A_Application, A_ApplicationResult, } from "../types";
import {Network} from "../network";
import axios from 'axios';
import {A_TransactionsResponse} from "./transactionClient";
import { toA_SearchTransaction, toA_Application, toA_ApplicationsResponse } from "../utils/v3Adapters";

export type CompileResponse = { hash: string; result: string; sourcemap?: string };

export type A_ApplicationTransactionsResponse = A_TransactionsResponse;
export type A_ApplicationsResponse = {
    'next-token': string,
    applications: A_Application[]
};

export class ApplicationClient{
    client: Algodv2;
    indexer: Indexer;
    network: Network

    constructor(network: Network) {
        this.network = network;
        this.client = network.getClient();
        this.indexer = network.getIndexer();
    }

    async get(id: number): Promise<A_Application>{
        const app = await this.client.getApplicationByID(id).do();
        const result = toA_Application(app);
        return result;
    }

    async search(id: number): Promise<A_ApplicationResult | null>{
        try {
            const app = await this.client.getApplicationByID(id).do();
            const converted = toA_Application(app);
            return { ...converted, type: "application" } as A_ApplicationResult
        } catch(e) {
            if ((e as any).response?.status === 404)
                return null
            else
                throw e;
        }
    }

    async getApplications(token?: string): Promise<A_ApplicationsResponse> {
        const req = this.indexer.searchForApplications();
        if (token) {
            req.nextToken(token);
        }

        const response = await req.do();
        return toA_ApplicationsResponse(response);
    }

    async getApplicationTransactions(id: number, token?: string): Promise<A_ApplicationTransactionsResponse> {
        const req = this.indexer.searchForTransactions().applicationID(id);
        if (token) {
            req.nextToken(token);
        }

        const response = await req.do();
        const transactions = (response.transactions ?? []).map((t: unknown) => toA_SearchTransaction(t));
        return { 'next-token': response['nextToken'] ?? '', transactions } as A_ApplicationTransactionsResponse;
    }

    async decompileProgram(program: string) {
        const bytes = Buffer.from(program, 'base64');

        const baseUrl = this.network.getAlgodUrl();
        const url = baseUrl + '/v2/teal/disassemble';

        // @ts-ignore
        return axios({
            method: 'post',
            url,
            data: bytes,
            headers: {
                'x-algo-api-token': this.network.getAlgodToken()
            }
        });
    }

    async compileProgram(programSource: string): Promise<CompileResponse> {
        const encoder = new TextEncoder();
        const programBytes = encoder.encode(programSource);
        return (await this.client.compile(programBytes).do()) as unknown as CompileResponse;
    }
}
