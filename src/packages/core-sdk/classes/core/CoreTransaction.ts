import {
    A_SearchTransaction,
} from "../../types";
import {TEXT_ENCODING, TIMESTAMP_DISPLAY_FORMAT, TXN_TYPES} from "../../constants";
import msgpack from "msgpack-lite";
import dateFormat  from "dateformat";
import {encodeAddress, indexerModels, bytesToBase64} from "algosdk";
import { encodingDataToPlain } from "../../utils/serialize";
import humanizeDuration from 'humanize-duration';

function b64ToBytes(s: string | undefined): Uint8Array | undefined {
    if (!s) return undefined;
    return new Uint8Array(Buffer.from(s, 'base64'));
}

export class CoreTransaction {
    txn: indexerModels.Transaction;

    constructor(txn: indexerModels.Transaction | A_SearchTransaction) {
        if (!txn) {
            throw new Error("Invalid transaction");
        }
        if (txn instanceof indexerModels.Transaction) {
            this.txn = txn;
        } else {
            this.txn = CoreTransaction.fromLegacy(txn);
        }
    }

    static fromLegacy(t: A_SearchTransaction): indexerModels.Transaction {
        return new indexerModels.Transaction({
            fee: BigInt(t.fee ?? 0),
            firstValid: BigInt(t["first-valid"] ?? 0),
            lastValid: BigInt(t["last-valid"] ?? 0),
            sender: t.sender ?? "",
            id: t.id,
            txType: t["tx-type"],
            confirmedRound: t["confirmed-round"] != null ? BigInt(t["confirmed-round"]) : undefined,
            roundTime: t["round-time"],
            intraRoundOffset: t["intra-round-offset"],
            note: b64ToBytes(t.note),
            genesisHash: b64ToBytes(t["genesis-hash"]),
            genesisId: t["genesis-id"],
            group: b64ToBytes(t.group),
            rekeyTo: t["rekey-to"] || undefined,
            closeRewards: t["close-rewards"] != null ? BigInt(t["close-rewards"]) : undefined,
            closingAmount: t["closing-amount"] != null ? BigInt(t["closing-amount"]) : undefined,
            senderRewards: t["sender-rewards"] != null ? BigInt(t["sender-rewards"]) : undefined,
            receiverRewards: t["receiver-rewards"] != null ? BigInt(t["receiver-rewards"]) : undefined,
            createdApplicationIndex: t["created-application-index"] != null ? BigInt(t["created-application-index"]) : undefined,
            createdAssetIndex: t["created-asset-index"] != null ? BigInt(t["created-asset-index"]) : undefined,

            paymentTransaction: t["payment-transaction"] ? new indexerModels.TransactionPayment({
                amount: BigInt(t["payment-transaction"].amount ?? 0),
                receiver: t["payment-transaction"].receiver ?? "",
                closeAmount: t["payment-transaction"]["close-amount"] != null ? BigInt(t["payment-transaction"]["close-amount"]) : undefined,
                closeRemainderTo: t["payment-transaction"]["close-remainder-to"] || undefined,
            }) : undefined,

            assetTransferTransaction: t["asset-transfer-transaction"] ? new indexerModels.TransactionAssetTransfer({
                amount: BigInt(t["asset-transfer-transaction"].amount ?? 0),
                assetId: BigInt(t["asset-transfer-transaction"]["asset-id"] ?? 0),
                receiver: t["asset-transfer-transaction"].receiver ?? "",
                closeAmount: t["asset-transfer-transaction"]["close-amount"] != null ? BigInt(t["asset-transfer-transaction"]["close-amount"]) : undefined,
                closeTo: t["asset-transfer-transaction"]["close-to"] || undefined,
            }) : undefined,

            assetFreezeTransaction: t["asset-freeze-transaction"] ? new indexerModels.TransactionAssetFreeze({
                address: t["asset-freeze-transaction"].address ?? "",
                assetId: BigInt(t["asset-freeze-transaction"]["asset-id"] ?? 0),
                newFreezeStatus: t["asset-freeze-transaction"]["new-freeze-status"] ?? false,
            }) : undefined,

            assetConfigTransaction: t["asset-config-transaction"] ? new indexerModels.TransactionAssetConfig({
                assetId: t["asset-config-transaction"]["asset-id"] != null ? BigInt(t["asset-config-transaction"]["asset-id"]) : undefined,
                params: t["asset-config-transaction"].params ? new indexerModels.AssetParams({
                    creator: t["asset-config-transaction"].params.creator ?? "",
                    decimals: t["asset-config-transaction"].params.decimals ?? 0,
                    total: BigInt(t["asset-config-transaction"].params.total ?? 0),
                    clawback: t["asset-config-transaction"].params.clawback || undefined,
                    defaultFrozen: t["asset-config-transaction"].params["default-frozen"],
                    freeze: t["asset-config-transaction"].params.freeze || undefined,
                    manager: t["asset-config-transaction"].params.manager || undefined,
                    name: t["asset-config-transaction"].params.name,
                    reserve: t["asset-config-transaction"].params.reserve || undefined,
                    unitName: t["asset-config-transaction"].params["unit-name"],
                    url: t["asset-config-transaction"].params.url,
                }) : undefined,
            }) : undefined,

            applicationTransaction: t["application-transaction"] ? new indexerModels.TransactionApplication({
                applicationId: BigInt(t["application-transaction"]["application-id"] ?? 0),
                accounts: t["application-transaction"].accounts,
                applicationArgs: t["application-transaction"]["application-args"]?.map(
                    (a: string) => b64ToBytes(a)!
                ),
                approvalProgram: b64ToBytes(t["application-transaction"]["approval-program"]),
                clearStateProgram: b64ToBytes(t["application-transaction"]["clear-state-program"]),
                foreignApps: t["application-transaction"]["foreign-apps"]?.map((n: number) => BigInt(n)),
                foreignAssets: t["application-transaction"]["foreign-assets"]?.map((n: number) => BigInt(n)),
                onCompletion: t["application-transaction"]["on-completion"],
                globalStateSchema: t["application-transaction"]["global-state-schema"] ? new indexerModels.StateSchema({
                    numByteSlice: BigInt(t["application-transaction"]["global-state-schema"]["num-byte-slice"] ?? 0),
                    numUint: BigInt(t["application-transaction"]["global-state-schema"]["num-uint"] ?? 0),
                }) : undefined,
                localStateSchema: t["application-transaction"]["local-state-schema"] ? new indexerModels.StateSchema({
                    numByteSlice: BigInt(t["application-transaction"]["local-state-schema"]["num-byte-slice"] ?? 0),
                    numUint: BigInt(t["application-transaction"]["local-state-schema"]["num-uint"] ?? 0),
                }) : undefined,
            }) : undefined,

            keyregTransaction: t["keyreg-transaction"] ? new indexerModels.TransactionKeyreg({
                nonParticipation: t["keyreg-transaction"]["non-participation"],
                selectionParticipationKey: b64ToBytes(t["keyreg-transaction"]["selection-participation-key"]),
                voteParticipationKey: b64ToBytes(t["keyreg-transaction"]["vote-participation-key"]),
                stateProofKey: b64ToBytes(t["keyreg-transaction"]["state-proof-key"]),
                voteFirstValid: t["keyreg-transaction"]["vote-first-valid"] != null ? BigInt(t["keyreg-transaction"]["vote-first-valid"]) : undefined,
                voteLastValid: t["keyreg-transaction"]["vote-last-valid"] != null ? BigInt(t["keyreg-transaction"]["vote-last-valid"]) : undefined,
                voteKeyDilution: t["keyreg-transaction"]["vote-key-dilution"] != null ? BigInt(t["keyreg-transaction"]["vote-key-dilution"]) : undefined,
            }) : undefined,

            heartbeatTransaction: t["heartbeat-transaction"] ? new indexerModels.TransactionHeartbeat({
                hbAddress: t["heartbeat-transaction"]["hb-address"] ?? "",
                hbKeyDilution: BigInt(t["heartbeat-transaction"]["hb-key-dilution"] ?? 0),
                hbProof: new indexerModels.HbProofFields({
                    hbPk: b64ToBytes(t["heartbeat-transaction"]["hb-proof"]?.["hb-pk"]),
                    hbPk1sig: b64ToBytes(t["heartbeat-transaction"]["hb-proof"]?.["hb-pk1sig"]),
                    hbPk2: b64ToBytes(t["heartbeat-transaction"]["hb-proof"]?.["hb-pk2"]),
                    hbPk2sig: b64ToBytes(t["heartbeat-transaction"]["hb-proof"]?.["hb-pk2sig"]),
                    hbSig: b64ToBytes(t["heartbeat-transaction"]["hb-proof"]?.["hb-sig"]),
                }),
                hbSeed: b64ToBytes(t["heartbeat-transaction"]["hb-seed"]) ?? new Uint8Array(),
                hbVoteId: b64ToBytes(t["heartbeat-transaction"]["hb-vote-id"]) ?? new Uint8Array(),
            }) : undefined,

            stateProofTransaction: t["state-proof-transaction"] ? (() => {
                const sp = t["state-proof-transaction"];
                return sp as unknown as indexerModels.TransactionStateProof;
            })() : undefined,

            globalStateDelta: t["global-state-delta"]?.map(d => new indexerModels.EvalDeltaKeyValue({
                key: d.key,
                value: new indexerModels.EvalDelta({
                    action: d.value.action,
                    bytes: d.value.bytes,
                    uint: d.value.uint != null ? BigInt(d.value.uint) : undefined,
                }),
            })),

            localStateDelta: t["local-state-delta"]?.map(ls => new indexerModels.AccountStateDelta({
                address: ls.address,
                delta: ls.delta.map(d => new indexerModels.EvalDeltaKeyValue({
                    key: d.key,
                    value: new indexerModels.EvalDelta({
                        action: d.value.action,
                        bytes: d.value.bytes,
                        uint: d.value.uint != null ? BigInt(d.value.uint) : undefined,
                    }),
                })),
            })),

            innerTxns: t["inner-txns"]?.map(inner => CoreTransaction.fromLegacy(inner as A_SearchTransaction)),

            signature: t.signature ? new indexerModels.TransactionSignature({
                multisig: t.signature.multisig ? new indexerModels.TransactionSignatureMultisig({
                    version: t.signature.multisig.version,
                    threshold: t.signature.multisig.threshold,
                    subsignature: t.signature.multisig.subsignature?.map(s =>
                        new indexerModels.TransactionSignatureMultisigSubsignature({
                            publicKey: b64ToBytes(s["public-key"]),
                            signature: b64ToBytes(s.signature),
                        })
                    ),
                }) : undefined,
                logicsig: t.signature.logicsig ? new indexerModels.TransactionSignatureLogicsig({
                    logic: b64ToBytes(t.signature.logicsig.logic) ?? new Uint8Array(),
                    args: t.signature.logicsig.args?.map(
                        (a: string) => b64ToBytes(a)!
                    ),
                }) : undefined,
            }) : undefined,

            logs: t.logs?.map((l: string) => b64ToBytes(l)!),
        });
    }

    get(): indexerModels.Transaction {
        return this.txn;
    }

    toJSON(): Record<string, unknown> {
        return encodingDataToPlain(this.txn.toEncodingData());
    }

    getId(): string {
        return this.txn.id;
    }

    getBlock(): number {
        return Number(this.txn.confirmedRound ?? 0);
    }

    getFee(): number {
        return Number(this.txn.fee);
    }

    getFrom(): string {
        return this.txn.sender;
    }

    getType(): string {
        return this.txn.txType;
    }

    getIsCreate(): boolean {
        return !!this.txn.applicationTransaction && (!this.txn.applicationTransaction.applicationId || this.txn.applicationTransaction.applicationId === 0n);
    }

    isAssetCreate(): boolean {
        return this.getType() === TXN_TYPES.ASSET_CONFIG && !!this.txn.createdAssetIndex;
    }

    getTypeDisplayValue(): string {
        const type = this.getType();
        if (type === TXN_TYPES.HEARTBEAT) {
            return "Heartbeat";
        }
        if (type === TXN_TYPES.PAYMENT) {
            return "Payment";
        }
        else if(type === TXN_TYPES.KEY_REGISTRATION) {
            return 'Key registration';
        }
        else if(type === TXN_TYPES.ASSET_CONFIG) {
            return this.isAssetCreate() ? 'Asset create' : 'Asset config';
        }
        else if(type === TXN_TYPES.ASSET_FREEZE) {
            return 'Asset freeze';
        }
        else if(type === TXN_TYPES.ASSET_TRANSFER) {
            return 'Transfer';
        }
        else if(type === TXN_TYPES.APP_CALL) {
            const appPayload = this.getAppCallPayload();
            const onCompletion = appPayload?.onCompletion;
            switch(onCompletion) {
                case "optin":	      return "App optin";
                case "closeout":	  return "App close out";
                case "clear":	      return "App clear";
                case "update":	    return "App update";
                case "delete":	    return this.getIsCreate() ? "OpUp" : "App delete";
                case "noop":
                default:
                    const appId = appPayload?.applicationId;
                    return appId ? 'App call' : 'App create';
            }
        }
        else if(type === TXN_TYPES.STATE_PROOF) {
            return 'State proof';
        }
    }

    getRekeyTo(): string {
        return this.txn.rekeyTo?.toString();
    }

    getTo(): string {
        const type = this.getType();

        if (type === TXN_TYPES.PAYMENT) {
            return this.txn.paymentTransaction?.receiver;
        }
        if(type === TXN_TYPES.ASSET_TRANSFER) {
            return this.txn.assetTransferTransaction?.receiver;
        }
    }

    getPaymentPayload(): indexerModels.TransactionPayment | undefined {
        return this.txn.paymentTransaction;
    }

    getKeyRegPayload(): indexerModels.TransactionKeyreg | undefined {
        return this.txn.keyregTransaction;
    }

    getHeartbeatPayload(): indexerModels.TransactionHeartbeat | undefined {
        return this.txn.heartbeatTransaction;
    }

    getAssetTransferPayload(): indexerModels.TransactionAssetTransfer | undefined {
        return this.txn.assetTransferTransaction;
    }

    getAssetConfigPayload(): indexerModels.TransactionAssetConfig | undefined {
        return this.txn.assetConfigTransaction;
    }

    getAssetFreezePayload(): indexerModels.TransactionAssetFreeze | undefined {
        return this.txn.assetFreezeTransaction;
    }

    getAppCallPayload(): indexerModels.TransactionApplication | undefined {
        return this.txn.applicationTransaction;
    }

    getStateProofPayload(): indexerModels.TransactionStateProof | undefined {
        return this.txn.stateProofTransaction;
    }

    getAppId(): number {
        const type = this.getType();

        if (type === TXN_TYPES.APP_CALL) {
            const appPayload = this.getAppCallPayload();
            let appId = appPayload?.applicationId;

            if (!appId) {
                appId = this.txn.createdApplicationIndex;
            }

            return Number(appId ?? 0);
        }
    }

    getAssetId(): number {
        const type = this.getType();

        if (type === TXN_TYPES.ASSET_TRANSFER) {
            return Number(this.getAssetTransferPayload()?.assetId ?? 0);
        }
        if (type === TXN_TYPES.ASSET_CONFIG) {
            if (this.txn.createdAssetIndex) {
                return Number(this.txn.createdAssetIndex);
            }
            return Number(this.getAssetConfigPayload()?.assetId ?? 0);
        }
        if (type === TXN_TYPES.ASSET_FREEZE) {
            return Number(this.getAssetFreezePayload()?.assetId ?? 0);
        }
    }

    getAssetFreezeAccount(): string {
        const type = this.getType();

        if (type === TXN_TYPES.ASSET_FREEZE) {
            return this.getAssetFreezePayload()?.address;
        }
    }

    getAssetFreezeStatus(): boolean {
        const type = this.getType();

        if (type === TXN_TYPES.ASSET_FREEZE) {
            return this.getAssetFreezePayload()?.newFreezeStatus;
        }
    }


    getAmount(): number {
        const type = this.getType();

        if (type === TXN_TYPES.PAYMENT) {
            return Number(this.getPaymentPayload()?.amount ?? 0);
        }
        if(type === TXN_TYPES.ASSET_TRANSFER) {
            return Number(this.getAssetTransferPayload()?.amount ?? 0);
        }
    }

    getTimestamp(): number {
        return this.txn.roundTime;
    }

    getTimestampDisplayValue(format: string = TIMESTAMP_DISPLAY_FORMAT): string {
        return dateFormat(new Date(this.getTimestamp() * 1000), format);
    }

    getTimestampDuration(): string {
        // @ts-ignore
        const diff = new Date() - new Date(this.getTimestamp() * 1000);
        const duration = humanizeDuration(diff, { largest: 2, round: true });
        return duration;
    }

    getSenderRewards(): number {
        return Number(this.txn.senderRewards ?? 0);
    }

    getReceiverRewards(): number {
        return Number(this.txn.receiverRewards ?? 0);
    }

    getNoteRaw(): Uint8Array | undefined {
        return this.txn.note;
    }

    private getNoteBase64(): string {
        return this.txn.note ? bytesToBase64(this.txn.note) : "";
    }

    getNoteJSON(): string {
        try {
            const noteB64 = this.getNoteBase64();
            if (!noteB64) return undefined;
            const text = atob(noteB64);
            const parsed = JSON.parse(text);
            return JSON.stringify(parsed, null, 4);
        } catch(e) {
        }
    }

    getNote(encoding: string = TEXT_ENCODING.BASE64): string {
        const noteB64 = this.getNoteBase64();
        if (!noteB64) return "";

        if (encoding === TEXT_ENCODING.JSON) {
            return this.getNoteJSON();
        }
        if(encoding === TEXT_ENCODING.BASE64) {
            return noteB64;
        }
        if(encoding === TEXT_ENCODING.TEXT) {
            return atob(noteB64);
        }
        if(encoding === TEXT_ENCODING.HEX) {
            return base64ToHex(noteB64);
        }
        if(encoding === TEXT_ENCODING.MSG_PACK) {
            try {
                return JSON.stringify(msgpack.decode(Buffer.from(noteB64, 'base64')));
            }
            catch (e) {
                return msgpack.decode(Buffer.from(noteB64, 'base64'));
            }
        }
    }

    getFirstRound(): number {
        return Number(this.txn.firstValid);
    }

    getLastRound(): number {
        return Number(this.txn.lastValid);
    }

    getGenesisId(): string {
        return this.txn.genesisId;
    }

    getGenesisHash(): string {
        return this.txn.genesisHash ? bytesToBase64(this.txn.genesisHash) : "";
    }

    getSig(): indexerModels.TransactionSignature | undefined {
        return this.txn.signature;
    }

    isMultiSig(): boolean {
        const sig = this.getSig();
        return sig?.multisig !== undefined;
    }

    getMultiSigSubSignatures(): [string, boolean][] {
        const addresses: [string, boolean][] = [];
        const sig = this.getSig();
        if (this.isMultiSig()) {
            const subSigs = sig.multisig.subsignature;
            subSigs?.forEach((subSig) => {
                const pk = subSig.publicKey;
                const signed = !!subSig.signature;
                addresses.push([encodeAddress(pk), signed]);
            });
        }
        return addresses;
    }

    isLogicSig(): boolean {
        const sig = this.getSig();
        return sig?.logicsig !== undefined;
    }

    getGroup(): string {
        return this.txn.group ? bytesToBase64(this.txn.group) : "";
    }

    hasLocalStateDelta(): boolean {
        return this.txn.localStateDelta && this.txn.localStateDelta.length > 0;
    }

    hasGlobalStateDelta(): boolean {
        return this.txn.globalStateDelta && this.txn.globalStateDelta.length > 0;
    }

    hasInnerTransactions(): boolean {
        return this.txn.innerTxns && this.txn.innerTxns.length > 0;
    }

    getInnerTransactions(): indexerModels.Transaction[] {
        return this.txn.innerTxns;
    }

    getInnerTransaction(index: number): indexerModels.Transaction {
        const txns = this.getInnerTransactions();
        return txns[index];
    }

    hasAppCallArguments(): boolean {
        const appCallPayload = this.getAppCallPayload();
        return appCallPayload && appCallPayload.applicationArgs && appCallPayload.applicationArgs.length > 0;
    }

    hasAppCallForeignAssets(): boolean {
        const appCallPayload = this.getAppCallPayload();
        return appCallPayload && appCallPayload.foreignAssets && appCallPayload.foreignAssets.length > 0;
    }

    hasAppCallForeignApps(): boolean {
        const appCallPayload = this.getAppCallPayload();
        return appCallPayload && appCallPayload.foreignApps && appCallPayload.foreignApps.length > 0;
    }

    hasAppCallForeignAccounts(): boolean {
        const appCallPayload = this.getAppCallPayload();
        return appCallPayload && appCallPayload.accounts && appCallPayload.accounts.length > 0;
    }

    hasLogs(): boolean {
        return this.txn.logs && this.txn.logs.length > 0;
    }

    getCloseTo(): string  {
        if (this.getType() === TXN_TYPES.ASSET_TRANSFER) {
            const payload = this.getAssetTransferPayload();
            return payload?.closeTo;
        }
        if (this.getType() === TXN_TYPES.PAYMENT) {
            const payload = this.getPaymentPayload();
            return payload?.closeRemainderTo;
        }
    }

    getCloseAmount(): number  {
        if (this.getType() === TXN_TYPES.ASSET_TRANSFER) {
            const payload = this.getAssetTransferPayload();
            return Number(payload?.closeAmount ?? 0);
        }
        if (this.getType() === TXN_TYPES.PAYMENT) {
            const payload = this.getPaymentPayload();
            return Number(payload?.closeAmount ?? 0);
        }
    }

    getLogs(): string[]{
        return this.txn.logs?.map(l => bytesToBase64(l));
    }

    getReturnValue(): string {
        const logs = this.getLogs();
        if (logs && logs.length > 0) {
            return logs[logs.length - 1];
        }
    }
}

function base64ToHex(str) {
  const raw = atob(str);
  let result = '';
  for (let i = 0; i < raw.length; i++) {
    const hex = raw.charCodeAt(i).toString(16);
    result += (hex.length === 2 ? hex : '0' + hex);
  }
  return result;
}
