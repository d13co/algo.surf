import { Algodv2} from 'algosdk';
import type { Indexer } from "algosdk";
import {
    A_Asset,
    A_AssetResult,
} from "../types";
import {Network} from "../network";
import {A_TransactionsResponse} from "./transactionClient";
import { toA_SearchTransaction, toA_Asset, toA_AssetsResponse } from "../utils/v3Adapters";


export type A_AssetTransactionsResponse = A_TransactionsResponse;

export type A_AssetsResponse = {
    'next-token': string,
    assets: A_Asset[]
};

export class AssetClient{
    client: Algodv2;
    indexer: Indexer;
    network: Network

    constructor(network: Network) {
        this.network = network;
        this.client = network.getClient();
        this.indexer = network.getIndexer();
    }

    async get(id: number): Promise<A_Asset>{
        const asset = await this.client.getAssetByID(id).do();
        return toA_Asset(asset);
    }

    async search(id: number): Promise<A_AssetResult | null>{
        try {
            const asset = await this.client.getAssetByID(id).do();
            const converted = toA_Asset(asset);
            return { ...converted, type: "asset" } as A_AssetResult;
        } catch(e) {
            if ((e as any).response?.status === 404)
                return null
            else
                throw e;
        }
    }

    async getAssets(token?: string): Promise<A_AssetsResponse> {

        const req = this.indexer.searchForAssets();
        if (token) {
            req.nextToken(token);
        }

        const response = await req.do();
        return toA_AssetsResponse(response);
    }

    async getAssetTransactions(id: number, token?: string): Promise<A_AssetTransactionsResponse> {
        const req = this.indexer.searchForTransactions().assetID(id);
        if (token) {
            req.nextToken(token);
        }

        const response = await req.do();
        const transactions = (response.transactions ?? []).map((t: unknown) => toA_SearchTransaction(t));
        return { 'next-token': response['nextToken'] ?? '', transactions } as A_AssetTransactionsResponse;
    }

    async searchForAssetsByName(searchText: string): Promise<A_Asset> {
        const response = await this.indexer.searchForAssets().name(searchText).do();
        const converted = toA_AssetsResponse(response);
        return converted.assets[0];
    }

    async searchForAssetsByIndex(id: number): Promise<A_Asset> {
        const response = await this.indexer.searchForAssets().index(id).do();
        const converted = toA_AssetsResponse(response);
        return converted.assets[0];
    }


}
