/** The request options that let `signal` abort an algosdk `.do()` call. */
export const withSignal = (signal?: AbortSignal) => (signal ? { signal } : undefined);

/** Options for a page of a created-things list (assets, applications). */
export type ListOptions = {
  signal?: AbortSignal;
  /** Deleted ones too */
  includeAll?: boolean;
};
