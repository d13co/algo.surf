import "./ApplicationGlobalState.scss";
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

function ApplicationGlobalState(): JSX.Element {
  const application = useSelector((state: RootState) => state.application);
  const applicationInstance = new CoreApplication(application.information);
  const globalStorage = applicationInstance.getGlobalStorageDecrypted(true);

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
            {params.row.type === "bytes" ? "byte" : "uint"}
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
            {params.row.type === "uint" ? (
              <NumberFormat
                value={params.row.value}
                displayType={"text"}
                thousandSeparator={true}
              ></NumberFormat>
            ) : (
              params.row.value
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className={"application-global-state-wrapper"}>
      <div className={"application-global-state-container"}>
        {globalStorage && globalStorage.length > 0 ? (
          <div style={{ width: "100%" }}>
            <DataGrid
              rows={globalStorage}
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
            Application does not have any global state set.
          </div>
        )}
      </div>
    </div>
  );
}

export default ApplicationGlobalState;
