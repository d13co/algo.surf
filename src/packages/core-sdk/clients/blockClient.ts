import {Algodv2, indexerModels} from "algosdk";
import type { Indexer } from "algosdk";
import {Network} from "../network";
import {A_Status,A_BlockResult} from "../types";
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

    async get(id: number): Promise<indexerModels.Block> {
        const response = await this.indexer.lookupBlock(id).do();
        return response as indexerModels.Block;
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

    /** The first round timestamped after `time` (Unix seconds), or null where there is none yet. */
    async firstRoundAfter(time: number): Promise<number | null> {
        const response = await this.indexer.searchForBlockHeaders().afterTime(new Date(time * 1000)).limit(1).do();
        return response.blocks.length ? Number(response.blocks[0].round) : null;
    }

    async statusAfterBlock(round: number): Promise<A_Status> {
        const response = await this.client.statusAfterBlock(round).do();
        return toA_Status(response);
    }

    async getBlockHash(round: number): Promise<string> {
        const response = await this.client.getBlockHash(round).do();
        return (response as any).blockhash ?? "";
    }

}
