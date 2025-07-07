import "./TransactionsList.scss";
import React from "react";
import { useDispatch } from "react-redux";
import { CircularProgress, Pagination, Tooltip } from "@mui/material";
import NumberFormat from "react-number-format";
import {
  DataGrid,
  GridColDef,
  gridPageCountSelector,
  gridPageSelector,
  GridValueGetterParams,
  useGridApiContext,
  useGridSelector,
} from "@mui/x-data-grid";
import {
  dataGridCellConfig,
  dataGridStyles,
} from "../../../../../theme/styles/datagrid";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { microalgosToAlgos, copyContent } from "../../../../../utils/common";
import AlgoIcon from "../../AlgoIcon/AlgoIcon";
import { CoreTransaction } from "../../../../../packages/core-sdk/classes/core/CoreTransaction";
import { TXN_TYPES } from "../../../../../packages/core-sdk/constants";
import { ArrowForward } from "@mui/icons-material";
import LinkToAccount from "../../Common/Links/LinkToAccount";
import LinkToApplication from "../../Common/Links/LinkToApplication";
import LinkToTransaction from "../../Common/Links/LinkToTransaction";
import LinkToBlock from "../../Common/Links/LinkToBlock";
import CustomNoRowsOverlay from "../../Common/CustomNoRowsOverlay/CustomNoRowsOverlay";
import { A_SearchTransaction } from "../../../../../packages/core-sdk/types";
import LinkToGroup from "../../Common/Links/LinkToGroup";
import { Alert } from "@mui/lab";
import AssetBalance from "../../Common/AssetBalance/AssetBalance";
import Copyable from "../../../../Common/Copyable/Copyable";
import RekeyIcon from "./RekeyIcon";
import { useRecordHotkeys } from "react-hotkeys-hook";
import { useReverseNFD, useReverseNFDs } from "../../../../Common/UseNFD";
import { DisplayAccount } from "../../../../Common/DisplayAccount";

interface TransactionsListProps {
  transactions: A_SearchTransaction[];
  loading?: boolean;
  reachedLastPage?: Function;
  fields?: string[];
  record?: string;
  recordId?: string;
  recordDef?: any;
}

function TransactionsList({
  transactions = [],
  loading = false,
  reachedLastPage = () => {},
  fields = ["id", "block", "age", "from", "to", "amount", "fee", "type"],
  record = "",
  recordId = "",
  recordDef = {},
}: TransactionsListProps): JSX.Element {
  const dispatch = useDispatch();

  function CustomPagination({ loading }) {
    const apiRef = useGridApiContext();
    const page = useGridSelector(apiRef, gridPageSelector);
    const pageCount = useGridSelector(apiRef, gridPageCountSelector);

    return (
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        {loading ? (
          <div style={{ marginTop: 5, marginRight: 20 }}>
            <CircularProgress size={25}></CircularProgress>
          </div>
        ) : (
          ""
        )}
        <Pagination
          shape="rounded"
          showFirstButton
          showLastButton
          count={pageCount}
          page={page + 1}
          onChange={(event, value) => {
            if (value === apiRef.current.state.pagination.pageCount) {
              reachedLastPage();
            }
            return apiRef.current.setPage(value - 1);
          }}
        />
      </div>
    );
  }

  const columns: GridColDef[] = [
    {
      ...dataGridCellConfig,
      field: "id",
      headerName: "Txn ID",
      flex: 2,
      renderCell: (params: GridValueGetterParams) => {
        const txnInstance = new CoreTransaction(params.row);
        const txnId = txnInstance.getId();
        const groupId = txnInstance.getGroup();
        const rekey = !!txnInstance.getRekeyTo();
        const showGroupIcon = groupId && record !== "group";
        return (
          <div className="cell-content">
            <Copyable size="s" value={txnId} />
            {rekey ? <RekeyIcon /> : null}
            {showGroupIcon ? (
              <span className="group-txn-icon">
                <LinkToGroup
                  id={groupId}
                  blockId={txnInstance.getBlock()}
                  icon={true}
                ></LinkToGroup>
              </span>
            ) : (
              ""
            )}
            <LinkToTransaction id={txnId}></LinkToTransaction>
          </div>
        );
      },
    },
  ];

  if (fields.indexOf("block") !== -1) {
    columns.push({
      ...dataGridCellConfig,
      field: "confirmed-round",
      headerName: "Block",
      flex: 0.8,
      renderCell: (params: GridValueGetterParams) => {
        const block = new CoreTransaction(params.row).getBlock();
        return (
          <div className="cell-content">
            <LinkToBlock id={block}></LinkToBlock>
          </div>
        );
      },
    });
  }
  if (fields.indexOf("age") !== -1) {
    columns.push({
      ...dataGridCellConfig,
      field: "age",
      headerName: "Age",
      flex: 1.5,
      renderCell: (params: GridValueGetterParams) => {
        const age = new CoreTransaction(params.row).getTimestampDuration();
        return <div className="cell-content">{age} ago</div>;
      },
    });
  }
  if (fields.indexOf("from") !== -1) {
    columns.push({
      ...dataGridCellConfig,
      field: "from",
      headerName: "From",
      flex: 2,
      renderCell: (params: GridValueGetterParams) => {
        const from = new CoreTransaction(params.row).getFrom();
        let showLink = true;
        if (record === "account" && recordId === from) {
          showLink = false;
        }
        let secondFrom = <></>;
        if (params.row["tx-type"] == "hb") {
          secondFrom = (
            <>
              <span className="dot-separator">/</span>
              <LinkToAccount
                copySize="s"
                copy="none"
                address={params.row["heartbeat-transaction"]["hb-address"]}
              ></LinkToAccount>
            </>
          );
        }

        return (
          <div className="cell-content">
            {showLink ? (
              <>
                <LinkToAccount
                  copySize="s"
                  copy={secondFrom ? "none" : "left"}
                  address={from}
                  strip={secondFrom ? 16 : 0}
                ></LinkToAccount>
                {secondFrom}
              </>
            ) : (
              <>
                <DisplayAccount address={from} />
                {secondFrom}
              </>
            )}
          </div>
        );
      },
    });
  }
  if (fields.indexOf("to") !== -1) {
    columns.push({
      ...dataGridCellConfig,
      field: "to",
      headerName: "To",
      flex: 2,
      renderCell: (params: GridValueGetterParams) => {
        const txnInstance = new CoreTransaction(params.row);

        const to = txnInstance.getTo();
        const closeTo = txnInstance.getCloseTo();
        const type = txnInstance.getType();
        const appId = txnInstance.getAppId();

        let showLink = true;
        let showCloseLink = true;
        let showArrow = false;
        let inTxn = false;
        if (record === "account") {
          showArrow = false;
          if (recordId === to) {
            showLink = false;
            inTxn = true;
          }
          if (recordId === closeTo) {
            showCloseLink = false;
            inTxn = true;
          }
        }

        return (
          <div className="cell-content">
            {type === TXN_TYPES.PAYMENT || type === TXN_TYPES.ASSET_TRANSFER ? (
              <>
                <div className="cell-content-flex-col">
                  <span>
                    {showLink ? (
                      <LinkToAccount copySize="s" address={to}></LinkToAccount>
                    ) : (
                      <DisplayAccount address={to} />
                    )}
                  </span>
                  {closeTo ? (
                    <span>
                      {showCloseLink ? (
                        <LinkToAccount
                          copySize="s"
                          address={closeTo}
                        ></LinkToAccount>
                      ) : (
                        <DisplayAccount address={closeTo} />
                      )}
                    </span>
                  ) : null}
                </div>
              </>
            ) : (
              ""
            )}

            {type === TXN_TYPES.APP_CALL ? (
              <span>
                <LinkToApplication
                  id={appId}
                  name={"Application: " + appId}
                ></LinkToApplication>
              </span>
            ) : (
              ""
            )}
          </div>
        );
      },
    });
  }
  if (fields.indexOf("amount") !== -1) {
    columns.push({
      ...dataGridCellConfig,
      field: "amount",
      headerName: "Amount",
      flex: 1.3,
      renderCell: (params: GridValueGetterParams) => {
        const txnInstance = new CoreTransaction(params.row);
        const amount = txnInstance.getAmount();
        const closeTo = !!txnInstance.getCloseTo();
        const closeAmount = txnInstance.getCloseAmount();
        const type = txnInstance.getType();

        return (
          <div className="cell-content">
            {type === TXN_TYPES.PAYMENT ? (
              <div>
                <AlgoIcon width={10}></AlgoIcon>
                <NumberFormat
                  value={microalgosToAlgos(amount)}
                  displayType={"text"}
                  thousandSeparator={true}
                  style={{ marginLeft: 5 }}
                ></NumberFormat>
                {closeTo ? (
                  <>
                    <br />
                    <AlgoIcon width={10}></AlgoIcon>
                    <NumberFormat
                      value={microalgosToAlgos(closeAmount)}
                      displayType={"text"}
                      thousandSeparator={true}
                      style={{ marginLeft: 5 }}
                    ></NumberFormat>
                  </>
                ) : null}
              </div>
            ) : (
              ""
            )}

            {type === TXN_TYPES.ASSET_TRANSFER ? (
              <div>
                {record === "asset" ? (
                  <AssetBalance
                    by="asset"
                    assetDef={recordDef}
                    id={txnInstance.getAssetId()}
                    balance={amount}
                  ></AssetBalance>
                ) : (
                  <AssetBalance
                    id={txnInstance.getAssetId()}
                    balance={amount}
                  ></AssetBalance>
                )}
                {closeTo ? (
                  record === "asset" ? (
                    <AssetBalance
                      by="asset"
                      assetDef={recordDef}
                      id={txnInstance.getAssetId()}
                      balance={closeAmount}
                    ></AssetBalance>
                  ) : (
                    <AssetBalance
                      id={txnInstance.getAssetId()}
                      balance={closeAmount}
                    ></AssetBalance>
                  )
                ) : null}
              </div>
            ) : (
              ""
            )}
          </div>
        );
      },
    });
  }
  if (fields.indexOf("fee") !== -1) {
    columns.push({
      ...dataGridCellConfig,
      field: "fee",
      headerName: "Fee",
      renderCell: (params: GridValueGetterParams) => {
        const fee = new CoreTransaction(params.row).getFee();

        return (
          <div className="cell-content">
            <AlgoIcon width={10}></AlgoIcon>
            <NumberFormat
              value={microalgosToAlgos(fee)}
              displayType={"text"}
              thousandSeparator={true}
              style={{ marginLeft: 5 }}
            ></NumberFormat>
          </div>
        );
      },
    });
  }
  if (fields.indexOf("type") !== -1) {
    columns.push({
      ...dataGridCellConfig,
      field: "type",
      headerName: "Type",
      renderCell: (params: GridValueGetterParams) => {
        const txn = new CoreTransaction(params.row);
        const type = txn.getTypeDisplayValue();
        const closeTo = txn.getCloseTo();
        return (
          <div className="cell-content">
            {closeTo ? (
              <div className="cell-content-flex-col">
                {type}
                <span>Close</span>
              </div>
            ) : (
              type
            )}
          </div>
        );
      },
    });
  }

  return (
    <div className={"transactions-list-wrapper"}>
      <div className={"transactions-list-container"}>
        <div className="transactions-list-body">
          <div style={{ width: "100%" }}>
            <DataGrid
              loading={loading}
              rows={transactions}
              columns={columns}
              pageSize={10}
              disableSelectionOnClick
              autoHeight
              pagination
              sx={{
                ...dataGridStyles,
                ".MuiDataGrid-cell": {
                  fontSize: 13,
                  "div.cell-content": {
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  },
                },
              }}
              components={{
                NoRowsOverlay: CustomNoRowsOverlay("transactions"),
                Pagination: CustomPagination,
              }}
              componentsProps={{
                pagination: { loading },
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default TransactionsList;
