import { decodeUint64 } from 'algosdk';
import { theme } from "../../../theme/index";
import React, {useState, useMemo, useEffect, useCallback} from "react";
import IconButton from '@mui/material/IconButton';
import { Binary, Type, Tally5 } from 'lucide-react';
import FormatBoldOutlinedIcon from '@mui/icons-material/FormatBoldOutlined';
import './MultiFormatViewer.scss';
import Copyable from '../../../components/Common/Copyable/Copyable';
import { Tooltip } from "@mui/material";
import isUtf8 from 'is-utf8';

type View = 'utf8' | 'base64' | 'auto' | 'num';

interface MultiFormatViewerProps {
    view?: View;
    value: string;
    includeNum?: true | "auto";
    style?: Record<string, any>;
}

const defaultStyle = { marginLeft: '6px' };

const niceNames = {
    utf8: "Text (UTF-8)",
    num: "Numeric",
    base64: "Base 64",
}

function isUint64(value: string) {
    try {
        decodeUint64(Buffer.from(value, "base64"), "safe");
        return true;
    } catch(e) {
        return false;
    }
}

function getDefaultView(view: View, value: string, hasNum: undefined | boolean): View {
    if (view === "auto") {
        if (isUtf8(Buffer.from(value, 'base64'))) {
            return "utf8";
        } else if (hasNum !== false && isUint64(value)) {
            return 'num';
        } else {
            return "base64";
        }
    }
    return view;
}

const possibleViews = ['utf8', 'base64', 'num'];

export default function MultiFormatViewer(props: MultiFormatViewerProps): JSX.Element {
    const { value, view: defaultView = 'auto', includeNum = false, style = defaultStyle, } = props;

    const hasNum = useMemo(() => {
        if (includeNum === true) return true;
        if (includeNum === false) return false;
        if (isUint64(value)) return true;
        // can also be undefined
    }, [includeNum, value]);

    const [view, setView] = useState(getDefaultView(defaultView, value, hasNum));
    const [displayValue, setDisplayValue] = useState<string>();

    const changeView = useCallback((_, nextView) => {
        if (nextView) 
            setView(nextView)
    }, []);

    const nextView = React.useMemo(() => {
        const currentViewIndex = possibleViews.indexOf(view);
        let nextViewIndex = (currentViewIndex + 1) % possibleViews.length
        while(true) {
            if (possibleViews[nextViewIndex] === "num" && !hasNum) {
                nextViewIndex = (nextViewIndex + 1) % possibleViews.length;
            } else {
                return possibleViews[nextViewIndex];
            }
        }
    }, [view, hasNum]);

    useEffect(() => {
        if (view === 'utf8') {
            setDisplayValue(atob(value));
        } else if (view === 'num') {
            setDisplayValue(String(
                parseInt(Buffer.from(value, 'base64').toString('hex'), 16)
            ));
        } else {
            setDisplayValue(value);
        }
    }, [value, view]);

    return <div className="HFlex dimparent">
        {displayValue}
        <span className="nowrap dim">
            <Tooltip title={`Showing ${niceNames[view]}. Click to show ${niceNames[nextView]}`}>
                <IconButton size="small" onClick={() => changeView(null, nextView)} style={{opacity: view === "num" ? 1 : undefined, marginLeft: "8px", marginRight: "-4px", fontSize: "10px"}}>
                    { view === "utf8" ? <Type size={16} /> : (
                        view === "num" ? <Tally5 size={16} color={theme.palette.primary.main} /> :
                        <Binary size={16} />
                    ) }
                </IconButton>
            </Tooltip>
            <Copyable style={style} value={displayValue} />
        </span>
    </div>;
}
