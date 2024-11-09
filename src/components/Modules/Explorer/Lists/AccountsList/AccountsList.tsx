import './AccountsList.scss';
import React from "react";
import {useDispatch} from "react-redux";
import {
    CircularProgress, Pagination,
    Tooltip
} from "@mui/material";
import {
    DataGrid,
    GridColDef, gridPageCountSelector,
    gridPageSelector,
    GridValueGetterParams,
    useGridApiContext,
    useGridSelector
} from "@mui/x-data-grid";
import NumberFormat from 'react-number-format';
import {dataGridCellConfig, dataGridStyles} from "../../../../../theme/styles/datagrid";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import {microalgosToAlgos,copyContent} from "../../../../../utils/common";
import {CoreAccount} from "../../../../../packages/core-sdk/classes/core/CoreAccount";
import LinkToAccount from "../../Common/Links/LinkToAccount";
import CustomNoRowsOverlay from "../../Common/CustomNoRowsOverlay/CustomNoRowsOverlay";
import {A_SearchAccount, A_AppsLocalState} from "../../../../../packages/core-sdk/types";
import Copyable from '../../../../Common/Copyable/Copyable';
import AlgoIcon from "../../AlgoIcon/AlgoIcon";

interface AccountsListProps {
    accounts: A_SearchAccount[]
    loading?: boolean;
    reachedLastPage?: Function;
    fields?: string[]
}

function AccountsList({accounts = [], loading = false, reachedLastPage = () => {}}: AccountsListProps): JSX.Element {
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
            field: 'address',
            headerName: 'Address',
            flex: 2,
            renderCell: (params: GridValueGetterParams) => {
                return <LinkToAccount copy="left" copySize="s" address={params.row.address} strip={30}></LinkToAccount>
            }
        },
        {
            ...dataGridCellConfig,
            field: 'amount',
            headerName: 'Balance',
            renderCell: (params: GridValueGetterParams) => {
                return <div>
                    <AlgoIcon></AlgoIcon>
                    <NumberFormat
                        value={microalgosToAlgos(params.row.amount)}
                        displayType={'text'}
                        thousandSeparator={true}
                        style={{marginLeft: 5}}
                    ></NumberFormat>
                </div>;
            }
        },
        {
            ...dataGridCellConfig,
            field: 'total-assets-opted-in',
            headerName: 'Assets'
        },
        {
            ...dataGridCellConfig,
            field: 'total-created-assets',
            headerName: 'Created assets'
        },
        {
            ...dataGridCellConfig,
            field: 'total-created-apps',
            headerName: 'Created applications'
        }
    ];


    return (<div className={"accounts-list-wrapper"}>
        <div className={"accounts-list-container"}>
            <div className="accounts-list-body">
                <div style={{ width: '100%' }}>
                    <DataGrid
                        loading={loading}
                        rows={accounts}
                        columns={columns}
                        pageSize={10}
                        getRowId={(row) => {
                            return row.address;
                        }}
                        autoHeight
                        disableSelectionOnClick
                        sx={dataGridStyles}
                        components={{
                            NoRowsOverlay: CustomNoRowsOverlay("accounts"),
                            Pagination: CustomPagination
                        }}
                        componentsProps={{
                            pagination: { loading },
                        }}
                    />
                </div>
            </div>
        </div>
    </div>);
}

export default AccountsList;
