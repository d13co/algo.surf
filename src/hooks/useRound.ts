import { useCallback, useMemo } from "react";
import { NavigateOptions, useNavigate, useSearchParams } from "react-router-dom";
import { useTimeTravelStatus } from "src/hooks/useTimeTravel";

/** `path` (with any query and hash) showing the state at `round`, or as it is when there is none. */
export function withRound(path: string, round: number | undefined): string {
  if (round === undefined) return path;
  const [beforeHash, hash] = path.split(/(?=#)/);
  const [pathname, query = ""] = beforeHash.split("?");
  const params = new URLSearchParams(query);
  params.set("round", String(round));
  return `${pathname}?${params}${hash ?? ""}`;
}

/**
 * Whether a link to `href` should carry the round the current page shows:
 * any internal link without a round of its own. Only account, app and asset
 * pages show past state, but the round rides along through the others (lists,
 * blocks, transactions) so it holds wherever navigation leads.
 */
export function keepsRound(href: string): boolean {
  return href.startsWith("/") && !href.startsWith("//") && !/[?&]round=/.test(href);
}

/** A round from a URL query value; undefined where it is not one. */
export function parseRound(raw: string | null): number | undefined {
  return raw && /^\d+$/.test(raw) && Number.isSafeInteger(Number(raw)) ? Number(raw) : undefined;
}

/**
 * The past round a record page shows, from `?round=R`; undefined for the
 * latest state. Only the time-travel node serves past state, so without one
 * that serves this network `round` is undefined and `requested` holds what
 * the URL asked for. While the node is being checked, it is taken at its word.
 */
export function useRound(): { round: number | undefined; requested: number | undefined } {
  const [searchParams] = useSearchParams();
  const raw = searchParams.get("round");
  const status = useTimeTravelStatus();
  const usable = status === "checking" || status === "supported";
  return useMemo(() => {
    const requested = parseRound(raw);
    return {
      requested,
      round: requested !== undefined && usable ? requested : undefined,
    };
  }, [raw, usable]);
}

/** Internal links, carrying the round the current page shows (see keepsRound). */
export function useRoundHref(): (href: string) => string {
  const { round } = useRound();
  return useCallback((href: string) => (keepsRound(href) ? withRound(href, round) : href), [round]);
}

/** useNavigate, carrying the round the current page shows (see keepsRound). */
export function useRoundNavigate(): (to: string, options?: NavigateOptions) => void {
  const navigate = useNavigate();
  const roundHref = useRoundHref();
  return useCallback((to: string, options?: NavigateOptions) => navigate(roundHref(to), options), [navigate, roundHref]);
}
