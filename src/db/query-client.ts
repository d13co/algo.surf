import { QueryClient } from "@tanstack/react-query";
import { ONE_HOUR } from "./persist-policy";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 0,
      // In-memory session working set. Cross-session retention is the persist
      // policy (src/db/persist-policy.ts), not gcTime; hydrated queries are
      // built with this default too.
      gcTime: ONE_HOUR,
    },
  },
});
