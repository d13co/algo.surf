import { A_SearchTransaction } from "../../types";

export interface TxnCountStats {
    total: number;
    txnTypeCounts: {
        [k: string]: number;
    }
}

export default class BaseTxnHolder {
    countStats: TxnCountStats;

    ensureHasStats(transactions: A_SearchTransaction[]) {
        if (!this.countStats) {
            this.countStats = BaseTxnHolder.calculateBlockCountStats(transactions);
        }
    }

    static calculateBlockCountStats(txns: A_SearchTransaction[], countStats?: TxnCountStats): TxnCountStats {
        countStats = countStats ?? { total: 0, txnTypeCounts: {} };
        const { txnTypeCounts: counts } = countStats;
        for(const txn of txns ?? []) {
            countStats.total++;
            const { "tx-type": txType } = txn;
            counts[txType] = (counts[txType] ?? 0) + 1;
            if (txn["inner-txns"]) {
                BaseTxnHolder.calculateBlockCountStats(txn['inner-txns'], countStats);
            }
        }
        return countStats;
    }
}
