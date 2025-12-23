import './AccountCreatedAssets.scss';
import { useMemo } from "react";
import {useSelector} from "react-redux";
import {RootState} from "../../../../../../../redux/store";
import AssetsList from "../../../../Lists/AssetsList/AssetsList";
import { useTinyAssets } from '../../../../../../Common/UseTinyAsset';

function AccountCreatedAssets(): JSX.Element {
    const account = useSelector((state: RootState) => state.account);
    const createdAssetIds = useMemo(() => account.information["created-assets"].map(a => a.index), [account.information["created-assets"]]);
    const { data: createdAssets, isLoading } = useTinyAssets(createdAssetIds);

    return (<div className={"account-created-assets-wrapper"}>
        <div className={"account-created-assets-container"}>
            <div className="account-created-assets-body">
                <AssetsList loading={isLoading} assets={createdAssets} fields={["index", "name", "unit"]}></AssetsList>
            </div>
        </div>
    </div>);
}

export default AccountCreatedAssets;
