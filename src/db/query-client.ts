import { QueryClient } from "@tanstack/react-query";

export const ONE_WEEK = 1000 * 60 * 60 * 24 * 7;
export const ONE_MONTH = 1000 * 60 * 60 * 24 * 30;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 0,
    },
  },
});
