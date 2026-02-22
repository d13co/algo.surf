import './AssetBalance.scss';
import React, {useEffect, useState} from "react";
import {AssetClient} from "../../../../../packages/core-sdk/clients/assetClient";
import dappflow from "../../../../../utils/dappflow";
import {A_Asset} from "../../../../../packages/core-sdk/types";
import {CoreAsset} from "../../../../../packages/core-sdk/classes/core/CoreAsset";
import NumberFormat from "react-number-format";
import LinkToAsset from "../Links/LinkToAsset";
import {indexerModels} from "algosdk";


interface AssetBalanceProps {
    id: number,
    balance: number,
    by?: string
    assetDef?: A_Asset
}

interface AssetBalanceState{
    asset: indexerModels.Asset | A_Asset
}

const initialState: AssetBalanceState = {
    asset: new indexerModels.Asset({
        index: 0n,
        params: new indexerModels.AssetParams({
            creator: "",
            decimals: 0,
            total: 0n,
        }),
    }),
};

function AssetBalance({id, balance = 0, by = 'id', assetDef}: AssetBalanceProps): JSX.Element {


    const [
        {asset},
        setState
    ] = useState(initialState);

    async function getAssetDetails() {
        if (by === 'id') {
            const assetClient = new AssetClient(dappflow.network);
            const asset = await assetClient.get(id);
            setState(prevState => ({...prevState, asset}));
        }
        else if (by === 'asset') {
            setState(prevState => ({...prevState, asset: assetDef}));
        }
    }

    useEffect(() => {
        getAssetDetails();
    }, []);

    return (<div className={"asset-balance-wrapper"}>
        <div className={"asset-balance-container"}>

            <NumberFormat
                value={new CoreAsset(asset).getAmountInDecimals(balance)}
                displayType={'text'}
                thousandSeparator={true}
            ></NumberFormat>

            <span style={{marginLeft: '5px'}}>
                <LinkToAsset id={new CoreAsset(asset).getIndex()} name={new CoreAsset(asset).getUnitName()}></LinkToAsset>
            </span>


        </div>
    </div>);
}

export default AssetBalance;
