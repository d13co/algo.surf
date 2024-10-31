import copy from "copy-to-clipboard";
import {showSnack} from "../redux/common/actions/snackbar";
import {theme, shadedClr, shadedClr1, shadedClr2} from "../theme";

export {shadedClr} from '../theme';
export {shadedClr1} from '../theme';
export {shadedClr2} from '../theme';

export function microalgosToAlgos(n) {
    return n / 1e6;
}

export function copyContent(ev, dispatch, content: string, message: string) {
    copy(content, {
        message: 'Press #{key} to copy',
    });
    ev.preventDefault();
    ev.stopPropagation();
    dispatch(showSnack({
        severity: 'success',
        message
    }));
}

export function isNumber(n: any) {
    return !isNaN(parseFloat(n)) && isFinite(n);
}

export function exportData(data: JSON) {
    const jsonString = `data:text/json;chatset=utf-8,${encodeURIComponent(
        JSON.stringify(data)
    )}`;
    const link = document.createElement("a");
    link.href = jsonString;
    link.download = "data.json";
    link.click();
}
