import "./AppCallTxnGlobalStateDelta.scss";
import React from "react";
import { DataGrid, GridColDef, GridValueGetterParams } from "@mui/x-data-grid";
import {
  dataGridCellConfig,
  dataGridStylesBlackHeader,
} from "../../../../../../../../../theme/styles/datagrid";
import NumberFormat from "react-number-format";
import { A_GlobalStateDelta } from "../../../../../../../../../packages/core-sdk/types";
import { CoreGlobalState } from "../../../../../../../../../packages/core-sdk/classes/core/CoreGlobalStateDelta";
import { Grid } from "@mui/material";
import { shadedClr } from "../../../../../../../../../utils/common";
import MultiFormatViewer from "../../../../../../../../Common/MultiFormatViewer/MultiFormatViewer";
import NumberFormatCopy from "../../../../../../../../Common/NumberFormatCopy/NumberFormatCopy";

function AppCallTxnGlobalStateDelta(props): JSX.Element {
  let globalStateDelta: A_GlobalStateDelta[] = props.state;
  if (!globalStateDelta) {
    globalStateDelta = [];
  }

  const columns: GridColDef[] = [
    {
      ...dataGridCellConfig,
      field: "operation",
      headerName: "Operation",
      flex: 0,
      renderCell: (params: GridValueGetterParams) => {
        const gStateDeltaInstance = new CoreGlobalState(params.row);
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
        const gStateDeltaInstance = new CoreGlobalState(params.row);
        const action = gStateDeltaInstance.getAction();
        return (
          <div>
            {action === 2 ? (
              <NumberFormatCopy
                value={gStateDeltaInstance.getValue()}
                copyPosition="left"
                displayType={"text"}
                thousandSeparator={true}
              ></NumberFormatCopy>
            ) : (
              <MultiFormatViewer
                side="left"
                view="auto"
                includeNum="auto"
                value={gStateDeltaInstance.getValue()}
              />
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className={"app-call-txn-global-state-delta-wrapper"}>
      <div className={"app-call-txn-global-state-delta-container"}>
        <div className="props" style={{ background: shadedClr }}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={12} md={12} lg={12} xl={12}>
              <div className="property">
                <div className="key" style={{ paddingLeft: "6px" }}>
                  Global state delta
                </div>
                <div className="value" style={{ marginTop: 20 }}>
                  <div style={{ width: "100%" }}>
                    <DataGrid
                      rows={globalStateDelta}
                      columns={columns}
                      rowsPerPageOptions={[]}
                      disableSelectionOnClick
                      autoHeight
                      sx={{
                        ...dataGridStylesBlackHeader,
                      }}
                      getRowId={(row) => {
                        return row.key;
                      }}
                    />
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

export default AppCallTxnGlobalStateDelta;
