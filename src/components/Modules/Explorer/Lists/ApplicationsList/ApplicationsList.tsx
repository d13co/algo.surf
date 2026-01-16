import './ApplicationsList.scss';
import React from "react";
import {useDispatch} from "react-redux";
import {
    Button,
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
import {dataGridCellConfig, dataGridStyles} from "../../../../../theme/styles/datagrid";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import {copyContent} from "../../../../../utils/common";
import {CoreApplication} from "../../../../../packages/core-sdk/classes/core/CoreApplication";
import LinkToAccount from "../../Common/Links/LinkToAccount";
import LinkToApplication from "../../Common/Links/LinkToApplication";
import CustomNoRowsOverlay from "../../Common/CustomNoRowsOverlay/CustomNoRowsOverlay";
import {A_Application, A_AppsLocalState} from "../../../../../packages/core-sdk/types";
import Copyable from '../../../../Common/Copyable/Copyable';
import { useNavigate } from 'react-router-dom';

interface ApplicationsListProps {
    applications: A_Application[] | A_AppsLocalState[];
    account?: string;
    loading?: boolean;
    reachedLastPage?: Function;
    fields?: string[]
}

function ApplicationsList({applications = [], account="", loading = false, fields = ['id', 'creator'], reachedLastPage = () => {}}: ApplicationsListProps): JSX.Element {
    const dispatch = useDispatch();
    const navigate = useNavigate();

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

    const columns: GridColDef[] = [];

    if (fields.indexOf('id') !== -1) {
        columns.push({
            ...dataGridCellConfig,
            field: 'id',
            headerName: 'Application ID',
            renderCell: (params: GridValueGetterParams) => {
                const appInstance = new CoreApplication(params.row);
                return <div>
                    <LinkToApplication copy="left" id={appInstance.getId()}></LinkToApplication>
                </div>;
            }
        });
    }
    if (fields.indexOf('creator') !== -1) {
        columns.push({
            ...dataGridCellConfig,
            field: 'creator',
            headerName: 'Creator',
            flex: 2,
            renderCell: (params: GridValueGetterParams) => {
                const appInstance = new CoreApplication(params.row);
                return <div>
                    <LinkToAccount copySize="s" copy="left" address={appInstance.getCreator()}></LinkToAccount>
                </div>;
            }
        });
    }
    if (fields.indexOf('state') !== -1) {
        columns.push({
            ...dataGridCellConfig,
            field: 'state',
            headerName: "​",
            flex: 1,
            renderCell: (params: GridValueGetterParams) => {
                const appInstance = new CoreApplication(params.row);
                return <div className="flex-end">
                    <Button variant="outlined" onClick={() => navigate(`/account/${account}/opted-applications/${appInstance.getId()}`)}>View State</Button>
                </div>;
            }
        });
    }


    return (<div className={"applications-list-wrapper"}>
        <div className={"applications-list-container"}>
            <div className="applications-list-body">

                <div style={{ width: '100%' }}>
                    <DataGrid
                        loading={loading}
                        rows={applications}
                        columns={columns}
                        pageSize={10}
                        autoHeight
                        disableSelectionOnClick
                        sx={dataGridStyles}
                        components={{
                            NoRowsOverlay: CustomNoRowsOverlay("applications"),
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

export default ApplicationsList;
