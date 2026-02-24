import {Network} from "../network";
import {BlockClient} from "./blockClient";
import {CoreBlock} from "../classes/core/CoreBlock";
import { indexerModels, bytesToBase64 } from "algosdk";


export class GroupClient {
    network: Network;

    constructor(network: Network) {
        this.network = network;
    }

    async get(id: string, blockId: number): Promise<{ id: string; block: number; timestamp: number; transactions: indexerModels.Transaction[] }> {
        const blockClient = new BlockClient(this.network);
        const blockRaw = await blockClient.get(blockId);
        const block = new CoreBlock(blockRaw);
        const allTxns = block.getTransactions();

        const transactions = allTxns.filter(txn => {
            if (!txn.group) return false;
            const groupB64 = txn.group instanceof Uint8Array ? bytesToBase64(txn.group) : String(txn.group);
            return groupB64 === id;
        });

        return {
            block: blockId,
            id,
            timestamp: block.getTimestamp(),
            transactions,
        };
    }
}
