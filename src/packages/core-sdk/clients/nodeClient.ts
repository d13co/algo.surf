import {Algodv2} from "algosdk";
import type { Indexer } from "algosdk";
import {Network} from "../network";
import {A_Genesis, A_Health, A_Status, A_VersionsCheck} from "../types";
import { toA_Status, toA_VersionsCheck, toA_Genesis, toA_Health } from "../utils/v3Adapters";


export class NodeClient {
    client: Algodv2;
    indexer: Indexer;
    network: Network;

    constructor(network: Network) {
        this.network = network;
        this.client = network.getClient();
        this.indexer = network.getIndexer();
    }

    async versionsCheck(): Promise<A_VersionsCheck> {
        const versions = await this.client.versionsCheck().do();
        return toA_VersionsCheck(versions);
    }

    async status(): Promise<A_Status> {
        const status = await this.client.status().do();
        return toA_Status(status);
    }

    async genesis(): Promise<A_Genesis> {
        const genesis = await this.client.genesis().do();
        return toA_Genesis(genesis);
    }

    async health(): Promise<A_Health> {
        const health = await this.indexer.makeHealthCheck().do();
        return toA_Health(health);
    }
}