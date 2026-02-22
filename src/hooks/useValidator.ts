import { useQuery } from "@tanstack/react-query";
import { network } from "src/packages/core-sdk/constants";

export type ProposalData = Array<{ rnd: number; pp: number }>;

export interface ValidatorResult {
  address: string;
  proposals: ProposalData;
  suspensions: number[];
}

const isMainnet = network === "Mainnet";

async function fetchHasProposalData(address: string): Promise<boolean> {
  const response = await fetch(
    `https://mainnet-analytics.d13.co/v0/exists/${address}`
  );
  const { exists } = await response.json();
  return exists;
}

async function fetchProposalData(address: string): Promise<ProposalData> {
  const response = await fetch(
    `https://mainnet-analytics.d13.co/v0/proposer/${address}`
  );
  return response.json();
}

async function fetchSuspensions(address: string): Promise<number[]> {
  const response = await fetch(
    `https://mainnet-analytics.d13.co/v0/evictions/${address}`
  );
  return response.json();
}

export function useValidator(address: string) {
  return useQuery({
    queryKey: ["validator", address],
    queryFn: async (): Promise<ValidatorResult> => {
      const hasData = await fetchHasProposalData(address);
      if (!hasData) return { address, proposals: [], suspensions: [] };
      const [proposals, suspensions] = await Promise.all([
        fetchProposalData(address),
        fetchSuspensions(address),
      ]);
      return { address, proposals, suspensions };
    },
    enabled: !!address && isMainnet,
  });
}
