import {
    A_Application, A_GlobalState, A_GlobalStateDecrypted
} from "../../types";
import {encodeAddress, getApplicationAddress, OnApplicationComplete} from "algosdk";
import isUtf8 from 'is-utf8';

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
    application: A_Application;
    boxes: A_ApplicationBoxNames;

    constructor(application: A_Application) {
        if (!application) {
            throw new Error("Invalid application");
        }
        this.application = application;
    }

    get(): A_Application {
        return this.application;
    }

    getBoxes(forceFetch = false): A_ApplicationBoxNames {
        if (!forceFetch && this.boxes) {
            return this.boxes;
        }
    }

    getId(): number {
        return this.application.id;
    }

    getCreator(): string {
        const creator = this.application.params.creator;

        // Handle null/undefined or already a string
        if (!creator || typeof creator === 'string') {
            return creator || '';
        }
        
        // If creator is an Address object, convert it to string
        // Type assertion needed because the type says string but runtime value might be Address
        const creatorObj = creator as any;
        if (creatorObj && typeof creatorObj === 'object') {
            if ('publicKey' in creatorObj && creatorObj.publicKey instanceof Uint8Array) {
                console.log('[CoreApplication.getCreator] Converting Address object to string');
                return encodeAddress(creatorObj.publicKey as Uint8Array);
            }
            // Use toString() method if available
            if (typeof creatorObj.toString === 'function') {
                console.log('[CoreApplication.getCreator] Using toString() method');
                return creatorObj.toString();
            }
            console.error('[CoreApplication.getCreator] WARNING: creator is an unknown object type!', creatorObj);
        }
        return '';
    }

    getApprovalProgram(): string {
        return this.application.params["approval-program"] || "";
    }

    getClearProgram(): string {
        return this.application.params["clear-state-program"] || "";
    }

    getGlobalSchemaByte(): number {
        return this.application.params["global-state-schema"]?.["num-byte-slice"] ?? 0;
    }

    getGlobalSchemaUint(): number {
        return this.application.params["global-state-schema"]?.["num-uint"] ?? 0;
    }

    getLocalSchemaByte(): number {
        return this.application.params["local-state-schema"]?.["num-byte-slice"] ?? 0;
    }

    getLocalSchemaUint(): number {
        return this.application.params["local-state-schema"]?.["num-uint"] ?? 0;
    }

    getGlobalStorage(): A_GlobalState[] {
        return this.application.params["global-state"];
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
        // In algosdk v3, getApplicationAddress returns an Address object, not a string
        if (addr && typeof addr === 'object') {
            if ('publicKey' in addr) {
                const result = encodeAddress(addr.publicKey as Uint8Array);
                return result;
            }
            // Use toString() method if available
            if (typeof (addr as any).toString === 'function') {
                const result = (addr as any).toString();
                return result;
            }
        }
        return addr as unknown as string;
    }
}
