import { indexerModels } from "algosdk";

export interface TxnCountStats {
    total: number;
    txnTypeCounts: {
        [k: string]: number;
    }
}

export default class BaseTxnHolder {
    countStats: TxnCountStats;

    ensureHasStats(transactions: indexerModels.Transaction[]) {
        if (!this.countStats) {
            this.countStats = BaseTxnHolder.calculateBlockCountStats(transactions);
        }
    }

    static calculateBlockCountStats(txns: indexerModels.Transaction[], countStats?: TxnCountStats): TxnCountStats {
        countStats = countStats ?? { total: 0, txnTypeCounts: {} };
        const { txnTypeCounts: counts } = countStats;
        for(const txn of txns ?? []) {
            countStats.total++;
            const txType = txn.txType;
            counts[txType] = (counts[txType] ?? 0) + 1;
            if (txn.innerTxns) {
                BaseTxnHolder.calculateBlockCountStats(txn.innerTxns, countStats);
            }
        }
        return countStats;
    }
}
