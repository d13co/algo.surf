import "./Group.scss";
import React, { useEffect, useMemo } from "react";
import { Outlet, useNavigate, useParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "../../../../../redux/store";
import { Box, Grid, Tab, Tabs } from "@mui/material";
import LoadingTile from "../../../../Common/LoadingTile/LoadingTile";
import { loadGroup } from "../../../../../redux/explorer/actions/group";
import { CoreGroup } from "../../../../../packages/core-sdk/classes/core/CoreGroup";
import LinkToBlock from "../../Common/Links/LinkToBlock";
import useTitle from "../../../../Common/UseTitle/UseTitle";
import TxnTypeChip from "../../Common/TxnTypeChip/TxnTypeChip";
import {
  BalanceImpact,
  calculateGroupBalanceImpact,
} from "algo-group-balance-changes";
import dappflow from "../../../../../utils/dappflow";
import { useTinyAssets } from "../../../../Common/UseTinyAsset";
import NumberFormatCopy from "../../../../Common/NumberFormatCopy/NumberFormatCopy";
import LinkToAsset from "../../Common/Links/LinkToAsset";
import { primaryColor } from "../../../../../theme";
import LinkToAccount from "../../Common/Links/LinkToAccount";
import Copyable from "../../../../Common/Copyable/Copyable";

function Group(): JSX.Element {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const params = useParams();
  const { id, blockId } = params;

  const group = useSelector((state: RootState) => state.group);

  const groupInstance = new CoreGroup(group.information);

  const txnTypes = groupInstance.getTransactionsTypesCount();
  const txnTypesList = React.useMemo(() => Object.keys(txnTypes), [txnTypes]);

  const [balanceImpact, setBalanceImpact] =
    React.useState<BalanceImpact | null>(null);
  const [balanceAssetIds, setBalanceAssetIds] = React.useState<number[]>([]);

  useEffect(() => {
    (async () => {
      const indexer = dappflow.network.getIndexer();
      const { balanceImpact } = await calculateGroupBalanceImpact({
        indexer,
        groupId: id,
        round: Number(blockId),
        includeFees: true,
      });
      setBalanceImpact(balanceImpact);
      const assetIds = new Set<number>();
      Object.values(balanceImpact).forEach((deltas) => {
        Object.keys(deltas).forEach((assetId) => {
          assetIds.add(Number(assetId));
        });
      });
      setBalanceAssetIds(Array.from(assetIds));
    })();
  }, []);

  const { data: balanceAssets } = useTinyAssets(balanceAssetIds);

  useEffect(() => {
    dispatch(loadGroup({ id, blockId: Number(blockId) }));
  }, [dispatch, id, blockId]);

  useTitle(`Group Txn ${id}`);

  return (
    <div className={"group-wrapper"}>
      <div className={"group-container"}>
        <div className="group-header">
          <div>Transaction Group {groupInstance.getId()}</div>
        </div>

        {group.loading ? (
          <LoadingTile></LoadingTile>
        ) : (
          <div className="group-body">
            <Box
              className="props-container"
              sx={{
                flexDirection: { xs: "column", lg: "row" },
              }}
            >
              <div className="props">
                <div className="property">
                  <div className="key">Group&nbsp;ID</div>
                  <div className="value">
                    {groupInstance.getId().slice(0, 32)}..
                    <Copyable value={groupInstance.getId()} />
                  </div>
                </div>

                <div className="property">
                  <div className="key">Block</div>
                  <div className="value">
                    <LinkToBlock id={groupInstance.getBlock()}></LinkToBlock>
                  </div>
                </div>

                <div className="property">
                  <div className="key">Timestamp</div>
                  <div className="value">
                    {groupInstance.getTimestampDisplayValue()}
                  </div>
                </div>

                <div className="property">
                  <div className="key">Age</div>
                  <div className="value">
                    {groupInstance.getTimestampDuration()} Ago
                  </div>
                </div>

                <div className="property">
                  <div className="key nowrap">
                    Transaction Types
                  </div>
                  <div className="value flexwrap">
                    <span style={{ marginRight: "8px" }}>
                        {groupInstance.getTransactionsCount()}x
                        
                    </span>{txnTypesList.map((type) => {
                      return (
                        <TxnTypeChip
                          parentType="group"
                          type={type}
                          count={txnTypes[type]}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>

              {balanceImpact && balanceAssets && (
                <>
                  <div className="props">
                    <Box sx={{ mb: "20px", mt: "20px" }}>Balance Impact</Box>

                    <div className="vflex">
                      {Object.entries(balanceImpact).flatMap(
                        ([account, deltas]) => (
                          <div className="splitrow">
                            <div className="left">
                              <LinkToAccount
                                copy=""
                                strip={8}
                                address={account}
                              />
                            </div>
                            <div className="right vflex">
                              {Object.entries(deltas).map(
                                ([assetId, delta], i) => {
                                  const asset = balanceAssets?.find(
                                    (a) => a.index === Number(assetId),
                                  );
                                  const assetLabel =
                                    assetId === "0"
                                      ? "ALGO"
                                      : asset.params["unit-name"] || assetId;
                                  const decimals =
                                    assetId === "0"
                                      ? 6
                                      : asset.params.decimals || 0;
                                  console.log({
                                    assetId,
                                    assetLabel,
                                    delta,
                                    decimals,
                                  });
                                  const amount = delta / 10 ** decimals;
                                  const color =
                                    amount > 0
                                      ? "#12b062"
                                      : amount < 0
                                        ? "#c21723"
                                        : "";
                                  return (
                                    <div
                                      key={i}
                                      className="delta"
                                      style={{ color, textDecorationColor: color }}
                                    >
                                      <NumberFormatCopy
                                        value={amount}
                                        dimmable={true}
                                        showSign={true}
                                        copyPosition="left"
                                        copyStyle={{marginRight: '0px'}}
                                        displayType={"text"}
                                        thousandSeparator={true}
                                        style={{marginRight: "4px"}}
                                      />
                                      {assetId === "0" ? (
                                        <span>
                                          {assetLabel}
                                        </span>
                                      ) : (
                                        <LinkToAsset
                                          style={{ color: "inherit", textDecorationColor: "inherit" }}
                                          id={assetId}
                                          name={assetLabel}
                                        />
                                      )}
                                    </div>
                                  );
                                },
                              )}
                            </div>
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                </>
              )}
            </Box>

            <div className="group-tabs">
              <Tabs
                TabIndicatorProps={{
                  children: <span className="MuiTabs-indicatorSpan" />,
                }}
                value="transactions"
                className="related-list"
              >
                <Tab
                  label="Transactions"
                  value="transactions"
                  onClick={() => {
                    navigate("/block/" + id + "/transactions");
                  }}
                />
              </Tabs>

              <Outlet />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Group;
