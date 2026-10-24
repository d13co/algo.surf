import { QueryClient } from "@tanstack/react-query";
import { ONE_HOUR } from "./persist-policy";
import { persister } from "./query-persister";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 0,
      // In-memory session working set. Cross-session retention is the persist
      // policy (src/db/persist-policy.ts), not gcTime.
      gcTime: ONE_HOUR,
      // Restores each query from IndexedDB when it first fetches. Also makes
      // networkMode default to "offlineFirst": offline, a query still reads
      // its stored entry before its fetch fails, rather than pausing.
      persister,
    },
  },
});
