import "./AccountAssets.scss";
import React, { useEffect, useMemo } from "react";
import { useSelector } from "react-redux";
import { RootState } from "../../../../../../../redux/store";
import AssetsList from "../../../../Lists/AssetsList/AssetsList";
import { Input } from "@mui/material";
import { Search } from "@mui/icons-material";
import { useTinyAssets } from "../../../../../../Common/UseTinyAsset";
import { A_AssetHoldingTiny } from "../../../../../../../packages/core-sdk/types";

function AccountAssets(): JSX.Element {
  const account = useSelector((state: RootState) => state.account);
  const [searchTerm, setSearchTerm] = React.useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = React.useState("");
  const [searchStatus, setSearchStatus] = React.useState("");

  const optedAssetIds = useMemo(() => {
    return account.information.assets.map((a) => a["asset-id"]);
  }, [account.information.assets]);

  const optedAssetAmounts: Map<
    number,
    { amount: number; "is-frozen": boolean }
  > = useMemo(() => {
    const map = new Map();
    account.information.assets.forEach((a) => {
      map.set(a["asset-id"], { amount: a.amount, "is-frozen": a["is-frozen"] });
    });
    return map;
  }, [account.information.assets]);

  const { data: optedAssets, isLoading } = useTinyAssets(optedAssetIds);

  const handleChangeSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 100);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  const filteredAssetHoldings: A_AssetHoldingTiny[] = useMemo(() => {
    if (!optedAssets) return [];

    const search = debouncedSearchTerm.toLocaleLowerCase();
    
    if (!debouncedSearchTerm.trim().length) {
      setSearchStatus(`${optedAssets.length} assets`);
      return optedAssets.map((a) => {
        const holding = optedAssetAmounts.get(a.index);
        return {
          ...a,
          amount: holding ? holding.amount : 0,
          frozen: holding ? holding["is-frozen"] : false,
        };
      });
    }
    
    const matching = optedAssets
      .filter((a) => {
        const { name, "unit-name": unitName } = a.params;
        return (
          name?.toLocaleLowerCase()?.includes(search) ||
          unitName?.toLocaleLowerCase()?.includes(search)
        );
      })
      .map((a) => {
        const holding = optedAssetAmounts.get(a.index);
        return {
          ...a,
          amount: holding ? holding.amount : 0,
          frozen: holding ? holding["is-frozen"] : false,
        };
      });
    if (matching.length === 0)
      setSearchStatus(`No assets matching \"${debouncedSearchTerm}\"`);
    else setSearchStatus(`Showing ${matching.length} of ${optedAssets.length}`);

    return matching;
  }, [debouncedSearchTerm, optedAssets]);

  return (
    <div className={"account-assets-wrapper"}>
      <div className={"account-assets-container"}>
        <div className="asset-search-container">
          <div>{searchStatus}</div>
          <Input
            endAdornment={<Search />}
            sx={{ width: { xs: "175px", sm: "250px", md: "350px" } }}
            onChange={handleChangeSearch}
            placeholder="Search"
            className="asset-search"
          />
        </div>
        <div className="account-assets-body">
          <AssetsList
            loading={isLoading}
            assets={filteredAssetHoldings}
            accountInfo={account.information}
            fields={["index", "name", "balance"]}
          ></AssetsList>
        </div>
      </div>
    </div>
  );
}

export default AccountAssets;
