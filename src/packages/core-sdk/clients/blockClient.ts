import {Algodv2, encodeAddress} from "algosdk";
import type { Indexer } from "algosdk";
import {Network} from "../network";
import {A_Status,A_Block,A_BlockResult} from "../types";
import { toA_Block, toA_Status } from "../utils/v3Adapters";

export class BlockClient {
    client: Algodv2;
    indexer: Indexer;
    network: Network;

    constructor(network: Network) {
        this.network = network;
        this.client = network.getClient();
        this.indexer = network.getIndexer();
    }

    async get(id: number): Promise<A_Block> {
        const response = await this.indexer.lookupBlock(id).do();
        return toA_Block(response);
    }

    async search(id: number): Promise<A_BlockResult> {
        try {
            const response = await this.indexer.lookupBlock(id).do();
            const converted = toA_Block(response);
            return { ...converted, type: "block" } as A_BlockResult;
        } catch(e) {
            if ((e as any).response?.status === 404)
                return null
            else
                throw e;
        }
    }

    async statusAfterBlock(round: number): Promise<A_Status> {
        const response = await this.client.statusAfterBlock(round).do();
        return toA_Status(response);
    }

    async getBlockProposer(round: number): Promise<string> {
        const response = await this.indexer.lookupBlock(round).do();
        const respUnknown: unknown = response;
        if (typeof respUnknown === 'object' && respUnknown !== null && 'proposer' in respUnknown) {
            const p = (respUnknown as { proposer?: unknown }).proposer;
            if (typeof p === 'string') return p;
            if (p != null) return String(p);
        }
        return "";
    }

    async getBlockHash(round: number): Promise<any> {
        const response = await this.client.getBlockHash(round).do();
        return response;
    }

}
