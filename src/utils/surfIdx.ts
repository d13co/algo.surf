/**
 * surf idx serves fee/TPS series, upgrade history and block proposer analytics. Its URL comes only
 * from REACT_APP_SURF_IDX, set per build like REACT_APP_NETWORK: a build without it has no surf idx
 * features.
 */
const surfIdxHost = process.env.REACT_APP_SURF_IDX?.replace(/\/+$/, "");
/** This build has a surf idx. Fees and TPS are always served; check useSurfIdxCaps for the rest. */
export const surfIdxSupported = !!surfIdxHost;

/** A non-2xx reply from surf idx. */
export class SurfIdxError extends Error {
  constructor(
    readonly status: number,
    statusText: string,
    /** Seconds to wait before retrying, from Retry-After (429 and 503). */
    readonly retryAfter?: number,
  ) {
    super(`${status} ${statusText}`);
    this.name = "SurfIdxError";
  }
}

/** Retry-After in seconds: delay-seconds or an HTTP date. */
function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  if (/^\d+$/.test(value.trim())) return Number(value);
  const at = Date.parse(value);
  return Number.isNaN(at) ? undefined : Math.max(0, (at - Date.now()) / 1000);
}

function surfIdxError(response: Response): SurfIdxError {
  return new SurfIdxError(response.status, response.statusText, parseRetryAfter(response.headers.get("Retry-After")));
}

async function fetchSurfIdx(path: string): Promise<Response> {
  const response = await fetch(`${surfIdxHost}${path}`);
  if (!response.ok && response.status !== 404) throw surfIdxError(response);
  return response;
}

export async function surfIdxGet<T>(path: string): Promise<T> {
  const response = await fetchSurfIdx(path);
  if (response.status === 404) throw surfIdxError(response);
  return response.json();
}

/** surfIdxGet, but null on 404, which routes like /v0/lsig and /v0/round use for "not seen". */
export async function surfIdxGetOrNull<T>(path: string): Promise<T | null> {
  const response = await fetchSurfIdx(path);
  return response.status === 404 ? null : response.json();
}

// Longest Retry-After worth waiting for: past it, fail now rather than retry early into another 429.
const MAX_RETRY_WAIT = 5;

/** Up to 2 retries of a rate-limited (429) or overloaded (503) request, when told to wait at most MAX_RETRY_WAIT. */
export function surfIdxShouldRetry(failureCount: number, error: unknown): boolean {
  return (
    failureCount < 2 &&
    error instanceof SurfIdxError &&
    (error.status === 429 || error.status === 503) &&
    (error.retryAfter ?? 0) <= MAX_RETRY_WAIT
  );
}

/** Retry-After where given, else 1 s then 2 s. */
export function surfIdxRetryDelay(failureCount: number, error: unknown): number {
  const retryAfter = error instanceof SurfIdxError ? error.retryAfter : undefined;
  // failureCount is 0 before the first retry.
  return Math.min(MAX_RETRY_WAIT, retryAfter ?? 2 ** failureCount) * 1000;
}

/** Retry options for surf idx queries. */
export const surfIdxRetry = { retry: surfIdxShouldRetry, retryDelay: surfIdxRetryDelay };
