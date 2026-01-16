import "./AppCallTxnLocalStateDelta.scss";
import React from "react";
import { DataGrid, GridColDef, GridValueGetterParams } from "@mui/x-data-grid";
import {
  dataGridCellConfig,
  dataGridStyles,
  dataGridStylesBlackHeader,
} from "../../../../../../../../../theme/styles/datagrid";
import NumberFormatCopy from "../../../../../../../../Common/NumberFormatCopy/NumberFormatCopy";
import { A_LocalStateDelta } from "../../../../../../../../../packages/core-sdk/types";
import { CoreLocalState } from "../../../../../../../../../packages/core-sdk/classes/core/CoreLocalStateDelta";
import { Grid } from "@mui/material";
import LinkToAccount from "../../../../../../Common/Links/LinkToAccount";
import { shadedClr } from "../../../../../../../../../utils/common";
import MultiFormatViewer from "../../../../../../../../Common/MultiFormatViewer/MultiFormatViewer";

function AppCallTxnLocalStateDelta(props): JSX.Element {
  let localStateDelta: A_LocalStateDelta[] = props.state;
  if (!localStateDelta) {
    localStateDelta = [];
  }

  const columns: GridColDef[] = [
    {
      ...dataGridCellConfig,
      field: "operation",
      flex: 0,
      headerName: "Operation",
      renderCell: (params: GridValueGetterParams) => {
        const gStateDeltaInstance = new CoreLocalState(params.row);
        return <div>{gStateDeltaInstance.getActionTypeDisplayValue()}</div>;
      },
    },
    {
      ...dataGridCellConfig,
      field: "key",
      headerName: "Key",
      renderCell: (params: GridValueGetterParams) => {
        return (
          <MultiFormatViewer view="auto" value={params.row.key} side="left" />
        );
      },
    },
    {
      ...dataGridCellConfig,
      field: "value",
      headerName: "Value",
      flex: 2,
      renderCell: (params: GridValueGetterParams) => {
        const deltaInstance = new CoreLocalState(params.row);
        const action = deltaInstance.getAction();
        return (
          <div>
            {action === 2 ? (
              <NumberFormatCopy
                value={params.row.value.uint}
                copyPosition="left"
                displayType={"text"}
                thousandSeparator={true}
              ></NumberFormatCopy>
            ) : (
              <MultiFormatViewer
                side="left"
                view="auto"
                includeNum="auto"
                value={deltaInstance.getValue()}
              />
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className={"app-call-txn-local-state-delta-wrapper"}>
      <div className={"app-call-txn-local-state-delta-container"}>
        <div className="props" style={{ background: shadedClr }}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={12} md={12} lg={12} xl={12}>
              <div className="property">
                <div className="key" style={{ paddingLeft: "6px" }}>
                  Local state delta
                </div>
                <div className="value">
                  <div className="app-call-txn-local-state-delta-body">
                    {localStateDelta.map((accountLocalState) => {
                      return (
                        <div
                          className="local-state-account-wrapper"
                          key={accountLocalState.address}
                        >
                          <div className="local-state-account-container">
                            <div className="address">
                              <LinkToAccount
                                copySize="m"
                                address={accountLocalState.address}
                                subPage={`opted-applications/${props.appId}`}
                              ></LinkToAccount>
                            </div>
                            <div className="state-delta">
                              <div style={{ width: "100%" }}>
                                <DataGrid
                                  rows={accountLocalState.delta}
                                  columns={columns}
                                  rowsPerPageOptions={[]}
                                  disableSelectionOnClick
                                  autoHeight
                                  sx={dataGridStyles}
                                  getRowId={(row) => {
                                    return row.key;
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </Grid>
          </Grid>
        </div>
      </div>
    </div>
  );
}

export default AppCallTxnLocalStateDelta;
