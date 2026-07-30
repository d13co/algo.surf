// Friendly names for Algorand consensus protocol versions.
//
// A consensus protocol is identified on chain by an opaque string — usually a spec commit URL
// ("https://github.com/algorandfoundation/specs/tree/953304de..."), sometimes a bare token ("v12",
// "future", "fnet4"). There is no official human-readable name for these, so we ship a table
// generated from go-algorand (see scripts/gen-consensus-versions.mjs) and resolve against it.
//
// Everything here is pure, so all three surfaces (homepage tile, upgrade dialog, block card) share
// one naming implementation.

export const CONSENSUS_VERSIONS_SCHEMA = 1;

/** Same-origin: public/consensus-versions.json ships with every deployment and the dev server. */
export const CONSENSUS_VERSIONS_PATH = "/consensus-versions.json";

export interface ConsensusVersionEntry {
    name: string;
    /** AVM / TEAL version (go-algorand LogicSigVersion). Absent for v7-v17, which predate it. */
    avm?: number;
    goConst?: string;
    spec?: string;
    /** Yes-vote slots in the upgrade vote window (UpgradeVoteRounds). */
    voteRounds?: number;
    /** Yes votes needed to approve (UpgradeThreshold). */
    threshold?: number;
    description?: string;
}

export interface ConsensusVersionTable {
    schema: number;
    generatedAt: string;
    source: { repo: string; ref: string; commit: string | null };
    current: string | null;
    versions: Record<string, ConsensusVersionEntry>;
}

export interface ConsensusVersionInfo {
    protocol: string;
    /** Always non-empty, so the UI can never render "Consensus undefined". */
    name: string;
    avm: number | null;
    specUrl: string | null;
    description: string | null;
    voteRounds: number | null;
    threshold: number | null;
    /** False when the table was unavailable or had no entry — callers should show the raw protocol. */
    known: boolean;
}

const SPEC_TREE_RE = /^https:\/\/github\.com\/(?:algorand\/spec|algorandfoundation\/specs)\/tree\/([0-9a-f]{7,40})$/;

/** The spec commit URL for a protocol string, or null for bare tokens like "v12" / "future". */
export function specUrlFor(protocol: string): string | null {
    return SPEC_TREE_RE.test(protocol) ? protocol : null;
}

/** A short, displayable stand-in for an unrecognised protocol string. */
export function shortProtocol(protocol: string): string {
    const match = protocol.match(SPEC_TREE_RE);
    if (match) return match[1].slice(0, 7);
    if (protocol.length > 14) return protocol.slice(0, 13) + "…";
    return protocol;
}

export function isConsensusVersionTable(value: unknown): value is ConsensusVersionTable {
    if (!value || typeof value !== "object") return false;
    const table = value as Partial<ConsensusVersionTable>;
    return table.schema === CONSENSUS_VERSIONS_SCHEMA
        && !!table.versions
        && typeof table.versions === "object";
}

/**
 * Resolve a protocol string to display data, degrading in steps rather than failing:
 * table hit -> bare token used as-is ("v12" already reads as a name) -> truncated spec commit
 * with a link -> truncated raw string.
 */
export function resolveConsensusVersion(
    table: ConsensusVersionTable | undefined,
    protocol: string,
): ConsensusVersionInfo {
    const specUrl = specUrlFor(protocol);
    const entry = table?.versions?.[protocol];

    if (entry) {
        return {
            protocol,
            name: entry.name,
            avm: entry.avm ?? null,
            specUrl: entry.spec ?? specUrl,
            description: entry.description ?? null,
            voteRounds: entry.voteRounds ?? null,
            threshold: entry.threshold ?? null,
            known: true,
        };
    }

    return {
        protocol,
        name: shortProtocol(protocol),
        avm: null,
        specUrl,
        description: null,
        voteRounds: null,
        threshold: null,
        known: false,
    };
}

/** "Consensus v41", or "Consensus 953304d" when the protocol is unrecognised. */
export function consensusLabel(info: ConsensusVersionInfo): string {
    return `Consensus ${info.name}`;
}
