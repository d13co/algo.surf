import { useQuery } from "@tanstack/react-query";
import { surfIdxGet, surfIdxGetOrNull, surfIdxRetry } from "src/utils/surfIdx";
import { useSurfIdxCaps } from "src/hooks/useSurfIdxCaps";

/**
 * One logic sig use, per program, delegator and rekeyed sender. surf idx keeps no per-round
 * history, only the txn count and the first and last round it authorized one.
 */
export interface LsigUse {
  /** The program's address. */
  lsig: string;
  template: string;
  /** The delegator, which signed the program; null for an escrow. */
  signer: string | null;
  /** The sender when rekeyed (to the escrow, or to `signer`), else null. */
  sender: string | null;
  txns: number;
  firstRound: number;
  lastRound: number;
}

export interface LsigInfo {
  template: string;
  /** Set by a surf idx admin; null when unnamed. */
  name?: string | null;
  /** Distinct programs of its template. */
  programs: number;
  uses: LsigUse[];
}

export interface LsigTemplateSummary {
  template: string;
  name?: string | null;
  programs: number;
  /** Distinct accounts that signed one of its programs. */
  delegators: number;
  txns: number;
  firstRound: number;
  lastRound: number;
}

export interface LsigTemplate {
  template: string;
  name?: string | null;
  /** The first program seen of the template, base64. */
  logic: string;
  programs: number;
  /** Newest first, capped at USES_LIMIT. */
  uses: LsigUse[];
}

export const USES_LIMIT = 1000;

// They change as the chain moves, and can be large: don't carry them across sessions.
const live = { staleTime: 5 * 60_000, meta: { noPersist: true }, ...surfIdxRetry };

/** The logic sig with this program address; null if it never authorized a txn. */
export function useLsig(address: string | undefined) {
  const lsigs = useSurfIdxCaps()?.lsigs;
  return useQuery({
    queryKey: ["surf-lsig", address],
    queryFn: () => surfIdxGetOrNull<LsigInfo>(`/v0/lsig/${address}`),
    enabled: !!address && !!lsigs,
    ...live,
  });
}

/** Uses where the address signed the program, or was moved by it while rekeyed. */
export function useDelegations(address: string | undefined, enabled = true) {
  const lsigs = useSurfIdxCaps()?.lsigs;
  return useQuery({
    queryKey: ["surf-delegations", address],
    queryFn: () => surfIdxGet<LsigUse[]>(`/v0/delegations/${address}`),
    enabled: enabled && !!address && !!lsigs,
    ...live,
  });
}

/** Templates with 2 or more programs, or delegated by 2 or more accounts. */
export function useLsigTemplates() {
  const lsigs = useSurfIdxCaps()?.lsigs;
  return useQuery({
    queryKey: ["surf-lsig-templates"],
    queryFn: () => surfIdxGet<LsigTemplateSummary[]>(`/v0/templates?limit=100000`),
    enabled: !!lsigs,
    ...live,
  });
}

/** null if no logic sig of the template was seen. */
export function useLsigTemplate(id: string | undefined) {
  const lsigs = useSurfIdxCaps()?.lsigs;
  return useQuery({
    queryKey: ["surf-lsig-template", id],
    queryFn: () => surfIdxGetOrNull<LsigTemplate>(`/v0/template/${id}?limit=${USES_LIMIT}`),
    enabled: !!id && /^[0-9a-f]{16}$/.test(id) && !!lsigs,
    ...live,
  });
}

/** The template's admin-set name, else its id. */
export function templateLabel(t: { template: string; name?: string | null }): string {
  return t.name || t.template;
}

export type DelegationRole = "delegated" | "delegated-for" | "rekeyed-to-escrow" | "rekeyed-to-delegator";

/** The account whose txns the use authorized: the rekeyed sender, else the delegator, else the escrow. */
export function usedBy(use: LsigUse): string {
  return use.sender ?? use.signer ?? use.lsig;
}

/** How `address` relates to a use returned by /v0/delegations/<address>. */
export function delegationRole(use: LsigUse, address: string): DelegationRole {
  if (use.signer === address) return !use.sender || use.sender === address ? "delegated" : "delegated-for";
  return use.signer ? "rekeyed-to-delegator" : "rekeyed-to-escrow";
}

/**
 * Whether the use can still authorize txns of `address`, given the account's current auth address:
 * a logic sig authorizes for an account only while it is authorized by the signer (or the escrow).
 * undefined when the use moved another account, whose auth address this doesn't know.
 */
export function delegationLive(use: LsigUse, address: string, authAddr: string | undefined): boolean | undefined {
  const authorizer = use.signer ?? use.lsig;
  const moved = use.sender ?? authorizer;
  if (moved !== address) return undefined;
  return (authAddr ?? address) === authorizer;
}
