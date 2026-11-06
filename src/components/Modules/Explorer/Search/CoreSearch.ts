import { isValidAddress } from "algosdk";
import type { NfdGhostSDK, NfdRecord, NfdState } from "nfd-ghost-sdk";
import { isNumber } from "../../../../utils/common";
import {
  A_ApplicationResult,
  A_AssetResult,
  A_BlockResult,
} from "../../../../packages/core-sdk/types";
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

export type CoreSearchOptions = {
  /** The NFD reader (useNfdReader): `*.algo` searches need one */
  nfd?: NfdGhostSDK | null;
  /** The page's round: an NFD is resolved as it was then */
  round?: number;
  /** Told when the destination needs a word of explanation (an NFD expired, say) */
  onNotice?: (message: string) => void;
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
  // NFD names are lowercase letters, digits and dots; the error snackbar renders its message as HTML.
  if (!/^[a-z0-9.]+\.algo$/.test(name)) throw new NotFoundError("That is not an NFD name");
  if (!nfd) throw new NotFoundError(`Can't look up ${name}: the node doesn't run NFD queries`);
  let record: NfdRecord | null;
  try {
    record = await nfd.resolveName(name, { round, fields: ["caAlgo"] });
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

export default async function (target: string, options: CoreSearchOptions = {}): Promise<string> {
  // support trailing junk [address,] [txid,] [12345678n]
  if (target.length === 59 || target.length === 53) {
    if (target.endsWith(",")) {
      target = target.slice(0, -1);
    }
  } else if (
    target.length <= 9 &&
    (target.endsWith("n") || target.endsWith(",")) &&
    isNumber(target.slice(0, -1))
  ) {
    target = target.slice(0, -1);
  }

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

  if (isNumber(target)) {
    try {
      const searchNum = Number(target);
      const [asset, app, block] = await Promise.all([
        new AssetClient(explorer.network).search(searchNum),
        new ApplicationClient(explorer.network).search(searchNum),
        new BlockClient(explorer.network).search(searchNum),
      ]);
      const first = [asset, app, block].find((e) => e);

      if (!first) {
        throw new NotFoundError("No results found");
      }

      let destination = getLink(first);

      if (block && first !== block) {
        destination += `?dym=block:${block.round}`;
      }

      return destination;
    } catch (e) {
      if (e instanceof NotFoundError) throw e;
      throw new ServerError(`Error while searching: ${(e as Error).message}`);
    }
  }

  // asset search
  console.time("AssetCache searchByNameOrUnit "+target);
  const results = await AssetCache.searchByNameOrUnit({ exact: target, peraVerified: true });
  console.timeEnd("AssetCache searchByNameOrUnit "+target);
  if (results.length) return `/asset/${results[0].index}/transactions`;
  
  throw new NotSearchableError(`Not something I can search for: ${target}`);
}
