import {
    A_Application, A_GlobalState, A_GlobalStateDecrypted
} from "../../types";
import {
    encodeAddress,
    getApplicationAddress,
    OnApplicationComplete,
    indexerModels,
    bytesToBase64,
} from "algosdk";
import { isUtf8 } from "../../../../utils/isUtf8";
import { encodingDataToPlain } from "../../utils/serialize";

export function getOnCompleteKeys(): string[] {
    return Object.keys(OnApplicationComplete).filter(key => key.indexOf("OC") !== -1) as string[];
}

export function getOnCompleteOperations(): {name: string, value: string}[]{
    const onCompleteKeys = getOnCompleteKeys()

    const onCompleteOperations = [];

    onCompleteKeys.forEach((key) => {
        onCompleteOperations.push({
            name: key,
            value: OnApplicationComplete[key]
        });
    });

    return onCompleteOperations;
}

interface BoxName {
    name: string;
}

type A_ApplicationBoxNames = BoxName[];

export class CoreApplication {
    application: indexerModels.Application;
    boxes: A_ApplicationBoxNames;

    constructor(application: indexerModels.Application | A_Application) {
        if (!application) {
            throw new Error("Invalid application");
        }
        if (application instanceof indexerModels.Application) {
            this.application = application;
        } else {
            this.application = CoreApplication.fromLegacy(application);
        }
    }

    private static fromLegacy(a: A_Application): indexerModels.Application {
        const p = a.params;
        return new indexerModels.Application({
            id: BigInt(a.id ?? 0),
            params: new indexerModels.ApplicationParams({
                approvalProgram: p["approval-program"] ?? "",
                clearStateProgram: p["clear-state-program"] ?? "",
                creator: p.creator ?? "",
                extraProgramPages: p["extra-program-pages"],
                globalState: p["global-state"]?.map((gs) =>
                    new indexerModels.TealKeyValue({
                        key: gs.key,
                        value: new indexerModels.TealValue({
                            bytes: gs.value.bytes ?? "",
                            type: gs.value.type ?? 0,
                            uint: BigInt(gs.value.uint ?? 0),
                        }),
                    })
                ),
                globalStateSchema: p["global-state-schema"]
                    ? new indexerModels.ApplicationStateSchema({
                        numByteSlice: p["global-state-schema"]["num-byte-slice"] ?? 0,
                        numUint: p["global-state-schema"]["num-uint"] ?? 0,
                    })
                    : undefined,
                localStateSchema: p["local-state-schema"]
                    ? new indexerModels.ApplicationStateSchema({
                        numByteSlice: p["local-state-schema"]["num-byte-slice"] ?? 0,
                        numUint: p["local-state-schema"]["num-uint"] ?? 0,
                    })
                    : undefined,
            }),
        });
    }

    get(): indexerModels.Application {
        return this.application;
    }

    toJSON(): Record<string, unknown> {
        return encodingDataToPlain(this.application.toEncodingData());
    }

    getBoxes(forceFetch = false): A_ApplicationBoxNames {
        if (!forceFetch && this.boxes) {
            return this.boxes;
        }
    }

    getId(): number {
        return Number(this.application.id);
    }

    getCreator(): string {
        const creator = this.application.params.creator;
        if (!creator) return '';
        return creator.toString();
    }

    getApprovalProgram(): string {
        return bytesToBase64(this.application.params.approvalProgram);
    }

    getClearProgram(): string {
        return bytesToBase64(this.application.params.clearStateProgram);
    }

    getGlobalSchemaByte(): number {
        return this.application.params.globalStateSchema?.numByteSlice ?? 0;
    }

    getGlobalSchemaUint(): number {
        return this.application.params.globalStateSchema?.numUint ?? 0;
    }

    getLocalSchemaByte(): number {
        return this.application.params.localStateSchema?.numByteSlice ?? 0;
    }

    getLocalSchemaUint(): number {
        return this.application.params.localStateSchema?.numUint ?? 0;
    }

    getExtraProgramPages(): number {
        return this.application.params.extraProgramPages ?? 0;
    }

    getGlobalStorage(): A_GlobalState[] {
        const gs = this.application.params.globalState;
        if (!gs) return undefined;
        return gs.map((kv) => ({
            key: bytesToBase64(kv.key),
            value: {
                bytes: bytesToBase64(kv.value.bytes),
                type: kv.value.type,
                uint: Number(kv.value.uint),
            },
        }));
    }

    hasGlobalState(): boolean {
        return !!this.application.params.globalState?.length;
    }

    getGlobalStorageDecrypted(preserveBase64 = false): A_GlobalStateDecrypted[] {
        const gStateDecrypted: A_GlobalStateDecrypted[] = [];
        const gState = this.getGlobalStorage();

        if (gState) {
            gState.forEach((gStateProp) => {
                const row:A_GlobalStateDecrypted = {key: "", type: "", value: undefined};

                row.sortKey = Buffer.from(gStateProp.key, 'base64');
                row.key = gStateProp.key;

                const {value} = gStateProp;

                if (value.type === 1) {
                    row.type = 'bytes';
                    row.value = value.bytes
                }
                else {
                    row.type = 'uint';
                    row.value = value.uint;
                }

                gStateDecrypted.push(row);
            });
        }
        // @ts-ignore
        const sorted = gStateDecrypted.sort(({sortKey: a}, {sortKey: b}) => Buffer.compare(a, b));
        return sorted.map(({ sortKey, ...row }) => row);
    }

    getApplicationAddress(): string {
        const addr = getApplicationAddress(this.getId());
        if (addr && typeof addr === 'object') {
            if ('publicKey' in addr) {
                return encodeAddress(addr.publicKey as Uint8Array);
            }
            if (typeof (addr as any).toString === 'function') {
                return (addr as any).toString();
            }
        }
        return addr as unknown as string;
    }
}
