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
        return this.application.params.creator;
    }

    getApprovalProgram(): string {
        return this.application.params["approval-program"];
    }

    getClearProgram(): string {
        return this.application.params["clear-state-program"];
    }

    getGlobalSchemaByte(): number {
        return this.application.params["global-state-schema"]["num-byte-slice"];
    }

    getGlobalSchemaUint(): number {
        return this.application.params["global-state-schema"]["num-uint"];
    }

    getLocalSchemaByte(): number {
        return this.application.params["local-state-schema"]["num-byte-slice"];
    }

    getLocalSchemaUint(): number {
        return this.application.params["local-state-schema"]["num-uint"];
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
                let key = preserveBase64 ? gStateProp.key : row.sortKey;

                if (preserveBase64) {
                    row.key = Buffer.isBuffer(key) ? key.toString("base64") : key;
                } else {
                    if (isUtf8(key)) {
                        row.key = key.toString();
                    }
                    else {
                        row.key = '0x' + key.toString('hex');
                    }
                }

                const {value} = gStateProp;

                if (value.type === 1) {
                    row.type = 'bytes';
                    const buf = Buffer.from(value.bytes, 'base64');

                    if (buf.length === 32) {
                        row.value = encodeAddress(new Uint8Array(buf));
                    }
                    else {
                        let val = Buffer.from(value.bytes, 'base64');
                        if (isUtf8(val)) {
                            row.value = val.toString();
                        }
                        else {
                            row.value = val.toString('base64');
                        }
                    }
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
        return getApplicationAddress(this.getId());
    }
}
