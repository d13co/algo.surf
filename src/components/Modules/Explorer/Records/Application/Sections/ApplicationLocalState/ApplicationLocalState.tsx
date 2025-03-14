import "./ApplicationLocalState.scss";
import React from "react";
import { useSelector } from "react-redux";
import { RootState } from "../../../../../../../redux/store";
import { CoreApplication } from "../../../../../../../packages/core-sdk/classes/core/CoreApplication";
import { DataGrid, GridColDef, GridValueGetterParams } from "@mui/x-data-grid";
import {
  dataGridCellConfig,
  dataGridStyles,
} from "../../../../../../../theme/styles/datagrid";
import { shadedClr } from "../../../../../../../theme/index";
import NumberFormat from "react-number-format";
import { Grid } from "@mui/material";
import MultiFormatViewer from "../../../../../../../components/Common/MultiFormatViewer/MultiFormatViewer";
import { A_AppsLocalState } from "../../../../../../../packages/core-sdk/types";
import Copyable from "../../../../../../Common/Copyable/Copyable";

function ApplicationlocalState({
  state,
}: {
  state: A_AppsLocalState;
}): JSX.Element {
  const columns: GridColDef[] = [
    {
      ...dataGridCellConfig,
      field: "type",
      flex: 0,
      width: 60,
      headerName: "Type",
      renderCell: (params: GridValueGetterParams) => {
        return (
          <div className="dim">
            {params.row.value.type === 1 ? "byte" : "uint"}
          </div>
        );
      },
    },
    {
      ...dataGridCellConfig,
      field: "key",
      flex: 3,
      headerName: "Key",
      renderCell: (params: GridValueGetterParams) => {
        return (
          <MultiFormatViewer
            view="auto"
            includeNum="auto"
            value={params.row.key}
            style={{ marginLeft: "15px" }}
          />
        );
      },
    },
    {
      ...dataGridCellConfig,
      field: "value",
      headerName: "Value",
      flex: 5,
      renderCell: (params: GridValueGetterParams) => {
        return (
          <div>
            {params.row.value.type === 2 ? (
              <>
                <NumberFormat
                  value={params.row.value.uint}
                  displayType={"text"}
                  thousandSeparator={true}
                ></NumberFormat>
              </>
            ) : (
              <MultiFormatViewer
                view="auto"
                includeNum="auto"
                value={params.row.value.bytes}
              />
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className={"application-local-state-wrapper"}>
      <div className={"application-local-state-container"}>
        {state && state["key-value"]?.length > 0 ? (
          <div style={{ width: "100%" }}>
            <DataGrid
              rows={state["key-value"]}
              columns={columns}
              rowsPerPageOptions={[]}
              disableSelectionOnClick
              autoHeight
              sx={{
                ...dataGridStyles,
              }}
              getRowId={(row) => {
                return row.key;
              }}
            />
          </div>
        ) : (
          <div style={{ paddingLeft: "14px" }}>
            Application does not have any local state set.
          </div>
        )}
      </div>
    </div>
  );
}

export default ApplicationlocalState;
