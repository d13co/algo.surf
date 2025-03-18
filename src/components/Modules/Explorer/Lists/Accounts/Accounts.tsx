import './Accounts.scss';
import React, {useEffect} from "react";
import {useDispatch, useSelector} from "react-redux";
import {loadAccounts} from "../../../../../redux/explorer/actions/accounts";
import {RootState} from "../../../../../redux/store";
import {
    CircularProgress, Pagination,
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
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import {microalgosToAlgos, copyContent} from "../../../../../utils/common";
import AlgoIcon from "../../AlgoIcon/AlgoIcon";
import LinkToAccount from "../../Common/Links/LinkToAccount";
import CustomNoRowsOverlay from "../../Common/CustomNoRowsOverlay/CustomNoRowsOverlay";
import useTitle from "../../../../Common/UseTitle/UseTitle";

function Accounts(): JSX.Element {
    const dispatch = useDispatch();
    const accounts = useSelector((state: RootState) => state.accounts);
    const {list, loading} = accounts;
    useTitle("Accounts");

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
                            dispatch(loadAccounts());
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
            field: 'status',
            headerName: 'Status'
        },
        {
            ...dataGridCellConfig,
            field: 'total-created-assets',
            headerName: 'Created assets'
        },
        {
            ...dataGridCellConfig,
            field: 'total-created-apps',
            headerName: 'Created apps'
        }
    ];

    useEffect(() => {
        dispatch(loadAccounts());
    }, [dispatch]);

    return (<div className={"accounts-wrapper"}>
        <div className={"accounts-container"}>
            <div className="accounts-body">
                <div style={{ width: '100%' }}>
                    <DataGrid
                        loading={loading}
                        rows={list}
                        columns={columns}
                        pageSize={16}
                        autoHeight
                        getRowId={(row) => {
                            return row.address;
                        }}
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

export default Accounts;
