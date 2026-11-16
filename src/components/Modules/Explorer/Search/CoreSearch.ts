import { isValidAddress } from "algosdk";
import type { QueryClient } from "@tanstack/react-query";
import type { NfdGhostSDK, NfdRecord, NfdState } from "nfd-ghost-sdk";
import {
  A_ApplicationResult,
  A_AssetResult,
  A_AssetTiny,
  A_BlockResult,
} from "../../../../packages/core-sdk/types";
import { Network } from "../../../../packages/core-sdk/network";
import explorer from "../../../../utils/dappflow";
import { AssetClient } from "../../../../packages/core-sdk/clients/assetClient";
import { ApplicationClient } from "../../../../packages/core-sdk/clients/applicationClient";
import { BlockClient } from "../../../../packages/core-sdk/clients/blockClient";
import AssetCache from "../../../Common/AssetCache";

function getLink(result: A_AssetResult | A_ApplicationResult | A_BlockResult) {
  const { type } = result;
  if (type === "block") {
    return `/block/${result.round}`;
  } else if (type === "asset") {
    return `/asset/${result.index}/transactions`;
  } else {
    return `/application/${result.id}`;
  }
}

export class NotFoundError extends Error {}
export class ServerError extends Error {}
export class NotSearchableError extends Error {}
/** More than one thing fits the search: the results page lists them. */
export class AmbiguousError extends NotFoundError {}

/** The search, as it should be written in a `/search?q=` link. */
export function searchResultsHref(target: string): string {
  return `/search?q=${encodeURIComponent(normalizeTarget(target))}`;
}

/**
 * The address prefix a search could be, uppercased, or undefined: 4 to 58
 * base32 characters (a whole address at most), in any case.
 */
export function addressPrefix(target: string): string | undefined {
  const prefix = target.trim().toUpperCase();
  return /^[A-Z2-7]{4,58}$/.test(prefix) ? prefix : undefined;
}

/** The id a search is, if it is all digits and a number JavaScript holds exactly. */
export function searchableId(target: string): number | undefined {
  if (!/^\d+$/.test(target)) return undefined;
  const id = Number(target);
  return Number.isSafeInteger(id) ? id : undefined;
}

export type IdHits = {
  asset: A_AssetResult | null;
  app: A_ApplicationResult | null;
  block: A_BlockResult | null;
  /** The lookups that failed, other than by not finding it: their hit is unknown */
  errors: { asset?: Error; app?: Error; block?: Error };
};

/** What a search for an id may have missed: the lookups that failed. */
export function idUnknowns({ asset, app, block, errors }: IdHits): {
  /** The asset or app lookup failed, and the other found nothing */
  assetOrApp?: Error;
  /** The block lookup failed */
  block?: Error;
} {
  return {
    assetOrApp: asset || app ? undefined : errors.asset ?? errors.app,
    block: block ? undefined : errors.block,
  };
}

/**
 * The asset, app and block with this number on `network`. Assets and apps
 * share one id counter (from 1), so at most one of those two is set. Each
 * lookup stands alone: one that fails is null, with its error in `errors`.
 */
export async function searchId(network: Network, id: number, signal?: AbortSignal): Promise<IdHits> {
  const none = Promise.resolve(null);
  const [asset, app, block] = await Promise.allSettled([
    id ? new AssetClient(network).search(id, signal) : none,
    id ? new ApplicationClient(network).search(id, signal) : none,
    new BlockClient(network).search(id, signal),
  ]);
  const errors: IdHits["errors"] = {};
  const value = <T,>(kind: keyof IdHits["errors"], result: PromiseSettledResult<T | null>): T | null => {
    if (result.status === "fulfilled") return result.value;
    errors[kind] = result.reason as Error;
    return null;
  };
  return {
    asset: value("asset", asset),
    app: value("app", app),
    block: value("block", block),
    errors,
  };
}

/**
 * The lookups of `id` on this network, as a query: the search bar and the
 * results page share it, so a search that lands on the page doesn't look
 * again. Kept briefly (a block may be about to exist), and a result with a
 * failed lookup not at all.
 */
export function idHitsQuery(id: number) {
  return {
    queryKey: ["search", "id", id],
    queryFn: ({ signal }: { signal: AbortSignal }) => searchId(explorer.network, id, signal),
    staleTime: (query: { state: { data?: IdHits } }) =>
      query.state.data && !Object.keys(query.state.data.errors).length ? 15_000 : 0,
  };
}

/** The verified assets named, or with the unit name, `target` (case-insensitive). */
export function searchVerifiedAssets(target: string): Promise<A_AssetTiny[]> {
  return AssetCache.searchByNameOrUnit({ exact: target, peraVerified: true });
}

export type CoreSearchOptions = {
  /** The NFD reader, once its checks are done (useNfdSearchReader): `*.algo` searches need one */
  nfd?: () => Promise<NfdGhostSDK | null>;
  /** The page's round: an NFD is resolved as it was then */
  round?: number;
  /** Told when the destination needs a word of explanation (an NFD expired, say) */
  onNotice?: (message: string) => void;
  /** Keeps what an id search found for the results page (idHitsQuery) */
  queryClient?: QueryClient;
};

/** Why an NFD with no verified addresses leads to its owner, where it needs saying. */
const nfdStates: Partial<Record<NfdState, string>> = {
  expired: "has expired: showing its owner",
  forSale: "is for sale: showing its owner",
  unowned: "is unclaimed: showing its app account",
};

/**
 * The account an NFD name leads to, at `round`: its first verified address,
 * else its owner; the rest of its verified addresses as `?alt=`. An expired or
 * for-sale NFD has no verified addresses (the SDK leaves them out), so it
 * leads to its owner, with a notice.
 */
export async function searchNFD(
  name: string,
  { nfd, round, onNotice }: CoreSearchOptions,
): Promise<string> {
  name = name.trim().toLowerCase();
  // NFD names are lowercase letters, digits and dots.
  if (!/^[a-z0-9.]+\.algo$/.test(name)) throw new NotFoundError("That is not an NFD name");
  const sdk = await nfd?.();
  if (!sdk) throw new NotFoundError(`Can't look up ${name}: the node doesn't run NFD queries`);
  let record: NfdRecord | null;
  try {
    record = await sdk.resolveName(name, { round, fields: ["caAlgo"] });
  } catch (e) {
    throw new ServerError(`Error looking up NFD: ${(e as Error).message}`);
  }
  if (!record) {
    throw new NotFoundError(round === undefined ? `${name} was not found` : `${name} did not exist at block ${round}`);
  }
  const [first, ...rest] = record.caAlgo.length ? record.caAlgo : [record.owner];
  const why = record.caAlgo.length ? undefined : nfdStates[record.state];
  if (why) onNotice?.(`${name}${round === undefined ? "" : ` at block ${round}`} ${why}`);
  return `/account/${first}${rest.length ? `?alt=${rest.join(":")}` : ""}`;
}

/** The search without trailing junk: [address,] [txid,] [12345678n] */
export function normalizeTarget(target: string): string {
  target = target.trim();
  if (target.length === 59 || target.length === 53) {
    if (target.endsWith(",")) {
      target = target.slice(0, -1);
    }
  } else if (/^\d+[n,]$/.test(target)) {
    target = target.slice(0, -1);
  }
  return target;
}

export default async function (target: string, options: CoreSearchOptions = {}): Promise<string> {
  target = normalizeTarget(target);

  if (target.endsWith(".algo")) {
    return searchNFD(target, options);
  }

  if (target.length === 58) {
    if (isValidAddress(target)) {
      return "/account/" + target;
    } else {
      throw new Error(`Address is not valid`);
    }
  }

  if (target.length === 52) {
    return "/transaction/" + target;
  }

  const id = searchableId(target);
  if (id !== undefined) {
    const hits = options.queryClient
      ? await options.queryClient.fetchQuery(idHitsQuery(id))
      : await searchId(explorer.network, id);
    const { asset, app, block } = hits;
    const unknown = idUnknowns(hits);
    const failed = (e: Error) => new ServerError(`Error while searching: ${e.message}`);

    // An asset or app first, with the block of that number as a "did you mean"
    const assetOrApp = asset ?? app;
    if (assetOrApp) {
      return getLink(assetOrApp) + (block ? `?dym=block:${block.round}` : "");
    }
    // Only a block, unless the asset/app lookup failed: it may be one
    if (unknown.assetOrApp) throw failed(unknown.assetOrApp);
    if (block) return getLink(block);
    if (unknown.block) throw failed(unknown.block);
    throw new NotFoundError("No results found");
  }

  // asset search
  const results = await searchVerifiedAssets(target);
  if (results.length === 1) return `/asset/${results[0].index}/transactions`;
  if (results.length > 1) throw new AmbiguousError(`${results.length} verified assets are called ${target}`);

  throw new NotSearchableError(`Not something I can search for: ${target}`);
}
