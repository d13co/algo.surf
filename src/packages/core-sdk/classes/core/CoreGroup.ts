import { A_Group, A_SearchTransaction } from "../../types";
import {TIMESTAMP_DISPLAY_FORMAT} from "../../constants";
import dateFormat  from "dateformat";
import {CoreTransaction} from "./CoreTransaction";
import humanizeDuration from 'humanize-duration';
import BaseTxnHolder from "./BaseTxnHolder";
import { indexerModels } from "algosdk";
import { encodingDataToPlain } from "../../utils/serialize";

type GroupData = {
    id: string;
    block: number;
    timestamp: number;
    transactions: indexerModels.Transaction[];
};

export class CoreGroup extends BaseTxnHolder {
    private _data: GroupData;

    constructor(group: A_Group | GroupData) {
        super();
        if (CoreGroup.isLegacy(group)) {
            this._data = CoreGroup.fromLegacy(group);
        } else {
            this._data = group;
        }
    }

    private static isLegacy(group: A_Group | GroupData): group is A_Group {
        const txns = group.transactions;
        return txns && txns.length > 0 && !(txns[0] instanceof indexerModels.Transaction) && "tx-type" in txns[0];
    }

    private static fromLegacy(group: A_Group): GroupData {
        return {
            id: group.id,
            block: group.block,
            timestamp: group.timestamp,
            transactions: group.transactions.map(
                (t: A_SearchTransaction) => CoreTransaction.fromLegacy(t)
            ),
        };
    }

    get(): GroupData {
        return this._data;
    }

    toJSON(): Record<string, unknown> {
        return {
            id: this._data.id,
            block: this._data.block,
            timestamp: this._data.timestamp,
            transactions: this._data.transactions.map(t =>
                typeof t.toEncodingData === "function"
                    ? encodingDataToPlain(t.toEncodingData())
                    : t as unknown as Record<string, unknown>
            ),
        };
    }

    getId(): string {
        return this._data.id;
    }

    getBlock(): number {
        return this._data.block;
    }

    getTimestamp(): number {
        return this._data.timestamp;
    }

    getTimestampDisplayValue(format: string = TIMESTAMP_DISPLAY_FORMAT): string {
        return dateFormat(new Date(this.getTimestamp() * 1000), format);
    }

    getTimestampDuration(): string {
        // @ts-ignore
        const diff = new Date() - new Date(this.getTimestamp() * 1000);
        const duration = humanizeDuration(diff, { largest: 2, round: true });
        return duration;
    }

    getTransactionsCount(): number {
        this.ensureHasStats(this._data.transactions);
        return this.countStats.total;
    }

    getTransactions(): indexerModels.Transaction[] {
        return this._data.transactions;
    }

    getTransactionsTypesCount() {
        this.ensureHasStats(this._data.transactions);
        return this.countStats.txnTypeCounts;
    }
}
