import { useQuery } from "@tanstack/react-query";
import { surfIdxGet, surfIdxRetry } from "src/utils/surfIdx";
import { useSurfIdxCaps } from "src/hooks/useSurfIdxCaps";

/**
 * One subsigner key of a multisig, from surf idx. It keeps no history: one txn per pair, the first
 * the key signed, or while it never has, the first that used the multisig.
 */
export interface MsigMember {
  /** The subsigner key's address. */
  signer: string;
  /** The multisig's address. */
  msig: string;
  /**
   * Whether the key ever signed for the multisig. For an old-style delegated logic sig (msig, until
   * consensus v41) the sig covers only the program, so it means the key signed the program.
   */
  signed: boolean;
  /** The txn: payset[index] of this round's block (top-level txns only). */
  round: number;
  index: number;
}

export const MSIG_LIMIT = 1000;

// They change as the chain moves: don't carry them across sessions.
const live = { staleTime: 5 * 60_000, meta: { noPersist: true }, ...surfIdxRetry };

/** The subsigners of the multisig at `address`; [] if it isn't one, or was never used. */
export function useMsigSubsigners(address: string | undefined, enabled = true) {
  const msigs = useSurfIdxCaps()?.msigs;
  return useQuery({
    queryKey: ["surf-msig", address],
    queryFn: async () =>
      (await surfIdxGet<Omit<MsigMember, "msig">[]>(`/v0/msig/${address}?limit=${MSIG_LIMIT}`)).map(
        (r): MsigMember => ({ ...r, msig: address! }),
      ),
    enabled: enabled && !!address && !!msigs,
    ...live,
  });
}

/** The multisigs the key at `address` is a subsigner of; [] if none. */
export function useMsigsOf(address: string | undefined, enabled = true) {
  const msigs = useSurfIdxCaps()?.msigs;
  return useQuery({
    queryKey: ["surf-subsigner", address],
    queryFn: async () =>
      (await surfIdxGet<Omit<MsigMember, "signer">[]>(`/v0/subsigner/${address}?limit=${MSIG_LIMIT}`)).map(
        (r): MsigMember => ({ ...r, signer: address! }),
      ),
    enabled: enabled && !!address && !!msigs,
    ...live,
  });
}
