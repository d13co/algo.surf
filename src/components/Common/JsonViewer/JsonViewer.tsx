import "./JsonViewer.scss";
import React, { useState, useRef } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
} from "@mui/material";
import ReactJson from "react-json-view";
import { copyContent, exportData } from "../../../utils/common";
import { useDispatch } from "react-redux";
import CloseIcon from "@mui/icons-material/Close";
import { useHotkeys } from "react-hotkeys-hook";
import { showSnack } from "../../../redux/common/actions/snackbar";

interface JsonViewerState {
  show: boolean;
}
const initialState: JsonViewerState & { expand: boolean } = {
  expand: false,
  show: false,
};

function JsonViewer(props): JSX.Element {
  const {
    obj = {},
    filename,
    title = "Raw JSON",
    size,
    fullWidth = false,
    variant = "outlined",
  } = props;

  const [{ show, expand }, setState] = useState(initialState);
  const dispatch = useDispatch();
  const expandButtonRef = useRef<HTMLButtonElement>();

  const toggle = React.useCallback(() => {
    setState((prevState) => ({ ...prevState, show: !prevState.show }));
  }, []);

  const handleClose = React.useCallback(() => {
    setState((prevState) => ({ ...prevState, show: false }));
  }, []);

  const toggleExpand = React.useCallback(() => {
    if (expandButtonRef?.current) {
      expandButtonRef.current.innerHTML = expand ? "Collapsing" : "Expanding";
    }

    setTimeout(() => {
      setState((prevState) => {
        return { ...prevState, expand: !prevState.expand };
      });
    }, 5);

    setTimeout(() => {
      if (expandButtonRef?.current) {
        expandButtonRef.current.innerHTML = expand
          ? "(E)xpand All"
          : "Collapse";
        // @ts-ignore
        document.querySelector(".MuiDialogContent-root")?.focus();
      }
    }, 10);
  }, [expand]);

  const handleCopy = React.useCallback(
    (ev) => {
      copyContent(ev, dispatch, JSON.stringify(obj), "JSON Copied");
    },
    [dispatch, obj],
  );

  const handleDownload = React.useCallback(() => {
    exportData(obj, filename);
    dispatch(
      showSnack({
        severity: "success",
        message: "JSON Downloaded",
      }),
    );
  }, [filename, obj, dispatch]);

  useHotkeys("j", toggle);
  useHotkeys("e", toggleExpand);
  useHotkeys("c", handleCopy);
  useHotkeys("d", handleDownload);

  return (
    <div className={"json-viewer-wrapper"}>
      <div className={"json-viewer-container"}>
        <Button
          variant={variant}
          size={size}
          fullWidth={fullWidth}
          onClick={() => {
            setState((prevState) => ({ ...prevState, show: true }));
          }}
        >
          View&nbsp;<span className="underline">J</span>SON
        </Button>

        {show ? (
          <Dialog
            onClose={handleClose}
            fullWidth={true}
            maxWidth={"md"}
            open={show}
          >
            <DialogTitle sx={{ backgroundColor: "rgb(3, 26, 22)" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontWeight: "bold", fontSize: 18 }}>
                    {title}
                  </div>
                </div>
                <div>
                  <CloseIcon
                    className="modal-close-button"
                    onClick={handleClose}
                  />
                </div>
              </div>
            </DialogTitle>
            <DialogContent sx={{ backgroundColor: "rgb(3, 26, 22)" }}>
              <div className="json-viewer-content">
                <div className="json-viewer-content-header">
                  <Button
                    ref={expandButtonRef}
                    variant={"outlined"}
                    size={"small"}
                    color={"primary"}
                    onClick={toggleExpand}
                  >
                    {!expand ? `(E)xpand All` : `Collapse`}
                  </Button>

                  <div>
                    <Button
                      variant={"outlined"}
                      size={"small"}
                      color={"primary"}
                      onClick={handleCopy}
                    >
                      (C)opy
                    </Button>

                    <Button
                      variant={"outlined"}
                      size={"small"}
                      style={{ marginLeft: 10 }}
                      color={"primary"}
                      onClick={handleDownload}
                    >
                      (D)ownload
                    </Button>
                  </div>
                </div>

                <ReactJson
                  src={obj}
                  name={false}
                  displayObjectSize={false}
                  displayDataTypes={false}
                  enableClipboard={false}
                  iconStyle={"triangle"}
                  groupArraysAfterLength={expand ? 0 : 100}
                  collapsed={expand ? 99 : 1}
                  theme="apathy"
                />
              </div>
            </DialogContent>
            <DialogActions></DialogActions>
          </Dialog>
        ) : (
          ""
        )}
      </div>
    </div>
  );
}

export default JsonViewer;
