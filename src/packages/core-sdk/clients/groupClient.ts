import {Network} from "../network";
import {A_Group} from "../types";
import {BlockClient} from "./blockClient";
import {CoreBlock} from "../classes/core/CoreBlock";


export class GroupClient {
    network: Network;

    constructor(network: Network) {
        this.network = network;
    }

    async get(id: string, blockId: number): Promise<A_Group> {
        const blockClient = new BlockClient(this.network);
        const blockRaw = await blockClient.get(blockId);
        const block = new CoreBlock(blockRaw);
        const allTxns = block.getTransactions();

        const grp: A_Group = {
            block: blockId,
            id,
            timestamp: block.getTimestamp(),
            transactions: allTxns.filter(txn => txn.group === id),
        };

        return grp;
    }
}