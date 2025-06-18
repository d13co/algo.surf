import "./TransactionRekey.scss";
import { Grid } from "@mui/material";
import { CoreTransaction } from "../../../../../../../packages/core-sdk/classes/core/CoreTransaction";
import { shadedClr } from "../../../../../../../utils/common";
import LinkToAccount from "../../../../Common/Links/LinkToAccount";
import { KeyRound } from "lucide-react";

function TransactionRekey(props): JSX.Element {
  const { transaction } = props;
  const txnInstance = new CoreTransaction(transaction);

  const rekeyTo = txnInstance.getRekeyTo();

  return !rekeyTo ? null : (
    <div className={"transaction-rekey-wrapper"}>
      <div className={"transaction-rekey-container"}>
        <div className="props" style={{ background: shadedClr }}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={12} md={12} lg={12} xl={12}>
              <div className="property">
                <div className="key"><KeyRound size={16} /> Rekey To</div>
                <div className="value small"><LinkToAccount address={rekeyTo} /></div>
              </div>
            </Grid>
          </Grid>
        </div>
      </div>
    </div>
  );
}

export default TransactionRekey;
