import { Algodv2, indexerModels, ALGORAND_ZERO_ADDRESS_STRING } from "algosdk";
import type { Indexer } from "algosdk";
import {
    A_Asset,
    A_AssetResult,
} from "../types";
import {Network} from "../network";
import {A_TransactionsResponse} from "./transactionClient";
import { toA_Asset, toA_AssetsResponse } from "../utils/v3Adapters";


function strToBytes(s: string | undefined): Uint8Array | undefined {
    return s ? new TextEncoder().encode(s) : undefined;
}

// A deleted asset's roles come back as the zero address rather than absent.
function validAddr(addr: string | undefined): string | undefined {
    return addr && addr !== ALGORAND_ZERO_ADDRESS_STRING ? addr : undefined;
}

// Walks a transaction and its inner transactions, recording the asset's
// creation params (created-asset-index == id) and the params from the most
// recent acfg referencing the asset (createdAssetIndex or asset-id == id).
// Destroy acfgs carry no params and are skipped.
function collectAcfgParams(
    t: indexerModels.Transaction,
    id: number,
    acc: {
        creation: indexerModels.AssetParams | null;
        latest: indexerModels.AssetParams | null;
        latestRound: bigint;
    },
    // The indexer only stamps confirmedRound on the outer txn; inner txns carry
    // none, so inherit the enclosing txn's round to date inner-txn reconfigs.
    parentRound: bigint = 0n
): void {
    const round = t.confirmedRound ?? parentRound;
    const cfg = t.assetConfigTransaction;
    const params = cfg?.params;
    if (params) {
        const isCreation = t.createdAssetIndex != null && Number(t.createdAssetIndex) === id;
        const refersToId = isCreation || (cfg.assetId != null && Number(cfg.assetId) === id);
        if (isCreation) {
            acc.creation = params;
        }
        if (refersToId && round >= acc.latestRound) {
            acc.latestRound = round;
            acc.latest = params;
        }
    }

    for (const inner of t.innerTxns ?? []) {
        collectAcfgParams(inner, id, acc, round);
    }
}

// Merge config-transaction params into a (deleted) asset's cleared params,
// keeping any value the indexer still has. Immutable fields (name, unit,
// decimals, ...) come from the creation txn; the mutable role addresses come
// from `roles`, which is the most recent reconfiguration (acfg) for the asset.
function mergeAssetParams(
    cur: indexerModels.AssetParams,
    creation: indexerModels.AssetParams,
    roles: indexerModels.AssetParams
): indexerModels.AssetParams {
    return new indexerModels.AssetParams({
        creator: cur.creator || creation.creator,
        decimals: cur.decimals || creation.decimals,
        total: cur.total || creation.total,
        name: cur.name ?? creation.name,
        nameB64: cur.nameB64 ?? creation.nameB64 ?? strToBytes(creation.name),
        unitName: cur.unitName ?? creation.unitName,
        unitNameB64: cur.unitNameB64 ?? creation.unitNameB64 ?? strToBytes(creation.unitName),
        url: cur.url ?? creation.url,
        urlB64: cur.urlB64 ?? creation.urlB64 ?? strToBytes(creation.url),
        metadataHash: cur.metadataHash ?? creation.metadataHash,
        manager: validAddr(cur.manager) ?? roles.manager,
        reserve: validAddr(cur.reserve) ?? roles.reserve,
        freeze: validAddr(cur.freeze) ?? roles.freeze,
        clawback: validAddr(cur.clawback) ?? roles.clawback,
        defaultFrozen: cur.defaultFrozen ?? creation.defaultFrozen,
    });
}

export type A_AssetTransactionsResponse = A_TransactionsResponse;

export type A_AssetsResponse = {
    'next-token': string,
    assets: A_Asset[]
};

export class AssetClient{
    client: Algodv2;
    indexer: Indexer;
    network: Network

    constructor(network: Network) {
        this.network = network;
        this.client = network.getClient();
        this.indexer = network.getIndexer();
    }

    async get(id: number): Promise<indexerModels.Asset>{
        const response = await this.indexer.lookupAssetByID(id).includeAll().do();
        return response.asset;
    }

    // When an asset is destroyed the indexer clears its params (name, unit,
    // decimals, ...). Look up the asset-creation (acfg) transaction and use its
    // params to back-fill whatever the indexer no longer returns.
    async getWithCreationFallback(id: number): Promise<indexerModels.Asset> {
        const asset = await this.get(id);
        if (!asset.deleted) {
            return asset;
        }

        try {
            const config = await this.getConfigParams(id);
            if (config.creation) {
                asset.params = mergeAssetParams(
                    asset.params,
                    config.creation,
                    config.latest ?? config.creation
                );
            }
        } catch {
            // The acfg scan failed (transient indexer error / very long history).
            // Fall back to the base (cleared) params rather than failing the
            // whole lookup, which the plain get() would have returned anyway.
        }
        return asset;
    }

    // Scans the asset's config (acfg) transactions and returns:
    //  - creation: params from the creation txn (created-asset-index == id) — the
    //    source of truth for immutable fields (name, unit, decimals, ...).
    //  - latest: params from the most recent reconfiguration — the source of
    //    truth for the mutable role addresses. A destroy acfg carries no params
    //    and is therefore ignored.
    // Assets are frequently created/configured via inner transactions, so each
    // returned transaction (and its inner txns) is walked recursively.
    private async getConfigParams(
        id: number
    ): Promise<{ creation: indexerModels.AssetParams | null; latest: indexerModels.AssetParams | null }> {
        const acc: {
            creation: indexerModels.AssetParams | null;
            latest: indexerModels.AssetParams | null;
            latestRound: bigint;
        } = { creation: null, latest: null, latestRound: -1n };

        let token: string | undefined = undefined;
        do {
            const req = this.indexer.searchForTransactions().assetID(id).txType("acfg");
            if (token) {
                req.nextToken(token);
            }
            const response = await req.do();
            const txns = (response.transactions ?? []) as indexerModels.Transaction[];
            for (const t of txns) {
                collectAcfgParams(t, id, acc);
            }
            token = response.nextToken;
        } while (token);

        return { creation: acc.creation, latest: acc.latest };
    }

    async search(id: number): Promise<A_AssetResult | null>{
        try {
            const response = await this.indexer.lookupAssetByID(id).includeAll().do();
            const converted = toA_Asset(response.asset);
            return { ...converted, type: "asset" } as A_AssetResult;
        } catch(e) {
            if ((e as any).response?.status === 404)
                return null
            else
                throw e;
        }
    }

    async getAssets(token?: string): Promise<A_AssetsResponse> {

        const req = this.indexer.searchForAssets();
        if (token) {
            req.nextToken(token);
        }

        const response = await req.do();
        return toA_AssetsResponse(response);
    }

    async getAssetTransactions(id: number, token?: string): Promise<A_AssetTransactionsResponse> {
        const req = this.indexer.searchForTransactions().assetID(id);
        if (token) {
            req.nextToken(token);
        }

        const response = await req.do();
        const transactions = (response.transactions ?? []) as indexerModels.Transaction[];
        return { 'next-token': response['nextToken'] ?? '', transactions };
    }

    async searchForAssetsByName(searchText: string): Promise<A_Asset> {
        const response = await this.indexer.searchForAssets().name(searchText).do();
        const converted = toA_AssetsResponse(response);
        return converted.assets[0];
    }

    async searchForAssetsByIndex(id: number): Promise<A_Asset> {
        const response = await this.indexer.searchForAssets().index(id).do();
        const converted = toA_AssetsResponse(response);
        return converted.assets[0];
    }


}
