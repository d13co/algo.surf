import React, {useState, useEffect, useCallback} from "react";
import IconButton from '@mui/material/IconButton';
import { Binary, Type } from 'lucide-react';
import FormatBoldOutlinedIcon from '@mui/icons-material/FormatBoldOutlined';
import './MultiFormatViewer.scss';
import Copyable from '../../../components/Common/Copyable/Copyable';
import { Tooltip } from "@mui/material";
import isUtf8 from 'is-utf8';

type View = 'utf8' | 'base64' | 'auto';

interface MultiFormatViewerProps {
    view?: View;
    value: string;
    style?: Record<string, any>;
}

const defaultStyle = { marginLeft: '6px' };

const niceNames = {
    utf8: "Text (UTF-8)",
    base64: "Base 64",
}

function getDefaultView(view: View, value: string): View {
    if (view === "auto") {
        if (isUtf8(Buffer.from(value, 'base64'))) {
            return "utf8";
        } else {
            return "base64";
        }
    }
    return view;
}

export default function MultiFormatViewer(props: MultiFormatViewerProps): JSX.Element {
    const { value, view: defaultView = 'auto', style = defaultStyle, } = props;

    const [view, setView] = useState(getDefaultView(defaultView, value));
    const [displayValue, setDisplayValue] = useState<string>();

    const changeView = useCallback((_, nextView) => {
        if (nextView) 
            setView(nextView)
    }, []);

    const otherView = view === "utf8" ? "base64" : "utf8";

    useEffect(() => {
        if (view === 'utf8') {
            setDisplayValue(atob(value));
        } else {
            setDisplayValue(value);
        }
    }, [value, view]);

    return <div className="HFlex dimparent">
        {displayValue}
        <span className="nowrap dim">
            <Copyable style={style} value={displayValue} />
            <Tooltip title={`Showing ${niceNames[view]}. Click to show ${niceNames[otherView]}`}>
                <IconButton size="small" onClick={() => changeView(null, otherView)} style={{fontSize: "10px"}}>
                    { view === "utf8" ? <Type size={16} /> : <Binary size={16} /> }
                </IconButton>
            </Tooltip>
        </span>
    </div>;
}
