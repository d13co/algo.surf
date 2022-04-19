import {
    A_Asset,
    A_SearchTransaction,
    A_SearchTransaction_App_Call_Payload,
    A_SearchTransaction_Asset_Transfer_Payload,
    A_SearchTransaction_Payment_Payload
} from "../types";
import {TXN_TYPES} from "../constants";


export class CoreTransaction {
    txn: A_SearchTransaction;

    constructor(txn: A_SearchTransaction) {
        this.txn = txn;
    }

    get(): A_SearchTransaction{
        return this.txn;
    }

    getId(): string {
        return this.txn.id;
    }

    getBlock(): number {
        return this.txn["confirmed-round"];
    }

    getFee(): number {
        return this.txn.fee;
    }

    getFrom(): string {
        return this.txn.sender;
    }

    getType(): string {
        return this.txn["tx-type"];
    }

    getTypeDisplayValue(): string {
        const type = this.getType();
        if (type === 'pay') {
            return "Payment";
        }
        else if(type === 'keyreg') {
            return 'Key registration';
        }
        else if(type === 'acfg') {
            return 'Asset config';
        }
        else if(type === 'axfer') {
            return 'Asset transfer';
        }
        else if(type === 'appl') {
            return 'Application call';
        }
    }

    getTo(): string {
        const type = this.getType();

        if (type === TXN_TYPES.PAYMENT) {
            return this.txn["payment-transaction"].receiver;
        }
        if(type === TXN_TYPES.ASSET_TRANSFER) {
            return this.txn["asset-transfer-transaction"].receiver;
        }
    }

    getPaymentPayload(): A_SearchTransaction_Payment_Payload {
        return this.txn["payment-transaction"];
    }

    getAssetTransferPayload(): A_SearchTransaction_Asset_Transfer_Payload {
        return this.txn["asset-transfer-transaction"];
    }

    getAssetConfigPayload(): A_Asset {
        return this.txn["asset-config-transaction"];
    }

    getAppCallPayload(): A_SearchTransaction_App_Call_Payload {
        return this.txn["application-transaction"];
    }

    getAppId(): number {
        const type = this.getType();

        if (type === TXN_TYPES.APP_CALL) {
            let appId = this.getAppCallPayload()["application-id"];

            if (!appId) {
                appId = this.txn["created-application-index"];
            }

            return appId;
        }
    }

    getAssetId(): number {
        const type = this.getType();

        if (type === TXN_TYPES.ASSET_TRANSFER) {
            return  this.getAssetTransferPayload()["asset-id"];
        }
        if (type === TXN_TYPES.ASSET_CONFIG) {
            return this.txn["created-asset-index"];
        }
    }

    getAmount(): number {
        const type = this.getType();

        if (type === TXN_TYPES.PAYMENT) {
            return this.getPaymentPayload().amount;
        }
        if(type === TXN_TYPES.ASSET_TRANSFER) {
            return this.getAssetTransferPayload().amount;
        }
    }

    getTimestamp(): number {
        return this.txn["round-time"];
    }

    getSenderRewards(): number {
        return this.txn["sender-rewards"];
    }

    getReceiverRewards(): number {
        return this.txn["receiver-rewards"]
    }

    getNote(): string {
        return this.txn.note;
    }

    getFirstRound(): number {
        return this.txn["first-valid"];
    }

    getLastRound(): number {
        return this.txn["last-valid"];
    }

    getGenesisId(): string {
        return this.txn["genesis-id"];
    }

    getGenesisHash(): string {
        return this.txn["genesis-hash"];
    }
}