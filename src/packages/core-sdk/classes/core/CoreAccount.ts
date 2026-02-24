import { modelsv2 } from "algosdk";


export class CoreAccount {
    account: modelsv2.Account;

    constructor(account: modelsv2.Account) {
        if (!account) {
            throw new Error("Invalid account");
        }
        this.account = account;
    }

    get(): modelsv2.Account{
        return this.account;
    }

    getCreatedAssets(): modelsv2.Asset[]{
        return this.account.createdAssets ?? [];
    }

    getCreatedApplications(): modelsv2.Application[]{
        return this.account.createdApps ?? [];
    }

    getOptedApplications(): modelsv2.ApplicationLocalState[]{
        return this.account.appsLocalState ?? [];
    }

    getBalance(): number {
        return Number(this.account.amount);
    }

    getMinBalance(): number {
        return Number(this.account.minBalance);
    }

    getHoldingAssets(): modelsv2.AssetHolding[]{
        return this.account.assets ?? [];
    }

    isCreatedAsset(assetId: number): boolean {
        const createdAssets = this.getCreatedAssets();

        for (const asset of createdAssets) {
            if (Number(asset.index) === assetId) {
                return true;
            }
        }

        return false;
    }

    getCreatedAsset(assetId: number): modelsv2.Asset | undefined {
        const createdAssets = this.getCreatedAssets();

        for (const asset of createdAssets) {
            if (Number(asset.index) === assetId) {
                return asset;
            }
        }
    }

    getHoldingAsset(assetId: number): modelsv2.AssetHolding | undefined {
        const assets = this.getHoldingAssets();
        for (const asset of assets) {
            if (Number(asset.assetId) === assetId) {
                return asset;
            }
        }
    }

    balanceOf(assetId: number): number {
        const asset = this.getHoldingAsset(assetId);

        if (asset) {
            return Number(asset.amount);
        }

        return 0;
    }

    getAssetBal(asset: modelsv2.Asset): number {
        return this.balanceOf(Number(asset.index)) / Math.pow(10, asset.params.decimals);
    }
}
