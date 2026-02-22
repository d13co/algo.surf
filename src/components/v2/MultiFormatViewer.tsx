import { encodeAddress, decodeUint64 } from "algosdk";
import React, { useState, useMemo, useEffect, useCallback } from "react";
import { BookUser, Binary, Type, Hash } from "lucide-react";
import Copyable from "src/components/v2/Copyable";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "src/components/v2/ui/tooltip";
import isUtf8 from "is-utf8";

type View = "utf8" | "base64" | "auto" | "num" | "address";

interface MultiFormatViewerProps {
  view?: View;
  value: string;
  includeNum?: true | "auto";
  style?: Record<string, any>;
  outerStyle?: Record<string, any>;
  side?: "left" | "right";
}

const defaultStyle = { marginLeft: "6px", marginRight: "6px" };

const niceNames: Record<string, string> = {
  utf8: "Text (UTF-8)",
  num: "Numeric",
  base64: "Base 64",
  address: "Address",
};

function isUint64(value: string) {
  try {
    decodeUint64(new Uint8Array(Buffer.from(value, "base64")), "safe");
    return true;
  } catch (e) {
    return false;
  }
}

function getDefaultView(
  view: View,
  value: string,
  hasNum: undefined | boolean,
  isAddress: undefined | boolean
): View {
  if (view === "auto") {
    const buffer = Buffer.from(value, "base64");
    if (isUtf8(buffer)) {
      return "utf8";
    } else if (hasNum !== false && isUint64(value)) {
      return "num";
    } else if (isAddress) {
      return "address";
    } else {
      return "base64";
    }
  }
  return view;
}

const possibleViews = ["utf8", "address", "base64", "num"];

export default function MultiFormatViewer(
  props: MultiFormatViewerProps
): JSX.Element {
  const {
    value,
    side = "right",
    view: defaultView = "auto",
    includeNum = false,
    style = defaultStyle,
    outerStyle,
  } = props;

  const hasNum = useMemo(() => {
    if (includeNum === true) return true;
    if (includeNum === false) return false;
    if (isUint64(value)) return true;
  }, [includeNum, value]);

  const isAddress = useMemo(() => {
    if (!value) return false;
    const buffer = Buffer.from(value, "base64");
    if (buffer.length === 32) return true;
    if (buffer.length > 32) {
      const prefixLen = buffer.length - 32;
      const prefix = buffer.slice(0, prefixLen);
      if (isUtf8(prefix)) return true;
    }
  }, [value]);

  const [view, setView] = useState(
    getDefaultView(defaultView, value, hasNum, isAddress)
  );
  const [displayValue, setDisplayValue] = useState<string>();

  // Sync view state when the prop-driven default changes
  useEffect(() => {
    setView(getDefaultView(defaultView, value, hasNum, isAddress));
  }, [defaultView, value]);

  const nextView = useMemo(() => {
    const currentViewIndex = possibleViews.indexOf(view);
    let nextViewIndex = (currentViewIndex + 1) % possibleViews.length;
    while (true) {
      if (
        (possibleViews[nextViewIndex] === "num" && !hasNum) ||
        (possibleViews[nextViewIndex] === "address" && !isAddress)
      ) {
        nextViewIndex = (nextViewIndex + 1) % possibleViews.length;
      } else {
        return possibleViews[nextViewIndex];
      }
    }
  }, [view, hasNum, isAddress]);

  useEffect(() => {
    if (view === "address") {
      const buffer = Buffer.from(value, "base64");
      if (buffer.length === 32) {
        setDisplayValue(encodeAddress(new Uint8Array(buffer)));
      } else {
        const addrStart = buffer.length - 32;
        const prefix = buffer.slice(0, addrStart).toString();
        const address = encodeAddress(new Uint8Array(buffer.slice(addrStart)));
        setDisplayValue(`${prefix} ${address}`);
      }
    } else if (view === "utf8") {
      try {
        setDisplayValue(atob(value));
      } catch (e) {
        setDisplayValue(Buffer.from(value, "base64").toString("utf8"));
      }
    } else if (view === "num") {
      setDisplayValue(
        String(parseInt(Buffer.from(value, "base64").toString("hex"), 16))
      );
    } else {
      setDisplayValue(value);
    }
  }, [value, view]);

  if (!value) return null;

  const rside = side === "right";
  const rightStyle = style;
  const leftStyle = {
    marginLeft: rside ? "8px" : "-4px",
    marginRight: "-4px",
  };

  return (
    <div className="group whitespace-normal" style={outerStyle}>
      {rside ? (
        <span style={{ wordBreak: "break-all" }}>{displayValue}</span>
      ) : null}
      {!rside ? (
        <Copyable
          className="opacity-60 group-hover:opacity-100"
          style={leftStyle}
          value={displayValue}
        />
      ) : null}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center justify-center p-[5px] align-middle opacity-60 group-hover:opacity-100 cursor-pointer"
              onClick={() => setView(nextView as View)}
              style={!rside ? rightStyle : leftStyle}
            >
              {view === "utf8" ? (
                <Type size={16} />
              ) : view === "num" ? (
                <Hash size={16} className="text-primary" />
              ) : view === "address" ? (
                <BookUser size={16} />
              ) : (
                <Binary size={16} />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent className="bg-black text-white border-border">
            Showing {niceNames[view]}. Click to show {niceNames[nextView]}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {rside ? (
        <Copyable
          className="opacity-60 group-hover:opacity-100"
          style={rightStyle}
          value={displayValue}
        />
      ) : null}
      {!rside ? (
        <span style={{ wordBreak: "break-all" }}>{displayValue}</span>
      ) : null}
    </div>
  );
}
