import {
    A_Asset
} from "../../types";
import {IPFS_GATEWAY} from "../../../arc-portal/utils";
import {ARC19} from "../../../arc-portal/classes/ARC19/ARC19";
import { indexerModels, bytesToBase64, ALGORAND_ZERO_ADDRESS_STRING } from "algosdk";
import { encodingDataToPlain } from "../../utils/serialize";

function isValidAddress(addr: string | undefined): boolean {
    return Boolean(addr) && addr !== ALGORAND_ZERO_ADDRESS_STRING;
}

export class CoreAsset {
    asset: indexerModels.Asset;

    constructor(asset: indexerModels.Asset | A_Asset) {
        if (!asset) {
            throw new Error("Invalid asset");
        }
        if (asset instanceof indexerModels.Asset) {
            this.asset = asset;
        } else {
            this.asset = CoreAsset.fromLegacy(asset);
        }
    }

    private static fromLegacy(a: A_Asset): indexerModels.Asset {
        const p = a.params;
        return new indexerModels.Asset({
            index: BigInt(a.index ?? 0),
            deleted: a.deleted,
            params: new indexerModels.AssetParams({
                creator: p.creator ?? "",
                decimals: p.decimals ?? 0,
                total: BigInt(p.total ?? 0),
                clawback: p.clawback,
                defaultFrozen: p["default-frozen"],
                freeze: p.freeze,
                manager: p.manager,
                name: p.name,
                nameB64: p["name-b64"] ? Uint8Array.from(atob(p["name-b64"]), c => c.charCodeAt(0)) : undefined,
                reserve: p.reserve,
                unitName: p["unit-name"],
                unitNameB64: p["unit-name-b64"] ? Uint8Array.from(atob(p["unit-name-b64"]), c => c.charCodeAt(0)) : undefined,
                url: p.url,
                urlB64: p["url-b64"] ? Uint8Array.from(atob(p["url-b64"]), c => c.charCodeAt(0)) : undefined,
                metadataHash: p["metadata-hash"] ? Uint8Array.from(atob(p["metadata-hash"]), c => c.charCodeAt(0)) : undefined,
            }),
        });
    }

    get(): indexerModels.Asset {
        return this.asset;
    }

    toJSON(): Record<string, unknown> {
        return encodingDataToPlain(this.asset.toEncodingData());
    }

    isDeleted(): boolean {
        return this.asset.deleted === true;
    }

    hasManager(): boolean {
        return isValidAddress(this.asset.params.manager);
    }

    hasReserve(): boolean {
        return isValidAddress(this.asset.params.reserve);
    }

    hasFreeze(): boolean {
        return isValidAddress(this.asset.params.freeze);
    }

    hasClawback(): boolean {
        return isValidAddress(this.asset.params.clawback);
    }

    getManager(): string {
        return this.asset.params.manager ?? "";
    }

    getReserve(): string {
        return this.asset.params.reserve ?? "";
    }

    getFreeze(): string {
        return this.asset.params.freeze ?? "";
    }

    getClawback(): string {
        return this.asset.params.clawback ?? "";
    }

    getIndex(): number {
        return Number(this.asset.index);
    }

    getName(): string {
        return this.asset.params.name ?? "";
    }

    getNameB64(): string {
        return this.asset.params.nameB64 ? bytesToBase64(this.asset.params.nameB64) : "";
    }

    getUnitName(): string {
        return this.asset.params.unitName ?? "";
    }

    getUnitNameB64(): string {
        return this.asset.params.unitNameB64 ? bytesToBase64(this.asset.params.unitNameB64) : "";
    }

    getDecimals(): number {
        return this.asset.params.decimals;
    }

    getTotal(): number {
        return Number(this.asset.params.total);
    }

    getTotalSupply(): number {
        return (this.getTotal() / Math.pow(10, this.getDecimals()));
    }

    getAmountInDecimals(amount: number): number {
        return (amount / Math.pow(10, this.getDecimals()));
    }

    getCreator(): string {
        return this.asset.params.creator;
    }

    getDefaultFrozen(): boolean {
        return this.asset.params.defaultFrozen ?? false;
    }

    getUrl(): string {
        return this.asset.params.url ?? "";
    }

    getMetadataHash(): string {
        return this.asset.params.metadataHash ? bytesToBase64(this.asset.params.metadataHash) : "";
    }

    getUrlProtocol(): string {
        const url = this.getUrl();

        if (!url) {
            return '';
        }

        const chunks = url.split("://");
        if (chunks.length > 0) {
            return chunks[0];
        }

        return '';
    }

    hasHttpsUrl(): boolean {
        return this.getUrlProtocol() === 'https';
    }

    hasIpfsUrl(): boolean {
        return this.getUrlProtocol() === 'ipfs';
    }

    hasTemplateUrl(): boolean {
        return this.getUrlProtocol() === 'template-ipfs';
    }

    getResolvedUrl(ipfsGateway: string = IPFS_GATEWAY): string {
        const url = this.getUrl();

        if (this.hasIpfsUrl()) {
            const chunks = url.split("://");
            return ipfsGateway + "/" + chunks[1];
        }

        if (this.hasTemplateUrl()) {
            const arc19Instance = new ARC19(this.asset);
            if (arc19Instance.hasValidUrl()) {
                return arc19Instance.getMetadataUrl();
            }
        }

        return url
    }
}
