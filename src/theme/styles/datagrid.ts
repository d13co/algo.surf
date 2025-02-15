import {theme} from "../index";
import {shadedClr,shadedClr1} from "../../utils/common";

export const dataGridCellConfig = {
    sortable: false,
    editable: false,
    flex: 1,
    disableColumnMenu: true,
};

export const dataGridStyles = {
    '.MuiDataGrid-columnSeparator': {
        display: 'none',
    },
    // '.MuiDataGrid-row:nth-of-type(even)': {
    //     backgroundColor: shadedClr
    // },
    // '.MuiDataGrid-row': {
    //     background: theme.palette.background.default,
    // },
    '.MuiDataGrid-row:hover': {
        filter: 'brightness(110%)',
    },
    '.MuiDataGrid-cell:focus': {
        outline: "none"
    },
    '.MuiDataGrid-columnHeader:focus': {
        outline: "none"
    },
    '.MuiDataGrid-columnHeader': {
        background: theme.palette.primary.dark,
        color: theme.palette.primary.contrastText
    }
};

export const dataGridStylesBlackHeader = {
    ...dataGridStyles,
    '.MuiDataGrid-columnHeader': {
        background: shadedClr1,
        color: theme.palette.common.white
    }
};
