import { useQuery } from "@tanstack/react-query";

export function useAddressBook() {
  return useQuery<Record<string, string>>({
    queryKey: ["address-book"],
    queryFn: () =>
      fetch("https://flow.algo.surf/address-book.json").then((r) => r.json()),
    staleTime: 5 * 60_000,
  });
}
