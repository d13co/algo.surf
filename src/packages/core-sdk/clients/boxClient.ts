import {Algodv2} from 'algosdk';
import IndexerClient from "algosdk/dist/types/client/v2/indexer/indexer";
import {A_BoxName, A_BoxNames, A_Box,} from "../types";
import {Network} from "../network";
import axios from 'axios';
import {A_TransactionsResponse} from "./transactionClient";
import {CompileResponse} from "algosdk/dist/types/client/v2/algod/models/types";

export class BoxClient{
    client: Algodv2;
    indexer: IndexerClient;
    network: Network

    constructor(network: Network) {
        this.network = network;
        this.client = network.getClient();
        this.indexer = network.getIndexer();
    }

    async getBoxNames(id: number): Promise<A_BoxNames> {
        const app = await this.client.getApplicationBoxes(id).do();
        const bufferNames = app.boxes.map(({ name }) => ({ name: Buffer.from(name).toString('base64') }));
        return bufferNames;
    }

    async getBox(id: number, name: string): Promise<A_Box> {
        const { value } = await this.client.getApplicationBoxByName(id, Buffer.from(name, 'base64')).do();
        return { name, value: Buffer.from(value).toString("base64"), };
    }
}
