import React, { useMemo } from "react";
import algosdk from "algosdk";
import chunk from "lodash/chunk.js";
import MultiFormatViewer from "src/components/v2/MultiFormatViewer";
import Copyable from "src/components/v2/Copyable";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "src/components/v2/ui/tooltip";

function Arc28NumericViewer({ value }: { value: string }) {
  const values = useMemo(() => {
    try {
      const data = Buffer.from(value, "base64");
      const lenNoHead = data.length - 4;
      if (lenNoHead % 8 === 0 && lenNoHead > 0) {
        const body = data.slice(4);
        const chunks = chunk(body, 8);
        return chunks.map((c: number[]) =>
          algosdk.decodeUint64(new Uint8Array(Buffer.from(c)), "safe"),
        );
      }
    } catch (e) {}
  }, [value]);

  if (!values) return null;

  return (
    <div className="inline-flex items-center gap-1.5 flex-wrap">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-xs border rounded px-2 py-0.5 border-primary text-primary cursor-default">
              ARC28
            </span>
          </TooltipTrigger>
          <TooltipContent className="bg-black text-white border-border max-w-xs">
            <p>
              algo.surf has partial support for ARC-28 (structured event
              logging). Numeric values (uint64) are automatically detected and
              decoded. Other types are not supported, or may be decoded
              incorrectly.
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {values.map((v, i) => (
        <span key={i} className="inline-flex items-center gap-0.5">
          {v}
          <Copyable style={{ marginLeft: "2px" }} value={v} />
        </span>
      ))}
    </div>
  );
}

function AppCallTxnLogs({ logs }: { logs: string[] }): JSX.Element {
  return (
    <div className="mt-6 rounded-lg p-5 bg-background-card">
      <div className="text-muted-foreground mb-2">Logs</div>
      <div className="space-y-2">
        {logs.map((log, index) => (
          <div key={index} className="flex items-center gap-2 text-[13px]">
            <span className="shrink-0 tabular-nums">{String(index).padStart(2, '0')}.</span>
            <div className="inline-flex items-center gap-2 flex-wrap">
              <MultiFormatViewer includeNum={true} value={log} />
              <Arc28NumericViewer value={log} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default AppCallTxnLogs;
