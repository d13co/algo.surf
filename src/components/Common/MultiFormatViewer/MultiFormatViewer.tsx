import { encodeAddress, decodeUint64 } from 'algosdk';
import { theme } from "../../../theme/index";
import React, {useState, useMemo, useEffect, useCallback} from "react";
import IconButton from '@mui/material/IconButton';
import { BookUser, Binary, Type, Hash } from 'lucide-react';
import FormatBoldOutlinedIcon from '@mui/icons-material/FormatBoldOutlined';
import './MultiFormatViewer.scss';
import Copyable from '../../../components/Common/Copyable/Copyable';
import { Tooltip } from "@mui/material";
import isUtf8 from 'is-utf8';

type View = 'utf8' | 'base64' | 'auto' | 'num' | 'address';

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
    address: "Address",
}

function isUint64(value: string) {
    try {
        decodeUint64(Buffer.from(value, "base64"), "safe");
        return true;
    } catch(e) {
        return false;
    }
}

function getDefaultView(view: View, value: string, hasNum: undefined | boolean, isAddress: undefined | boolean): View {
    if (view === "auto") {
        const buffer = Buffer.from(value, 'base64');
        if (isUtf8(buffer)) {
            return "utf8";
        } else if (hasNum !== false && isUint64(value)) {
            return 'num';
        } else if (isAddress) {
            return "address";
        } else {
            return "base64";
        }
    }
    return view;
}

const possibleViews = ['utf8', 'base64', 'num', 'address'];

export default function MultiFormatViewer(props: MultiFormatViewerProps): JSX.Element {
    const { value, view: defaultView = 'auto', includeNum = false, style = defaultStyle, } = props;

    const hasNum = useMemo(() => {
        if (includeNum === true) return true;
        if (includeNum === false) return false;
        if (isUint64(value)) return true;
        // can also be undefined
    }, [includeNum, value]);

    const isAddress = useMemo(() => {
        const buffer = Buffer.from(value, 'base64');
        if (buffer.length === 32) {
            return true;
        }
        if (buffer.length > 32) {
            const prefixLen = buffer.length - 32;
            const prefix = buffer.slice(0, prefixLen);
            if (isUtf8(prefix)) {
                return true;
            }
        }
    }, [value]);

    const [view, setView] = useState(getDefaultView(defaultView, value, hasNum, isAddress));
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
        if (view === 'address') {
            const buffer = Buffer.from(value, 'base64');
            if (buffer.length === 32) {
                setDisplayValue(encodeAddress(buffer));
            } else {
                const addrStart = buffer.length - 32;
                const prefix = buffer.slice(0, addrStart).toString();
                const address = encodeAddress(buffer.slice(addrStart));
                setDisplayValue(`${prefix} ${address}`);
            }
        } else if (view === 'utf8') {
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
                        view === "num" ? <Hash size={16} color={theme.palette.primary.main} /> : (
                            view === "address" ? <BookUser size={16} /> : <Binary size={16} />
                        )
                    ) }
                </IconButton>
            </Tooltip>
            <Copyable style={style} value={displayValue} />
        </span>
    </div>;
}
