import {useDispatch, useSelector} from "react-redux";
import {RootState} from "../../redux/store";
import {hideSnack} from '../../redux/common/actions/snackbar';
import {Alert, AlertColor, Snackbar} from "@mui/material";
import {theme} from "../../theme";
import Copyable from "../../components/Common/Copyable/Copyable";

function colorFromSeverity(s: AlertColor): string {
    switch(s) {
        case "error": return theme.palette.error.main;
        case "warning": return theme.palette.warning.main;
        default: return theme.palette.primary.main;
    }
}

function AppSnackbar(): JSX.Element {
    const snackbar = useSelector((state: RootState) => state.snackbar)
    const dispatch = useDispatch();

    const color = colorFromSeverity(snackbar.severity);
    const isError = snackbar.severity === "error";

    // @ts-ignore
    return (<Snackbar
        style={{bottom: 20}}
        open={snackbar.show}
        autoHideDuration={isError ? 10_000 : 5000}
        anchorOrigin={{ vertical: 'bottom',
        horizontal: 'right' }}
        onClose={() => {dispatch(hideSnack())}}>
        <Alert
            sx={{
                borderRadius: '10px',
                paddingTop: '20px',
                paddingBottom: '20px',
                minWidth: '400px',
                borderWidth: '1px',
                borderStyle: 'solid',
                borderColor: color,
                borderLeftWidth: '5px',
                display: 'flex',
            }}
            icon={false}
            severity={snackbar.severity}
            onClose={() => {dispatch(hideSnack())}}
        >
            <div style={{flexGrow: 1}} dangerouslySetInnerHTML={{__html: snackbar.message}}></div>
            <Copyable buttonSize="medium" value={snackbar.message} style={{marginRight: "-13px", marginLeft: "13px", marginTop: "-4px" }}/>
        </Alert>
    </Snackbar>);
}

export default AppSnackbar;
