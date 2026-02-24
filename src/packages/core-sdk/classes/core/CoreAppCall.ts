import {
    A_ABIMethodArgParams,
    A_SearchTransaction_App_Call_Payload
} from "../../types";
import {ABIContract, ABIContractParams, ABIMethodParams, ABIType, indexerModels, bytesToBase64} from "algosdk";
import algosdk from "algosdk";


export class CoreAppCall {
    payload: indexerModels.TransactionApplication;

    constructor(payload: indexerModels.TransactionApplication | A_SearchTransaction_App_Call_Payload) {
        if (payload instanceof indexerModels.TransactionApplication) {
            this.payload = payload;
        } else {
            this.payload = CoreAppCall.fromLegacy(payload);
        }
    }

    private static fromLegacy(p: A_SearchTransaction_App_Call_Payload): indexerModels.TransactionApplication {
        return new indexerModels.TransactionApplication({
            applicationId: BigInt(p["application-id"] ?? 0),
            accounts: p.accounts,
            applicationArgs: p["application-args"]?.map(
                (a: string) => new Uint8Array(Buffer.from(a, 'base64'))
            ),
            approvalProgram: p["approval-program"] ? new Uint8Array(Buffer.from(p["approval-program"], 'base64')) : undefined,
            clearStateProgram: p["clear-state-program"] ? new Uint8Array(Buffer.from(p["clear-state-program"], 'base64')) : undefined,
            foreignApps: p["foreign-apps"]?.map((n: number) => BigInt(n)),
            foreignAssets: p["foreign-assets"]?.map((n: number) => BigInt(n)),
            onCompletion: p["on-completion"],
            globalStateSchema: p["global-state-schema"] ? new indexerModels.StateSchema({
                numByteSlice: BigInt(p["global-state-schema"]["num-byte-slice"] ?? 0),
                numUint: BigInt(p["global-state-schema"]["num-uint"] ?? 0),
            }) : undefined,
            localStateSchema: p["local-state-schema"] ? new indexerModels.StateSchema({
                numByteSlice: BigInt(p["local-state-schema"]["num-byte-slice"] ?? 0),
                numUint: BigInt(p["local-state-schema"]["num-uint"] ?? 0),
            }) : undefined,
        });
    }

    getAppCallArguments(): string[] {
        return this.payload.applicationArgs?.map(a => bytesToBase64(a));
    }

    isCreate(): boolean {
        return !this.payload.applicationId || this.payload.applicationId === 0n;
    }

    getABIDecodedArgs(abi: ABIContractParams): {
        args: A_ABIMethodArgParams[],
        method: ABIMethodParams
    } {
        const decodedArgs: A_ABIMethodArgParams[] = [];
        const args = this.getAppCallArguments();
        let method;
        const result = {
            args: decodedArgs,
            method
        }

        if (!abi) {
            return result;
        }
        if (!args) {
            return result;
        }
        if (args.length === 0) {
            return result;
        }

        const txnMethodSelector = args[0];

        const abiInstance = new ABIContract(abi);
        const methods = abiInstance.methods;

        methods.forEach((methodInstance) => {

            const signature = methodInstance.getSelector();
            const methodSelector = Buffer.from(signature).toString("base64");

            if (methodSelector === txnMethodSelector) {
                const methodArgs = methodInstance.args;
                const txnArgs = args.slice(1, args.length);
                method = methodInstance.toJSON();

                methodArgs.forEach((methodArg, index) => {
                    const txnArg = txnArgs[index];

                    if (!txnArg) {
                        return;
                    }

                    const type = methodArg.type.toString();

                    const decodedArg: A_ABIMethodArgParams = {
                        ...methodArg,
                        type: type,
                        value: txnArg,
                        decodedValue: txnArg,
                        decoded: false
                    };

                    let typeToDecode;

                    if (algosdk.abiTypeIsTransaction(methodArg.type)) {
                        decodedArg.decodedValue = txnArg;
                        decodedArg.decoded = true;
                        decodedArgs.push(decodedArg);
                        return;
                    }

                    let encodedArg: any = new Uint8Array(Buffer.from(txnArg, 'base64'));

                    if (type.startsWith('uint')) {
                        encodedArg = algosdk.decodeUint64(encodedArg, "mixed");
                        decodedArg.decodedValue = encodedArg;
                        decodedArg.decoded = true;
                        decodedArgs.push(decodedArg);
                        return;
                    }

                    if (algosdk.abiTypeIsReference(methodArg.type)) {
                        switch (methodArg.type) {
                            case algosdk.ABIReferenceType.account:
                                typeToDecode = algosdk.ABIType.from('address');
                                break;
                            case algosdk.ABIReferenceType.application:
                            case algosdk.ABIReferenceType.asset:
                                typeToDecode = algosdk.ABIType.from('uint64');
                                encodedArg = algosdk.decodeUint64(encodedArg, "mixed");
                                decodedArg.decodedValue = encodedArg;
                                decodedArg.decoded = true;
                                decodedArgs.push(decodedArg);
                                return;
                        }
                    }
                    else {
                        typeToDecode = ABIType.from(type);
                    }

                    try {
                        decodedArg.decodedValue = typeToDecode.decode(encodedArg);
                        decodedArg.decoded = true;
                        if (type === 'bool') {
                            decodedArg.decodedValue = decodedArg.decodedValue.toString();
                        }
                    }
                    catch (e) {
                        decodedArg.decodedValue = txnArg;
                    }

                    decodedArgs.push(decodedArg);
                });


            }
        });

        result.args = decodedArgs;
        result.method = method;

        return result;

    }
}