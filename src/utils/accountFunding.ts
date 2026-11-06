import type { Algodv2, indexerModels, modelsv2 } from "algosdk";
import { Network } from "src/packages/core-sdk/network";
import { isNotFoundError } from "src/packages/core-sdk/utils/common";
import { getDTAlgod, getTTAlgorand } from "src/utils/timeTravel";

/** When an account first held a record. */
export type AccountOpening = {
  /** 0 for a genesis account. */
  round: number;
  /** The round's block timestamp (seconds), when the source gave it. */
  timestamp?: number;
};

/** When an account was last re-opened after a close, as of a round. */
export type AccountReopening = {
  round: number;
  timestamp: number;
};

/** A payment into the account in its funding round. */
export type FundingPayment = {
  /** The transaction's id; for an inner payment, its top-level transaction's. */
  txId: string;
  sender: string;
  /** microAlgos received, from the amount and any close remainder. */
  amount: bigint;
  inner: boolean;
};

/**
 * The round the account first held a record in. With a time-travel node, the
 * account's first base version; without one, the indexer's created-at-round.
 * Null when neither knows the account.
 */
export async function getAccountOpening(network: Network, address: string, useTimeTravel: boolean): Promise<AccountOpening | null> {
  const algorand = useTimeTravel ? getTTAlgorand() : null;
  if (algorand) {
    const { versions } = await algorand.dt.getAccountVersions(address, { order: "asc", limit: 1, exclude: ["all"] });
    const v = versions[0];
    return v ? { round: Number(v.round), timestamp: v.timestamp } : null;
  }
  try {
    const { account } = await network.getIndexer().lookupAccountByID(address).includeAll(true).do();
    return account.createdAtRound === undefined ? null : { round: Number(account.createdAtRound) };
  } catch (e) {
    if (isNotFoundError(e)) return null;
    throw e;
  }
}

/**
 * When the account was last re-opened after a close, as of `maxRound`
 * (default: now), from its latest 100 base versions up to then (time-travel
 * node only). Null when it was never closed in them, or is closed then.
 */
export async function getAccountReopening(address: string, maxRound?: number): Promise<AccountReopening | null> {
  const algorand = getTTAlgorand();
  if (!algorand) return null;
  const { versions } = await algorand.dt.getAccountVersions(address, { order: "desc", limit: 100, exclude: ["all"], maxRound });
  // Newest first: the version just before (newer than) the latest close re-opened it.
  const closeAt = versions.findIndex((x) => x.base?.deleted);
  if (closeAt <= 0) return null;
  const reopen = versions[closeAt - 1];
  return { round: Number(reopen.round), timestamp: reopen.timestamp };
}

/**
 * The payments that funded `address` in `round`: top-level and inner `pay`s
 * whose receiver or close-to is the address. From the indexer; when it fails,
 * from the block on the explorer's algod, then on the time-travel node (a
 * pruned node keeps only recent blocks).
 */
export async function getFundingPayments(network: Network, address: string, round: number): Promise<FundingPayment[]> {
  try {
    return await fundingFromIndexer(network, address, round);
  } catch (indexerError) {
    const algods = [network.getClient(), getDTAlgod()].filter((a): a is Algodv2 => !!a);
    for (const algod of algods) {
      try {
        return await fundingFromBlock(algod, address, round);
      } catch {
        // Next source.
      }
    }
    throw indexerError;
  }
}

async function fundingFromIndexer(network: Network, address: string, round: number): Promise<FundingPayment[]> {
  const found: FundingPayment[] = [];
  let next: string | undefined;
  do {
    const req = network.getIndexer().searchForTransactions().address(address).minRound(round).maxRound(round).limit(1000);
    if (next) req.nextToken(next);
    const page = await req.do();
    for (const txn of page.transactions) {
      walkIndexer(txn, txn.id!, false, address, found);
    }
    next = page.transactions.length ? page.nextToken : undefined;
  } while (next);
  return found;
}

function walkIndexer(txn: indexerModels.Transaction, rootId: string, inner: boolean, address: string, out: FundingPayment[]) {
  const pay = txn.paymentTransaction;
  if (pay && txn.sender !== address) {
    const amount = (pay.receiver === address ? pay.amount : 0n) + (pay.closeRemainderTo === address ? pay.closeAmount ?? 0n : 0n);
    if (pay.receiver === address || pay.closeRemainderTo === address) {
      out.push({ txId: rootId, sender: txn.sender, amount, inner });
    }
  }
  for (const child of txn.innerTxns ?? []) walkIndexer(child, rootId, true, address, out);
}

type SignedTxnWithAD = modelsv2.BlockResponse["block"]["payset"][number]["signedTxn"];

async function fundingFromBlock(algod: Algodv2, address: string, round: number): Promise<FundingPayment[]> {
  const [{ block }, { blocktxids: blockTxids }] = await Promise.all([algod.block(round).do(), algod.getBlockTxids(round).do()]);
  const found: FundingPayment[] = [];
  const walk = (item: SignedTxnWithAD, rootId: string, inner: boolean) => {
    const txn = item.signedTxn.txn;
    const sender = txn.sender.toString();
    const pay = txn.payment;
    if (pay && sender !== address) {
      const toReceiver = pay.receiver.toString() === address;
      const toClose = pay.closeRemainderTo?.toString() === address;
      if (toReceiver || toClose) {
        const amount = (toReceiver ? pay.amount : 0n) + (toClose ? item.applyData.closingAmount ?? 0n : 0n);
        found.push({ txId: rootId, sender, amount, inner });
      }
    }
    for (const child of item.applyData.evalDelta?.innerTxns ?? []) walk(child, rootId, true);
  };
  block.payset.forEach((stib, i) => walk(stib.signedTxn, blockTxids[i], false));
  return found;
}
