import React, { Suspense, useState, useCallback, useRef } from "react";
const ReactJson = React.lazy(() => import("react-json-view"));
import { exportData } from "src/utils/common";
import { X } from "lucide-react";
import { useHotkeys } from "react-hotkeys-hook";
import { Button } from "src/components/v2/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "src/components/v2/ui/dialog";

interface JsonViewerState {
  show: boolean;
  expand: boolean;
}

const initialState: JsonViewerState = {
  expand: false,
  show: false,
};

function JsonViewer(props: {
  obj?: () => any;
  filename?: string;
  title?: string;
  size?: "sm" | "default";
  fullWidth?: boolean;
  variant?: "outline" | "default";
}): JSX.Element {
  const {
    obj: getObj = () => ({}),
    filename,
    title = "Raw JSON",
    size = "sm",
    fullWidth = false,
    variant = "outline",
  } = props;

  const dataRef = useRef<any>(null);

  const [{ show, expand, expanding, copied }, setState] = useState({ ...initialState, expanding: false, copied: false });

  const toggle = useCallback(() => {
    setState((prev) => {
      if (!prev.show) dataRef.current = getObj();
      return { ...prev, show: !prev.show };
    });
  }, [getObj]);

  const handleClose = useCallback(() => {
    setState((prev) => ({ ...prev, show: false }));
  }, []);

  const toggleExpand = useCallback(() => {
    setState((prev) => ({ ...prev, expanding: true }));
    setTimeout(() => {
      setState((prev) => ({ ...prev, expand: !prev.expand, expanding: false }));
    }, 5);
  }, []);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(JSON.stringify(dataRef.current ?? {}));
    setState((prev) => ({ ...prev, copied: true }));
    setTimeout(() => setState((prev) => ({ ...prev, copied: false })), 1000);
  }, []);

  const handleDownload = useCallback(() => {
    exportData(dataRef.current ?? {}, filename);
  }, [filename]);

  useHotkeys("j", toggle);
  useHotkeys("e", toggleExpand, { enabled: show });
  useHotkeys("c", handleCopy, { enabled: show });
  useHotkeys("d", handleDownload, { enabled: show });

  return (
    <div>
      <Button
        variant={variant}
        size={size}
        className={`border-border text-primary hover:bg-primary/10 ${fullWidth ? "w-full" : ""}`}
        onClick={() => { dataRef.current = getObj(); setState((prev) => ({ ...prev, show: true })); }}
      >
        <span className="whitespace-nowrap">View&nbsp;<span className="underline">J</span>SON</span>
      </Button>

      <Dialog open={show} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col bg-background-muted text-foreground">
          <DialogHeader>
            <DialogTitle className="text-lg font-normal">{title}</DialogTitle>
          </DialogHeader>

          <div className="text-[13px] flex flex-col min-h-0">
            <div className="flex justify-between border-b border-primary pb-4 mb-4 shrink-0">
              <Button
                variant="outline"
                size="sm"
                className="border-border text-primary hover:bg-primary/10"
                onClick={toggleExpand}
              >
                {expanding ? (expand ? "Collapsing" : "Expanding") : !expand ? <span><u>E</u>xpand All</span> : "Collapse"}
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-border text-primary hover:bg-primary/10"
                  onClick={handleCopy}
                >
                  {copied ? "Copied" : <span><u>C</u>opy</span>}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-border text-primary hover:bg-primary/10"
                  onClick={handleDownload}
                >
                  <span><u>D</u>ownload</span>
                </Button>
              </div>
            </div>

            <div className="overflow-y-auto min-h-0">
              <Suspense fallback={<div className="p-4 text-muted-foreground">Loading...</div>}>
                <ReactJson
                  key={expand ? "expanded" : "collapsed"}
                  src={dataRef.current ?? {}}
                  name={false}
                  displayObjectSize={false}
                  displayDataTypes={false}
                  enableClipboard={false}
                  iconStyle="triangle"
                  groupArraysAfterLength={expand ? 0 : 100}
                  collapsed={expand ? 99 : 1}
                  theme="apathy"
                />
              </Suspense>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default JsonViewer;
