import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { ONE_WEEK } from "src/db/query-client";
import {
    CONSENSUS_VERSIONS_PATH,
    ConsensusVersionInfo,
    ConsensusVersionTable,
    isConsensusVersionTable,
    resolveConsensusVersion,
} from "src/packages/core-sdk/consensusVersions";

/**
 * The consensus protocol name table. Same-origin, so it works in dev, on localnet, and offline
 * (gcTime keeps it in the IndexedDB query cache between visits).
 */
export function useConsensusVersions() {
    return useQuery<ConsensusVersionTable>({
        queryKey: ["consensus-versions"],
        queryFn: async () => {
            const res = await fetch(CONSENSUS_VERSIONS_PATH);
            if (!res.ok) throw new Error(`consensus-versions: HTTP ${res.status}`);
            const body = await res.json();
            // Throw rather than return a mismatched shape: callers degrade gracefully on undefined.
            if (!isConsensusVersionTable(body)) throw new Error("consensus-versions: unexpected schema");
            return body;
        },
        staleTime: 6 * 60 * 60_000,
        gcTime: ONE_WEEK,
    });
}

/**
 * Returns a resolver rather than resolving a single protocol, because the dialog and block card each
 * need to name two or three protocols and hooks cannot be called in a loop. TanStack dedupes on the
 * shared query key, so every surface together costs one request.
 */
export function useConsensusVersionLookup(): (protocol: string) => ConsensusVersionInfo {
    const { data } = useConsensusVersions();
    return useCallback((protocol: string) => resolveConsensusVersion(data, protocol), [data]);
}
