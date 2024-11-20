import './BoxesList.scss';
import React from "react";
import {useDispatch} from "react-redux";
import {
    CircularProgress,
    Pagination,
    Tooltip
} from "@mui/material";
import NumberFormat from 'react-number-format';
import {
    DataGrid,
    GridColDef, gridPageCountSelector,
    gridPageSelector,
    GridValueGetterParams,
    useGridApiContext,
    useGridSelector
} from "@mui/x-data-grid";
import {dataGridCellConfig, dataGridStyles} from "../../../../../theme/styles/datagrid";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import {microalgosToAlgos, copyContent} from "../../../../../utils/common";
import AlgoIcon from "../../AlgoIcon/AlgoIcon";
import {TXN_TYPES} from "../../../../../packages/core-sdk/constants";
import {ArrowForward} from "@mui/icons-material";
import LinkToAccount from "../../Common/Links/LinkToAccount";
import LinkToApplication from "../../Common/Links/LinkToApplication";
import LinkToBlock from "../../Common/Links/LinkToBlock";
import CustomNoRowsOverlay from "../../Common/CustomNoRowsOverlay/CustomNoRowsOverlay";
import {A_BoxNames} from "../../../../../packages/core-sdk/types";
import LinkToGroup from "../../Common/Links/LinkToGroup";
import {Alert} from "@mui/lab";
import AssetBalance from "../../Common/AssetBalance/AssetBalance";
import Copyable from "../../../../Common/Copyable/Copyable";
import MultiFormatViewer from "../../../../Common/MultiFormatViewer/MultiFormatViewer";

interface BoxListProps {
    boxNames: A_BoxNames;
}

function BoxList({boxNames = []}: BoxListProps): JSX.Element {
    const dispatch = useDispatch();

    function CustomPagination({loading}) {
        const apiRef = useGridApiContext();
        const page = useGridSelector(apiRef, gridPageSelector);
        const pageCount = useGridSelector(apiRef, gridPageCountSelector);

        return (
            <div style={{display: "flex", justifyContent: "space-between"}}>
                {loading ? <div style={{marginTop: 5, marginRight: 20}}><CircularProgress size={25}></CircularProgress></div> : ''}
                <Pagination
                    shape="rounded"
                    showFirstButton
                    showLastButton
                    count={pageCount}
                    page={page + 1}
                />
            </div>

        );
    }

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
