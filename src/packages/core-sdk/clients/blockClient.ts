import {Algodv2, encodeAddress} from "algosdk";
import IndexerClient from "algosdk/dist/types/client/v2/indexer/indexer";
import {Network} from "../network";
import {A_Status,A_Block,A_BlockResult} from "../types";

export class BlockClient {
    client: Algodv2;
    indexer: IndexerClient;
    network: Network;

    constructor(network: Network) {
        this.network = network;
        this.client = network.getClient();
        this.indexer = network.getIndexer();
    }

    async get(id: number): Promise<A_Block> {
        const response = await this.indexer.lookupBlock(id).do();
        return response as A_Block;
    }

    async search(id: number): Promise<A_BlockResult> {
        try {
            const response = await this.indexer.lookupBlock(id).do();
            return { ...response, type: "block" } as A_BlockResult;
        } catch(e) {
            if ((e as any).response?.status === 404)
                return null
            else
                throw e;
        }
    }

    async statusAfterBlock(round: number): Promise<A_Status> {
        const response = await this.client.statusAfterBlock(round).do();
        return response as A_Status;
    }

    async getBlockProposer(round: number): Promise<any> {
        const response = await this.client.block(round).do();
        return encodeAddress(response.cert.prop.oprop);
    }

    async getBlockHash(round: number): Promise<any> {
        const response = await this.client.getBlockHash(round).do();
        return response;
    }

}
