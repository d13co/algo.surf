import {isValidAddress} from "algosdk";
import {isNumber} from "../../../../utils/common";
import {A_ApplicationResult, A_AssetResult, A_BlockResult} from "../../../../packages/core-sdk/types";
import explorer from "../../../../utils/dappflow";
import {AssetClient} from "../../../../packages/core-sdk/clients/assetClient";
import {ApplicationClient} from "../../../../packages/core-sdk/clients/applicationClient";
import {BlockClient} from "../../../../packages/core-sdk/clients/blockClient";

function getLink(result: A_AssetResult | A_ApplicationResult | A_BlockResult) {
    const { type } = result;
    if (type === "block") {
        return `/block/${result.round}`;
    } else if (type === "asset" ) {
        return `/asset/${result.index}/transactions`;
    } else {
        return `/application/${result.id}`;
    }
}

export class NotFoundError extends Error {}
export class ServerError extends Error {}
export class NotSearchableError extends Error {}

export default async function (target: string): Promise<string> {
    // support trailing junk [address,] [txid,] [12345678n]
    if (target.length === 59 || target.length === 53) {
        if (target.endsWith(",")) {
            target = target.slice(0, -1)
        }
    } else if (target.length <= 9 && target.endsWith('n') && isNumber(target.slice(0, -1))) {
        target = target.slice(0, -1)
    }

    if (target.length === 58) {
        if (isValidAddress(target)) {
            return '/account/' + target;
        } else {
            throw new Error(`Address is not valid`);
        }
    }

    if (target.length === 52) {
        return '/transaction/' + target;
    }

    if (isNumber(target)) {
        try {
            const searchNum = Number(target);
            const [asset, app, block] = await Promise.all([
                new AssetClient(explorer.network).search(searchNum),
                new ApplicationClient(explorer.network).search(searchNum),
                new BlockClient(explorer.network).search(searchNum),
            ]);
            const first = [asset, app, block].find(e => e);

            if (!first) {
                throw new NotFoundError('No results found');
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

    throw new NotSearchableError(`Not something I can search for: ${target}`);
}
