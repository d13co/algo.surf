import { CoreAsset } from "src/packages/core-sdk/classes/core/CoreAsset";
import NumberFormat from "react-number-format";
import LinkToAsset from "./Links/LinkToAsset";
import { A_Asset } from "src/packages/core-sdk/types";
import { useAsset } from "src/hooks/useAsset";

interface AssetBalanceProps {
  id: number;
  balance: number;
  by?: string;
  assetDef?: A_Asset;
}

function AssetBalance({
  id,
  balance = 0,
  by = "id",
  assetDef,
}: AssetBalanceProps): JSX.Element {
  const { data: fetchedAsset } = useAsset(by === "id" ? id : 0);
  const asset = by === "asset" ? assetDef : fetchedAsset;

  if (!asset) return null;

  const coreAsset = new CoreAsset(asset);

  return (
    <div className="inline-flex items-center gap-1 flex-wrap">
      <NumberFormat
        value={coreAsset.getAmountInDecimals(balance)}
        displayType="text"
        thousandSeparator
      />
      <LinkToAsset
        id={coreAsset.getIndex()}
        name={coreAsset.getUnitName()}
      />
    </div>
  );
}

export default AssetBalance;
