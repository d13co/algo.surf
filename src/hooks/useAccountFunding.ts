import { useQuery } from "@tanstack/react-query";
import explorer from "src/utils/dappflow";
import { getTimeTravelNode } from "src/utils/timeTravel";
import { getAccountOpening, getAccountReopening, getFundingPayments } from "src/utils/accountFunding";
import { useTimeTravelStatus } from "src/hooks/useTimeTravel";

// "Not found" may be found later (indexer lag), so only results are persisted.
const meta = { noPersistEmpty: true };

/**
 * When `address` first held a record (see getAccountOpening), and the
 * payments that funded it then (see getFundingPayments). A genesis account
 * (round 0) has no payments. With a time-travel node, also its latest
 * re-opening after a close as of `atRound` (default: now), and its payments.
 */
export function useAccountFunding(address: string | undefined, atRound?: number) {
  const status = useTimeTravelStatus();
  const tt = status === "supported";
  const opening = useQuery({
    queryKey: ["account-opening", address, tt ? getTimeTravelNode()?.baseUrl : "indexer"],
    queryFn: () => getAccountOpening(explorer.network, address!, tt),
    // Once the node is known: the source depends on it.
    enabled: !!address && status !== "checking",
    staleTime: 10 * 60 * 1000,
    meta,
  });
  const round = opening.data?.round;
  const payments = useQuery({
    queryKey: ["account-funding", address, round],
    queryFn: () => getFundingPayments(explorer.network, address!, round!),
    // A funding never changes.
    enabled: !!address && round !== undefined && round > 0,
    staleTime: Infinity,
    meta,
  });
  const reopening = useQuery({
    queryKey: ["account-reopening", address, getTimeTravelNode()?.baseUrl, atRound],
    queryFn: () => getAccountReopening(address!, atRound),
    enabled: !!address && tt && round !== undefined,
    staleTime: atRound === undefined ? 10 * 60 * 1000 : Infinity,
    meta,
  });
  const reopenRound = reopening.data?.round;
  const reopenPayments = useQuery({
    queryKey: ["account-funding", address, reopenRound],
    queryFn: () => getFundingPayments(explorer.network, address!, reopenRound!),
    enabled: !!address && reopenRound !== undefined,
    staleTime: Infinity,
    meta,
  });
  return {
    reopening: reopening.data,
    reopenPayments: reopenPayments.data,
    reopenPaymentsLoading: reopenPayments.isLoading && reopenRound !== undefined,
    opening: opening.data,
    openingLoading: opening.isLoading || status === "checking",
    payments: payments.data,
    paymentsLoading: payments.isLoading && round !== undefined && round > 0,
  };
}
