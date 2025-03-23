import "./AppCallTxnLogs.scss";
import React, { useState } from "react";
import { Button, ButtonGroup, Chip, Tooltip } from "@mui/material";
import atob from "atob";
import { shadedClr } from "../../../../../../../../../utils/common";
import MultiFormatViewer from "../../../../../../../../Common/MultiFormatViewer/MultiFormatViewer";
import algosdk from "algosdk";
import chunk from "lodash/chunk.js";
import Copyable from "../../../../../../../../Common/Copyable/Copyable";

enum TEXT_ENCODING {
  BASE64 = "base64",
  TEXT = "text",
  NUM = "num",
}

interface AppCallTxnLogsState {
  textEncoding: string;
}

const initialState: AppCallTxnLogsState = {
  textEncoding: TEXT_ENCODING.BASE64,
};

function parseNum(base64: string) {
  return parseInt(Buffer.from(base64, "base64").toString("hex"), 16);
}

function AppCallTxnLogs(props): JSX.Element {
  let logs: string[] = props.logs;

  const [{ textEncoding }, setState] = useState(initialState);

  function setTextEncoding(encoding: string) {
    setState((prevState) => ({ ...prevState, textEncoding: encoding }));
  }

  return (
    <div className={"app-call-txn-logs-wrapper"}>
      <div className={"app-call-txn-logs-container"}>
        <div className="props" style={{ background: shadedClr }}>
          <div className="property">
            <div className="key">Logs</div>
            <ol start={0} className="small">
              {logs.map((log, index) => {
                return (
                  <li key={index} className="item">
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                      }}
                    >
                      <MultiFormatViewer includeNum={true} value={log} />
                      <Arc28NumericViewer value={log} />
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

function Arc28NumericViewer({ value }: { value: string }) {
  const values = React.useMemo(() => {
    try {
      const data = Buffer.from(value, "base64");
      const lenNoHead = data.length - 4;
      if (lenNoHead % 8 === 0 && lenNoHead > 0) {
        const body = data.slice(4);
        const chunks = chunk(body, 8);
        return chunks.map((c) =>
          algosdk.decodeUint64(new Uint8Array(Buffer.from(c)), "safe")
        );
      }
    } catch (e) {}
  }, [value]);
  return values ? (
    <div className="arc28">
      <Tooltip
        title={`algo.surf has partial support for ARC-28 (structured event logging). Numeric values (uint64) are automatically detected and decoded. Other types are not supported, or may be decoded incorrectly.`}
      >
        <Chip
          className="title"
          label="ARC28"
          color={"primary"}
          variant="outlined"
          size="small"
        />
      </Tooltip>
      {values.map((value) => (
        <NumberCopy value={value} />
      ))}
    </div>
  ) : null;
}

function NumberCopy({ value }: { value: number }) {
  return (
    <div className="nc-flex">
      {value} <Copyable style={{ marginLeft: "2px" }} value={value} />
    </div>
  );
}

export default AppCallTxnLogs;
