import { bytesToBase64, AccountData as LedgerAccountData } from "algosdk";
import { getLedgerDeltaAt, TimeTravelError } from "src/utils/timeTravel";
import { BaselineContext, DObject, ObjRef } from "src/utils/versionDelta";

/** One object round R changed, and how to read it at a round (see baselineRequest). */
export type DeltaObject = { key: string; ctx: BaselineContext; ref: ObjRef };

export type DeltaAccount = DeltaObject & {
  address: string;
  /** Its balance after the round. */
  microAlgos: bigint;
  /** The round it last proposed / sent a heartbeat in, after the round. */
  lastProposed: number;
  lastHeartbeat: number;
  /** Its base record after the round, as accountFields (see there); null once closed. */
  fields: DObject | null;
};
export type DeltaApp = DeltaObject & { appId: number; deleted: boolean; created: boolean };
export type DeltaLocal = DeltaObject & { address: string; appId: number; deleted: boolean };
export type DeltaAsset = DeltaObject & {
  assetId: number;
  deleted: boolean;
  created: boolean;
  /** Its decimals and unit, when the delta holds its params (created or reconfigured, not destroyed). */
  units?: { decimals: number; unit: string };
};
export type DeltaHolding = DeltaObject & {
  address: string;
  assetId: number;
  deleted: boolean;
  /** Its amount and frozen flag after the round; null once opted out. */
  amount: bigint | null;
  frozen: boolean | null;
};
export type DeltaBox = { key: string; appId: number; name: string; before: string | null; after: string | null };

/** Everything round R changed, as lists of objects to show and diff. */
export type BlockDelta = {
  accounts: DeltaAccount[];
  apps: DeltaApp[];
  locals: DeltaLocal[];
  assets: DeltaAsset[];
  holdings: DeltaHolding[];
  boxes: DeltaBox[];
};

const BOX_PREFIX = "bx:";
/** `ModifiedCreatable.creatableType`: 0 asset, 1 application. */
const APP = 1;

function boxKey(key: Uint8Array): { appId: number; name: string } | undefined {
  if (key.length < 11 || String.fromCharCode(key[0], key[1], key[2]) !== BOX_PREFIX) return undefined;
  const appId = new DataView(key.buffer, key.byteOffset + 3, 8).getBigUint64(0);
  return { appId: Number(appId), name: bytesToBase64(key.subarray(11)) };
}

const byKey = <T,>(f: (t: T) => number | string) => (a: T, b: T) => {
  const x = f(a);
  const y = f(b);
  return x < y ? -1 : x > y ? 1 : 0;
};

// As algod's JSON spells them.
const STATUS = ["Offline", "Online", "Not Participating"];
const ZERO_ADDRESS = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ";
const int = (v: unknown) => String(v ?? 0);

/**
 * An account's base record as fields both its delta and algod's account JSON
 * (`exclude=all`) hold, defaults filled in: algod leaves zeros and falses out,
 * and computes `min-balance`, which a delta doesn't hold. The balance is
 * without pending rewards, as a delta's is. Ints are strings, so a number
 * and a bigint of one value are equal. A closed account is null: algod reads
 * it back as zeros (keeping its old reward base), a delta as an empty record.
 */
export function accountFields(json: Record<string, any> | null): DObject | null {
  if (!json || !Number(json["amount-without-pending-rewards"] ?? json.amount ?? 0)) return null;
  const p = json.participation;
  return {
    amount: int(json["amount-without-pending-rewards"] ?? json.amount),
    status: json.status ?? "Offline",
    "reward-base": int(json["reward-base"]),
    "auth-addr": json["auth-addr"] ?? null,
    "incentive-eligible": !!json["incentive-eligible"],
    "last-proposed": int(json["last-proposed"]),
    "last-heartbeat": int(json["last-heartbeat"]),
    "total-apps-opted-in": int(json["total-apps-opted-in"]),
    "total-assets-opted-in": int(json["total-assets-opted-in"]),
    "total-created-apps": int(json["total-created-apps"]),
    "total-created-assets": int(json["total-created-assets"]),
    "total-boxes": int(json["total-boxes"]),
    "total-box-bytes": int(json["total-box-bytes"]),
    "apps-total-extra-pages": int(json["apps-total-extra-pages"]),
    "apps-total-schema": {
      "num-byte-slice": int(json["apps-total-schema"]?.["num-byte-slice"]),
      "num-uint": int(json["apps-total-schema"]?.["num-uint"]),
    },
    participation: p
      ? {
          "vote-participation-key": p["vote-participation-key"] ?? "",
          "selection-participation-key": p["selection-participation-key"] ?? "",
          "state-proof-key": p["state-proof-key"] ?? "",
          "vote-first-valid": int(p["vote-first-valid"]),
          "vote-last-valid": int(p["vote-last-valid"]),
          "vote-key-dilution": int(p["vote-key-dilution"]),
        }
      : null,
  };
}

/** accountFields of a delta's account record, its JSON built the way algod writes it. */
function deltaAccountFields(address: string, { accountBaseData: b, votingData: v }: LedgerAccountData): DObject | null {
  const auth = b.authAddr.toString();
  const hasKeys = v.voteID.some((x) => x !== 0);
  // An unset key is zeros in a delta; algod's JSON leaves it out.
  const keyText = (k: Uint8Array) => (k.some((x) => x !== 0) ? bytesToBase64(k) : undefined);
  return accountFields({
    address,
    "amount-without-pending-rewards": b.microAlgos,
    status: STATUS[b.status] ?? String(b.status),
    "reward-base": b.rewardsBase,
    "auth-addr": auth === ZERO_ADDRESS ? undefined : auth,
    "incentive-eligible": b.incentiveEligible,
    "last-proposed": b.lastProposed,
    "last-heartbeat": b.lastHeartbeat,
    "total-apps-opted-in": b.totalAppLocalStates,
    "total-assets-opted-in": b.totalAssets,
    "total-created-apps": b.totalAppParams,
    "total-created-assets": b.totalAssetParams,
    "total-boxes": b.totalBoxes,
    "total-box-bytes": b.totalBoxBytes,
    "apps-total-extra-pages": b.totalExtraAppPages,
    "apps-total-schema": { "num-byte-slice": b.totalAppSchema.numByteSlices, "num-uint": b.totalAppSchema.numUints },
    participation: hasKeys
      ? {
          "vote-participation-key": keyText(v.voteID),
          "selection-participation-key": keyText(v.selectionID),
          "state-proof-key": keyText(v.stateProofID),
          "vote-first-valid": v.voteFirstValid,
          "vote-last-valid": v.voteLastValid,
          "vote-key-dilution": v.voteKeyDilution,
        }
      : undefined,
  });
}

/**
 * What round R changed, from the time-travel node's ledger state delta. The
 * node rebuilds an old round's delta from its stored block: a 404 means it
 * doesn't store that block (only an archival node keeps them all).
 */
export async function getBlockDelta(round: number, signal?: AbortSignal): Promise<BlockDelta> {
  const delta = await getLedgerDeltaAt(round, signal);
  if (!delta) {
    throw new TimeTravelError(`The time-travel node doesn't store block ${round}, so it can't rebuild what the block changed`, 404);
  }

  const created = new Map<string, boolean>();
  for (const [id, c] of delta.creatables) created.set(`${c.creatableType === APP ? "app" : "asset"}:${id}`, c.created);

  const accounts: DeltaAccount[] = delta.accounts.accounts.map(({ addr, accountData }) => {
    const address = addr.toString();
    return {
      key: `base:${address}`,
      address,
      microAlgos: accountData.accountBaseData.microAlgos,
      lastProposed: Number(accountData.accountBaseData.lastProposed),
      lastHeartbeat: Number(accountData.accountBaseData.lastHeartbeat),
      fields: deltaAccountFields(address, accountData),
      ctx: { kind: "account", address, includeCreatedParams: false },
      ref: { kind: "base" },
    };
  });

  const apps: DeltaApp[] = [];
  const locals: DeltaLocal[] = [];
  for (const r of delta.accounts.appResources) {
    const address = r.address.toString();
    const appId = Number(r.id);
    if (r.params.params || r.params.deleted) {
      apps.push({
        key: `app:${appId}`,
        appId,
        deleted: r.params.deleted,
        created: created.get(`app:${appId}`) === true,
        ctx: { kind: "app", appId, includeBoxes: false },
        ref: { kind: "app" },
      });
    }
    if (r.state.localState || r.state.deleted) {
      locals.push({
        key: `local:${address}:${appId}`,
        address,
        appId,
        deleted: r.state.deleted,
        ctx: { kind: "account", address, includeCreatedParams: false },
        ref: { kind: "local", id: appId },
      });
    }
  }

  const assets: DeltaAsset[] = [];
  const holdings: DeltaHolding[] = [];
  for (const r of delta.accounts.assetResources) {
    const address = r.address.toString();
    const assetId = Number(r.id);
    if (r.params.params || r.params.deleted) {
      const p = r.params.params;
      assets.push({
        key: `asset:${assetId}`,
        assetId,
        deleted: r.params.deleted,
        created: created.get(`asset:${assetId}`) === true,
        units: p ? { decimals: Number(p.decimals), unit: p.unitName ? new TextDecoder().decode(p.unitName) : "" } : undefined,
        ctx: { kind: "asset", assetId },
        ref: { kind: "asset-params" },
      });
    }
    if (r.holding.holding || r.holding.deleted) {
      holdings.push({
        key: `holding:${address}:${assetId}`,
        address,
        assetId,
        deleted: r.holding.deleted,
        amount: r.holding.holding?.amount ?? null,
        frozen: r.holding.holding?.frozen ?? null,
        ctx: { kind: "account", address, includeCreatedParams: false },
        ref: { kind: "asset", id: assetId },
      });
    }
  }

  const boxes: DeltaBox[] = [];
  for (const [key, kv] of delta.kvMods) {
    const box = boxKey(key);
    if (!box) continue;
    boxes.push({
      key: `box:${box.appId}:${box.name}`,
      ...box,
      before: kv.oldData ? bytesToBase64(kv.oldData) : null,
      after: kv.data ? bytesToBase64(kv.data) : null,
    });
  }

  return {
    accounts: accounts.sort(byKey((a) => a.address)),
    apps: apps.sort(byKey((a) => a.appId)),
    locals: locals.sort(byKey((l) => `${l.appId}:${l.address}`)),
    assets: assets.sort(byKey((a) => a.assetId)),
    holdings: holdings.sort(byKey((h) => `${h.assetId}:${h.address}`)),
    boxes: boxes.sort(byKey((b) => `${b.appId}:${b.name}`)),
  };
}
