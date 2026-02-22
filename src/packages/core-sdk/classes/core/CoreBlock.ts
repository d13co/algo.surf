import {
    A_SearchTransaction
} from "../../types";
import {TIMESTAMP_DISPLAY_FORMAT} from "../../constants";
import dateFormat  from "dateformat";
import humanizeDuration from 'humanize-duration';
import BaseTxnHolder  from "./BaseTxnHolder";
import { indexerModels, encodeAddress } from "algosdk";
import { toA_SearchTransaction } from "../../utils/v3Adapters";
import { encodingDataToPlain } from "../../utils/serialize";

export class CoreBlock extends BaseTxnHolder {
    block: indexerModels.Block;
    private _transactions?: A_SearchTransaction[];

    constructor(block: indexerModels.Block) {
        super();
        this.block = block;
    }

    get(): indexerModels.Block {
        return this.block;
    }

    toJSON(): Record<string, unknown> {
        if (typeof this.block.toEncodingData === "function") {
            return encodingDataToPlain(this.block.toEncodingData());
        }
        return this.block as unknown as Record<string, unknown>;
    }

    getRound(): number {
        return Number(this.block.round);
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
        if (!this._transactions) {
            this._transactions = (this.block.transactions ?? []).map(
                (txn) => toA_SearchTransaction(txn)
            );
        }
        return this._transactions;
    }

    getTransactionsCount(): number {
        this.ensureHasStats(this.getTransactions());
        return this.countStats.total;
    }

    getTransactionsTypesCount() {
        this.ensureHasStats(this.getTransactions());
        return this.countStats.txnTypeCounts;
    }

    getProposer(): string {
        if (!this.block.proposer) return "";
        if (typeof this.block.proposer === "string") return this.block.proposer;
        if ("publicKey" in this.block.proposer && this.block.proposer.publicKey instanceof Uint8Array) {
            return encodeAddress(this.block.proposer.publicKey);
        }
        return String(this.block.proposer);
    }

    getBonus(): number {
        return this.block.bonus ?? 0;
    }

    getProposerPayout(): number {
        return this.block.proposerPayout ?? 0;
    }

    getFeesCollected(): number {
        return this.block.feesCollected ?? 0;
    }

    getSuspendedAccounts(): string[] {
        const pu = this.block.participationUpdates;
        if (!pu) return [];
        return pu.absentParticipationAccounts ?? [];
    }
}
