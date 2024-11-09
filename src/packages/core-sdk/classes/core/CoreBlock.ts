import {
    A_Block, A_SearchTransaction
} from "../../types";
import {TIMESTAMP_DISPLAY_FORMAT} from "../../constants";
import dateFormat  from "dateformat";
import {CoreTransaction} from "./CoreTransaction";
import humanizeDuration from 'humanize-duration';
import BaseTxnHolder  from "./BaseTxnHolder";

export class CoreBlock extends BaseTxnHolder {
    block: A_Block;

    constructor(block: A_Block) {
        super();
        this.block = block;
    }

    get(): A_Block{
        return this.block;
    }

    getRound(): number {
        return this.block.round;
    }

    getTimestamp(): number {
        return this.block.timestamp;
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

    getTransactions(): A_SearchTransaction[] {
        return this.block.transactions;
    }

    getTransactionsCount(): number {
        this.ensureHasStats(this.block.transactions);
        return this.countStats.total;
    }

    getTransactionsTypesCount() {
        this.ensureHasStats(this.block.transactions);
        return this.countStats.txnTypeCounts;
    }
}
