import {
  A_Block,
  A_SearchTransaction,
  A_SearchTransaction_App_Call_Payload,
  A_SearchTransaction_Asset_Freeze_Payload,
  A_SearchTransaction_Asset_Transfer_Payload,
  A_SearchTransaction_KeyReg_Payload,
  A_SearchTransaction_Heartbeat_Payload,
  A_SearchTransaction_Payment_Payload,
  A_SearchTransaction_Signature,
  A_SearchTransaction_State_Proof_Payload,
  A_GlobalStateDelta,
  A_LocalStateDelta,
  A_Asset,
  A_AccountInformation,
  A_SearchAccount,
  A_Application,
  A_Status,
  A_VersionsCheck,
  A_Genesis,
  A_Health,
} from "../types";
import { Buffer } from "buffer";
import { encodeAddress } from "algosdk";

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  return 0;
}

function toString(v: unknown): string {
  if (typeof v === "string") return v;
  if (v instanceof Uint8Array) return Buffer.from(v).toString("base64");
  if (isObject(v) && "publicKey" in v && v.publicKey instanceof Uint8Array) {
    // Handle Address type from algosdk v3
    return encodeAddress(v.publicKey as Uint8Array);
  }
  // Handle Address objects with toString method
  if (v && typeof v === "object" && typeof (v as any).toString === "function" && "publicKey" in v) {
    return (v as any).toString();
  }
  return "";
}

function getNumber(obj: JsonObject, keys: string[], fallback = 0): number {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number") return v;
    if (typeof v === "bigint") return Number(v);
  }
  return fallback;
}

function getString(obj: JsonObject, keys: string[], fallback = ""): string {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string") return v;
    if (v instanceof Uint8Array) return Buffer.from(v).toString("base64");
    if (isObject(v) && "publicKey" in v && v.publicKey instanceof Uint8Array) {
      return encodeAddress(v.publicKey as Uint8Array);
    }
    // Handle Address objects with toString method
    if (v && typeof v === "object" && typeof (v as any).toString === "function" && "publicKey" in v) {
      return (v as any).toString();
    }
  }
  return fallback;
}

function getBoolean(obj: JsonObject, keys: string[], fallback = false): boolean {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "boolean") return v;
  }
  return fallback;
}

function getArray(obj: JsonObject, keys: string[]): unknown[] {
  for (const k of keys) {
    const v = obj[k];
    if (Array.isArray(v)) return v;
  }
  return [];
}

function serializeValue(v: unknown): unknown {
  if (typeof v === "bigint") return Number(v);
  if (v instanceof Uint8Array) return Buffer.from(v).toString("base64");
  if (isObject(v)) {
    if ("publicKey" in v && v.publicKey instanceof Uint8Array) {
      return encodeAddress(v.publicKey as Uint8Array);
    }
    // Handle Address objects with toString method
    if (typeof (v as any).toString === "function" && "publicKey" in v) {
      return (v as any).toString();
    }
    const result: JsonObject = {};
    for (const key in v) {
      result[key] = serializeValue(v[key]);
    }
    return result;
  }
  if (Array.isArray(v)) {
    return v.map(serializeValue);
  }
  return v;
}

function convertPayment(obj: unknown): A_SearchTransaction_Payment_Payload | undefined {
  if (!isObject(obj)) return undefined;
  return {
    amount: getNumber(obj, ["amount"]),
    "close-amount": getNumber(obj, ["close-amount", "closeAmount"]),
    receiver: getString(obj, ["receiver"]),
    "close-remainder-to": getString(obj, ["close-remainder-to", "closeRemainderTo"]),
  };
}

function convertAssetTransfer(
  obj: unknown
): A_SearchTransaction_Asset_Transfer_Payload | undefined {
  if (!isObject(obj)) return undefined;
  return {
    amount: getNumber(obj, ["amount"]),
    "asset-id": getNumber(obj, ["asset-id", "assetId"]),
    "close-amount": getNumber(obj, ["close-amount", "closeAmount"]),
    receiver: getString(obj, ["receiver"]),
    "close-to": getString(obj, ["close-to", "closeTo"]),
  };
}

function convertAssetFreeze(
  obj: unknown
): A_SearchTransaction_Asset_Freeze_Payload | undefined {
  if (!isObject(obj)) return undefined;
  return {
    address: getString(obj, ["address"]),
    "asset-id": getNumber(obj, ["asset-id", "assetId"]),
    "new-freeze-status": getBoolean(obj, ["new-freeze-status", "newFreezeStatus"]),
  };
}

function convertAppCall(obj: unknown): A_SearchTransaction_App_Call_Payload | undefined {
  if (!isObject(obj)) return undefined;
  
  const accounts = getArray(obj, ["accounts"]).map(v => toString(v));
  const applicationArgs = getArray(obj, ["application-args", "applicationArgs"]).map(v => toString(v));
  const foreignApps = getArray(obj, ["foreign-apps", "foreignApps"]).map(v => toNumber(v));
  const foreignAssets = getArray(obj, ["foreign-assets", "foreignAssets"]).map(v => toNumber(v));
  
  return {
    accounts,
    "application-args": applicationArgs,
    "application-id": getNumber(obj, ["application-id", "applicationId"]),
    "approval-program": getString(obj, ["approval-program", "approvalProgram"]),
    "clear-state-program": getString(obj, ["clear-state-program", "clearStateProgram"]),
    "foreign-apps": foreignApps,
    "foreign-assets": foreignAssets,
    "global-state-schema": (isObject(obj["global-state-schema"]) || isObject(obj["globalStateSchema"]))
      ? serializeValue(obj["global-state-schema"] ?? obj["globalStateSchema"]) as A_SearchTransaction_App_Call_Payload["global-state-schema"]
      : { "num-byte-slice": 0, "num-uint": 0 },
    "local-state-schema": (isObject(obj["local-state-schema"]) || isObject(obj["localStateSchema"]))
      ? serializeValue(obj["local-state-schema"] ?? obj["localStateSchema"]) as A_SearchTransaction_App_Call_Payload["local-state-schema"]
      : { "num-byte-slice": 0, "num-uint": 0 },
    "on-completion": getString(obj, ["on-completion", "onCompletion"]),
  };
}

function convertKeyReg(obj: unknown): A_SearchTransaction_KeyReg_Payload | undefined {
  if (!isObject(obj)) return undefined;
  return {
    "non-participation": getBoolean(obj, ["non-participation", "nonParticipation"]),
    "selection-participation-key": getString(obj, ["selection-participation-key", "selectionParticipationKey"]),
    "vote-first-valid": getNumber(obj, ["vote-first-valid", "voteFirstValid"]),
    "vote-key-dilution": getNumber(obj, ["vote-key-dilution", "voteKeyDilution"]),
    "vote-last-valid": getNumber(obj, ["vote-last-valid", "voteLastValid"]),
    "vote-participation-key": getString(obj, ["vote-participation-key", "voteParticipationKey"]),
  };
}

function convertHeartbeat(obj: unknown): A_SearchTransaction_Heartbeat_Payload | undefined {
  if (!isObject(obj)) return undefined;
  
  const proofRaw = obj["hb-proof"] ?? obj["hbProof"];
  let hbProof: A_SearchTransaction_Heartbeat_Payload["hb-proof"];
  
  if (isObject(proofRaw)) {
    // Serialize the proof object to convert Uint8Arrays to base64 strings
    const serializedProof = serializeValue(proofRaw) as any;
    hbProof = {
      "hb-pk": getString(serializedProof, ["hb-pk", "hbPk"]),
      "hb-pk1sig": getString(serializedProof, ["hb-pk1sig", "hbPk1sig"]),
      "hb-pk2": getString(serializedProof, ["hb-pk2", "hbPk2"]),
      "hb-pk2sig": getString(serializedProof, ["hb-pk2sig", "hbPk2sig"]),
      "hb-sig": getString(serializedProof, ["hb-sig", "hbSig"]),
    };
  } else {
    hbProof = {
      "hb-pk": "",
      "hb-pk1sig": "",
      "hb-pk2": "",
      "hb-pk2sig": "",
      "hb-sig": "",
    };
  }
  
  return {
    "hb-address": getString(obj, ["hb-address", "hbAddress"]),
    "hb-key-dilution": getNumber(obj, ["hb-key-dilution", "hbKeyDilution"]),
    "hb-proof": hbProof,
    "hb-seed": getString(obj, ["hb-seed", "hbSeed"]),
    "hb-vote-id": getString(obj, ["hb-vote-id", "hbVoteId"]),
  };
}

function convertSignature(obj: unknown): A_SearchTransaction_Signature {
  if (!isObject(obj)) return {} as A_SearchTransaction_Signature;
  const multisig = obj["multisig"];
  const logicsig = obj["logicsig"];
  return {
    multisig: isObject(multisig)
      ? {
          version: getNumber(multisig, ["version"]),
          threshold: getNumber(multisig, ["threshold"]),
          subsignature: (getArray(multisig, ["subsignature"]) as JsonObject[]).map((s) => ({
            "public-key": getString(s, ["public-key", "publicKey"]),
            signature: getString(s, ["signature"]),
          })),
        }
      : undefined,
    logicsig: isObject(logicsig)
      ? {
          logic: getString(logicsig, ["logic"]),
        }
      : undefined,
  };
}

function convertStateDelta(obj: unknown): A_GlobalStateDelta[] | undefined {
  if (!Array.isArray(obj)) return undefined;
  return obj
    .filter(isObject)
    .map((x): A_GlobalStateDelta => ({
      key: getString(x, ["key"]),
      value: {
        bytes: getString(x["value"] as JsonObject, ["bytes"]),
        action: getNumber(x["value"] as JsonObject, ["action"]),
        uint: getNumber(x["value"] as JsonObject, ["uint"]),
      },
    }));
}

function convertLocalStateDelta(obj: unknown): A_LocalStateDelta[] | undefined {
  if (!Array.isArray(obj)) return undefined;
  return obj
    .filter(isObject)
    .map((x): A_LocalStateDelta => ({
      address: getString(x, ["address"]),
      delta: Array.isArray((x as JsonObject)["delta"])
        ? ((x as JsonObject)["delta"] as JsonObject[]).map((d) => ({
            key: getString(d, ["key"]),
            value: {
              bytes: getString(d["value"] as JsonObject, ["bytes"]),
              action: getNumber(d["value"] as JsonObject, ["action"]),
              uint: getNumber(d["value"] as JsonObject, ["uint"]),
            },
          }))
        : [],
    }));
}

function convertAssetConfig(obj: unknown): A_Asset | undefined {
  if (!isObject(obj)) return undefined;
  const index = getNumber(obj, ["asset-id", "index", "assetId"]);
  const paramsRaw = (obj["params"] as unknown);
  const params = isObject(paramsRaw) ? serializeValue(paramsRaw) as A_Asset["params"] : undefined;
  return typeof index === "number" && params ? ({ index, params } as A_Asset) : undefined;
}

function convertStateProof(obj: unknown): A_SearchTransaction_State_Proof_Payload | undefined {
  if (!isObject(obj)) return undefined;
  // Serialize the entire state proof object to convert Uint8Arrays and bigints
  return serializeValue(obj) as A_SearchTransaction_State_Proof_Payload;
}

export function toA_SearchTransaction(input: unknown): A_SearchTransaction {
  const o = isObject(input) ? input : {};

  const innerRaw = getArray(o, ["inner-txns", "innerTxns"]).map(toA_SearchTransaction);

  const txn: A_SearchTransaction = {
    "close-rewards": getNumber(o, ["close-rewards", "closeRewards"]),
    "closing-amount": getNumber(o, ["closing-amount", "closingAmount"]),
    "confirmed-round": getNumber(o, ["confirmed-round", "confirmedRound"]),
    fee: getNumber(o, ["fee"]),
    "first-valid": getNumber(o, ["first-valid", "firstValid"]),
    "intra-round-offset": getNumber(o, ["intra-round-offset", "intraRoundOffset"]),
    "last-valid": getNumber(o, ["last-valid", "lastValid"]),
    "receiver-rewards": getNumber(o, ["receiver-rewards", "receiverRewards"]),
    "round-time": getNumber(o, ["round-time", "roundTime"]),
    sender: getString(o, ["sender"]),
    "sender-rewards": getNumber(o, ["sender-rewards", "senderRewards"]),
    "tx-type": getString(o, ["tx-type", "txType", "type"]),
    note: getString(o, ["note"]),
    "genesis-hash": getString(o, ["genesis-hash", "genesisHash"]),
    "genesis-id": getString(o, ["genesis-id", "genesisId"]),
    id: getString(o, ["id"]),
    group: getString(o, ["group"]),
    "rekey-to": getString(o, ["rekey-to", "rekeyTo"]),
    "inner-txns": innerRaw,

    "created-application-index": getNumber(o, ["created-application-index", "createdApplicationIndex"]),
    "created-asset-index": getNumber(o, ["created-asset-index", "createdAssetIndex"]),

    "application-transaction": convertAppCall(o["application-transaction"] ?? o["applicationTransaction"]) ,
    "asset-transfer-transaction": convertAssetTransfer(o["asset-transfer-transaction"] ?? o["assetTransferTransaction"]) ,
    "asset-freeze-transaction": convertAssetFreeze(o["asset-freeze-transaction"] ?? o["assetFreezeTransaction"]) ,
    "payment-transaction": convertPayment(o["payment-transaction"] ?? o["paymentTransaction"]) ,
    "asset-config-transaction": convertAssetConfig(o["asset-config-transaction"] ?? o["assetConfigTransaction"]) ,
    "keyreg-transaction": convertKeyReg(o["keyreg-transaction"] ?? o["keyregTransaction"]) ,
    "heartbeat-transaction": convertHeartbeat(o["heartbeat-transaction"] ?? o["heartbeatTransaction"]) ,
    "state-proof-transaction": convertStateProof(o["state-proof-transaction"] ?? o["stateProofTransaction"]) ,

    "global-state-delta": convertStateDelta(o["global-state-delta"] ?? o["globalStateDelta"]) ,
    "local-state-delta": convertLocalStateDelta(o["local-state-delta"] ?? o["localStateDelta"]) ,

    signature: convertSignature(o["signature"]),
    logs: getArray(o, ["logs"]).map(v => toString(v)),
  };

  return txn;
}

export function toA_Block(input: unknown): A_Block {
  const o = isObject(input) ? input : {};
  const transactions = (getArray(o, ["transactions", "txns"]) as unknown[]).map(toA_SearchTransaction);
  const block: A_Block = {
    round: getNumber(o, ["round"]),
    timestamp: getNumber(o, ["timestamp", "time"], 0),
    "txn-counter": getNumber(o, ["txn-counter", "txnCounter", "transactionsCount"], transactions.length),
    transactions,
    proposer: getString(o, ["proposer"]),
  };
  return block;
}

export function toA_AccountInformation(input: unknown): A_AccountInformation {
  const o = isObject(input) ? input : {};
  
  // Serialize apps-local-state
  const appsLocalStateRaw = getArray(o, ["apps-local-state", "appsLocalState"]);
  const appsLocalState = appsLocalStateRaw.map((app): any => {
    if (!isObject(app)) return app;
    const schemaRaw = isObject(app.schema) ? app.schema : {};
    return {
      id: toNumber(app.id),
      "key-value": Array.isArray(app["key-value"]) || Array.isArray(app.keyValue) 
        ? serializeValue(app["key-value"] ?? app.keyValue)
        : [],
      schema: {
        "num-byte-slice": getNumber(schemaRaw, ["num-byte-slice", "numByteSlice"], 0),
        "num-uint": getNumber(schemaRaw, ["num-uint", "numUint"], 0),
      }
    };
  });
  
  // Serialize created-apps
  const createdAppsRaw = getArray(o, ["created-apps", "createdApps"]);
  const createdApps = createdAppsRaw.map(app => toA_Application(app));
  
  // Serialize created-assets
  const createdAssetsRaw = getArray(o, ["created-assets", "createdAssets"]);
  const createdAssets = createdAssetsRaw.map(asset => toA_Asset(asset));
  
  // Serialize assets
  const assetsRaw = getArray(o, ["assets"]);
  const assets = assetsRaw.map((asset): any => {
    if (!isObject(asset)) return asset;
    return serializeValue(asset);
  });
  
  const appsTotalSchemaRaw = (isObject(o["apps-total-schema"]) ? o["apps-total-schema"] : o["appsTotalSchema"]);
  const appsTotalSchema = isObject(appsTotalSchemaRaw) ? {
    "num-byte-slice": getNumber(appsTotalSchemaRaw, ["num-byte-slice", "numByteSlice"], 0),
    "num-uint": getNumber(appsTotalSchemaRaw, ["num-uint", "numUint"], 0),
  } : { "num-byte-slice": 0, "num-uint": 0 };

  return {
    address: getString(o, ["address"]),
    "auth-addr": getString(o, ["auth-addr", "authAddr"]),
    amount: getNumber(o, ["amount"]),
    "min-balance": getNumber(o, ["min-balance", "minBalance"]),
    "amount-without-pending-rewards": getNumber(o, ["amount-without-pending-rewards", "amountWithoutPendingRewards"]),
    "apps-local-state": appsLocalState,
    "apps-total-schema": appsTotalSchema,
    assets: assets,
    "created-apps": createdApps,
    "created-assets": createdAssets,
    "pending-rewards": getNumber(o, ["pending-rewards", "pendingRewards"]),
    "reward-base": getNumber(o, ["reward-base", "rewardBase"]),
    rewards: getNumber(o, ["rewards"]),
    round: getNumber(o, ["round"]),
    status: getString(o, ["status"]),
  };
}

export function toA_AccountsResponse(input: unknown): { 'next-token': string; accounts: A_SearchAccount[] } {
  const o = isObject(input) ? input : {};
  const accountsRaw = (getArray(o, ["accounts"]) as JsonObject[]);
  const accounts: A_SearchAccount[] = accountsRaw.map((a): A_SearchAccount => ({
    address: getString(a, ["address"]),
    amount: getNumber(a, ["amount"]),
    status: getString(a, ["status"]),
    "total-apps-opted-in": getNumber(a, ["total-apps-opted-in", "totalAppsOptedIn"]),
    "total-assets-opted-in": getNumber(a, ["total-assets-opted-in", "totalAssetsOptedIn"]),
    "total-created-apps": getNumber(a, ["total-created-apps", "totalCreatedApps"]),
    "total-created-assets": getNumber(a, ["total-created-assets", "totalCreatedAssets"]),
  }));
  return {
    'next-token': getString(o as JsonObject, ["next-token", "nextToken"]),
    accounts,
  };
}

export function toA_Application(input: unknown): A_Application {
  const o = isObject(input) ? input : {};
  const idRaw = (o["id"] as unknown);
  const id = typeof idRaw === 'bigint' ? Number(idRaw) : (typeof idRaw === 'number' ? idRaw : 0);
  const paramsRaw = (o["params"] as unknown);
  
  console.log('[toA_Application] Raw input:', JSON.stringify(input, (key, value) => 
    typeof value === 'bigint' ? value.toString() + 'n' :
    value instanceof Uint8Array ? `Uint8Array(${value.length})` :
    value && typeof value === 'object' && 'publicKey' in value ? `Address{publicKey: Uint8Array(${value.publicKey?.length})}` :
    value
  , 2));
  
  if (!isObject(paramsRaw)) {
    return {
      id,
      params: {
        "approval-program": "",
        "clear-state-program": "",
        creator: "",
        "global-state-schema": { "num-byte-slice": 0, "num-uint": 0 },
        "local-state-schema": { "num-byte-slice": 0, "num-uint": 0 },
      }
    };
  }
  
  const serializedParams = serializeValue(paramsRaw) as any;
  
  // Helper to convert schema objects
  const convertSchema = (schemaObj: any) => {
    if (!schemaObj) return { "num-byte-slice": 0, "num-uint": 0 };
    return {
      "num-byte-slice": getNumber(schemaObj, ["num-byte-slice", "numByteSlice"], 0),
      "num-uint": getNumber(schemaObj, ["num-uint", "numUint"], 0),
    };
  };
  
  // Build the params object with proper field name mapping
  const params = {
    "approval-program": getString(serializedParams, ["approval-program", "approvalProgram"], ""),
    "clear-state-program": getString(serializedParams, ["clear-state-program", "clearStateProgram"], ""),
    "creator": getString(serializedParams, ["creator"], ""),
    "global-state": serializedParams["global-state"] ?? serializedParams["globalState"],
    "global-state-schema": convertSchema(serializedParams["global-state-schema"] ?? serializedParams["globalStateSchema"]),
    "local-state-schema": convertSchema(serializedParams["local-state-schema"] ?? serializedParams["localStateSchema"]),
  };
  
  return { id, params };
}

export function toA_ApplicationsResponse(input: unknown): { 'next-token': string; applications: A_Application[] } {
  const o = isObject(input) ? input : {};
  const appsRaw = getArray(o, ["applications"]).map(toA_Application);
  return {
    'next-token': getString(o, ["next-token", "nextToken"]),
    applications: appsRaw,
  };
}

export function toA_Asset(input: unknown): A_Asset {
  const o = isObject(input) ? input : {};
  const indexRaw = o["index"] ?? o["asset-id"] ?? o["assetId"];
  const index = typeof indexRaw === 'bigint' ? Number(indexRaw) : (typeof indexRaw === 'number' ? indexRaw : 0);
  const paramsRaw = o["params"] as unknown;
  
  if (!isObject(paramsRaw)) {
    return { index, params: {} as A_Asset["params"] };
  }
  
  const serializedParams = serializeValue(paramsRaw) as any;
  
  // Build the params object with proper field name mapping
  const params = {
    clawback: getString(serializedParams, ["clawback"]),
    creator: getString(serializedParams, ["creator"], ""),
    decimals: getNumber(serializedParams, ["decimals"], 0),
    "default-frozen": getBoolean(serializedParams, ["default-frozen", "defaultFrozen"], false),
    freeze: getString(serializedParams, ["freeze"]),
    manager: getString(serializedParams, ["manager"]),
    name: getString(serializedParams, ["name"], ""),
    "name-b64": getString(serializedParams, ["name-b64", "nameB64"], ""),
    reserve: getString(serializedParams, ["reserve"]),
    total: getNumber(serializedParams, ["total"], 0),
    "unit-name": getString(serializedParams, ["unit-name", "unitName"], ""),
    "unit-name-b64": getString(serializedParams, ["unit-name-b64", "unitNameB64"], ""),
    url: getString(serializedParams, ["url"]),
    "url-b64": getString(serializedParams, ["url-b64", "urlB64"]),
    "metadata-hash": getString(serializedParams, ["metadata-hash", "metadataHash"]),
  };
  
  return { index, params };
}

export function toA_AssetsResponse(input: unknown): { 'next-token': string; assets: A_Asset[] } {
  const o = isObject(input) ? input : {};
  const assets = getArray(o, ["assets"]).map(toA_Asset);
  return { 'next-token': getString(o, ["next-token", "nextToken"]), assets };
}

export function toA_Status(input: unknown): A_Status {
  const o = isObject(input) ? input : {};
  return {
    "catchpoint": getString(o, ["catchpoint"], ""),
    "catchpoint-acquired-blocks": getNumber(o, ["catchpoint-acquired-blocks", "catchpointAcquiredBlocks"], 0),
    "catchpoint-processed-accounts": getNumber(o, ["catchpoint-processed-accounts", "catchpointProcessedAccounts"], 0),
    "catchpoint-total-accounts": getNumber(o, ["catchpoint-total-accounts", "catchpointTotalAccounts"], 0),
    "catchpoint-total-blocks": getNumber(o, ["catchpoint-total-blocks", "catchpointTotalBlocks"], 0),
    "catchpoint-verified-accounts": getNumber(o, ["catchpoint-verified-accounts", "catchpointVerifiedAccounts"], 0),
    "catchup-time": getNumber(o, ["catchup-time", "catchupTime"], 0),
    "last-catchpoint": getString(o, ["last-catchpoint", "lastCatchpoint"], ""),
    "last-round": getNumber(o, ["last-round", "lastRound"], 0),
    "last-version": getString(o, ["last-version", "lastVersion"], ""),
    "next-version": getString(o, ["next-version", "nextVersion"], ""),
    "next-version-round": getNumber(o, ["next-version-round", "nextVersionRound"], 0),
    "next-version-supported": ((): boolean => {
      const v = o["next-version-supported"] ?? o["nextVersionSupported"];
      return typeof v === 'boolean' ? v : false;
    })(),
    "stopped-at-unsupported-round": ((): boolean => {
      const v = o["stopped-at-unsupported-round"] ?? o["stoppedAtUnsupportedRound"];
      return typeof v === 'boolean' ? v : false;
    })(),
    "time-since-last-round": getNumber(o, ["time-since-last-round", "timeSinceLastRound"], 0),
  };
}

export function toA_VersionsCheck(input: unknown): A_VersionsCheck {
  const o = isObject(input) ? input : {};
  const buildRaw = o["build"];
  const build = isObject(buildRaw) ? {
    major: getNumber(buildRaw, ["major"], 0),
    minor: getNumber(buildRaw, ["minor"], 0),
    build_number: getNumber(buildRaw, ["build_number", "buildNumber"], 0),
    commit_hash: getString(buildRaw, ["commit_hash", "commitHash"], ""),
    branch: getString(buildRaw, ["branch"], ""),
    channel: getString(buildRaw, ["channel"], ""),
  } : undefined;
  return {
    versions: Array.isArray(o["versions"]) ? (o["versions"] as string[]) : undefined,
    genesis_id: getString(o, ["genesis_id", "genesisId"], ""),
    genesis_hash_b64: getString(o, ["genesis_hash_b64", "genesisHashB64"], ""),
    build,
  };
}

export function toA_Genesis(input: unknown): A_Genesis {
  if (typeof input === 'string') {
    try { return JSON.parse(input) as A_Genesis; } catch { /* fallthrough */ }
  }
  const o = isObject(input) ? input : {};
  return {
    fees: getString(o, ["fees"], ""),
    proto: getString(o, ["proto"], ""),
    rwd: getString(o, ["rwd"], ""),
    timestamp: getNumber(o, ["timestamp"], 0),
  };
}

export function toA_Health(input: unknown): A_Health {
  const o = isObject(input) ? input : {};
  return {
    "db-available": ((): boolean => {
      const v = o["db-available"] ?? o["dbAvailable"];
      return typeof v === 'boolean' ? v : true;
    })(),
    errors: (getArray(o, ["errors"]) as string[]),
    "is-migrating": ((): boolean => {
      const v = o["is-migrating"] ?? o["isMigrating"];
      return typeof v === 'boolean' ? v : false;
    })(),
    message: getString(o, ["message"], ""),
    round: getNumber(o, ["round"], 0),
    version: getString(o, ["version"], ""),
  };
}
