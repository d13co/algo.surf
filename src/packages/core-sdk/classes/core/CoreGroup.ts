import { A_Group, A_SearchTransaction } from "../../types";
import {TIMESTAMP_DISPLAY_FORMAT} from "../../constants";
import dateFormat  from "dateformat";
import {CoreTransaction} from "./CoreTransaction";
import humanizeDuration from 'humanize-duration';
import BaseTxnHolder from "./BaseTxnHolder";

export class CoreGroup extends BaseTxnHolder {
    group: A_Group;

    constructor(group: A_Group) {
        super();
        this.group = group;
    }

    get(): A_Group {
        return this.group;
    }

    getId(): string {
        return this.group.id;
    }

    getBlock(): number {
        return this.group.block;
    }

    getTimestamp(): number {
        return this.group.timestamp;
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
        this.ensureHasStats(this.group.transactions);
        return this.countStats.total;
    }

    getTransactions(): A_SearchTransaction[] {
        return this.group.transactions;
    }

    getTransactionsTypesCount() {
        this.ensureHasStats(this.group.transactions);
        return this.countStats.txnTypeCounts;
    }
}
