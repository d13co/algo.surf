import './BoxesList.scss';
import {
    DataGrid,
    GridColDef, 
    GridValueGetterParams} from "@mui/x-data-grid";
import {dataGridCellConfig, dataGridStyles} from "../../../../../theme/styles/datagrid";
import CustomNoRowsOverlay from "../../Common/CustomNoRowsOverlay/CustomNoRowsOverlay";
import {A_BoxNames} from "../../../../../packages/core-sdk/types";
import MultiFormatViewer from "../../../../Common/MultiFormatViewer/MultiFormatViewer";

interface BoxListProps {
    boxNames: A_BoxNames;
}

function BoxList({boxNames = []}: BoxListProps): JSX.Element {
    const columns: GridColDef[] = [
        {
            ...dataGridCellConfig,
            field: 'name',
            headerName: 'Box name',
            renderCell: (params: GridValueGetterParams) => {
                return <div className="cell-content">
                    <MultiFormatViewer
                        view="auto"
                        includeNum="auto"
                        value={params.row.name}
                    />
                </div>
            }
        }
    ];

    return (<div className={"boxes-list-wrapper"}>
        <div className={"boxes-list-container"}>
            <div className="boxes-list-body">
                <div style={{ width: '100%' }}>
                    <DataGrid
                        rows={boxNames}
                        columns={columns}
                        pageSize={10}
                        disableSelectionOnClick
                        autoHeight
                        pagination
                        getRowId={(row) => {
                            return row.name;
                        }}
                        sx={{
                            ...dataGridStyles,
                            '.MuiDataGrid-cell': {
                                fontSize: 13,
                                'div.cell-content': {
                                    overflow: "hidden",
                                    textOverflow: "ellipsis"
                                }
                            }
                        }}
                        components={{
                            NoRowsOverlay: CustomNoRowsOverlay("boxes"),
                        }}
                    />
                </div>
            </div>
        </div>
    </div>);
}

export default BoxList;
