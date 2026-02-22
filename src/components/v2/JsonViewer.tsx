import React, { useState, useRef, useCallback } from "react";
import ReactJson from "react-json-view";
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
  obj?: any;
  filename?: string;
  title?: string;
  size?: "sm" | "default";
  fullWidth?: boolean;
  variant?: "outline" | "default";
}): JSX.Element {
  const {
    obj = {},
    filename,
    title = "Raw JSON",
    size = "sm",
    fullWidth = false,
    variant = "outline",
  } = props;

  const [{ show, expand }, setState] = useState(initialState);
  const expandButtonRef = useRef<HTMLButtonElement>(null);

  const toggle = useCallback(() => {
    setState((prev) => ({ ...prev, show: !prev.show }));
  }, []);

  const handleClose = useCallback(() => {
    setState((prev) => ({ ...prev, show: false }));
  }, []);

  const toggleExpand = useCallback(() => {
    if (expandButtonRef?.current) {
      expandButtonRef.current.innerHTML = expand ? "Collapsing" : "Expanding";
    }
    setTimeout(() => {
      setState((prev) => ({ ...prev, expand: !prev.expand }));
    }, 5);
    setTimeout(() => {
      if (expandButtonRef?.current) {
        expandButtonRef.current.innerHTML = expand
          ? "(E)xpand All"
          : "Collapse";
      }
    }, 10);
  }, [expand]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(JSON.stringify(obj));
  }, [obj]);

  const handleDownload = useCallback(() => {
    exportData(obj, filename);
  }, [filename, obj]);

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
        onClick={() => setState((prev) => ({ ...prev, show: true }))}
      >
        <span>View&nbsp;<span className="underline">J</span>SON</span>
      </Button>

      <Dialog open={show} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col bg-background-muted border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">{title}</DialogTitle>
          </DialogHeader>

          <div className="text-[13px] flex flex-col min-h-0">
            <div className="flex justify-between border-b border-primary pb-4 mb-4 shrink-0">
              <Button
                ref={expandButtonRef}
                variant="outline"
                size="sm"
                className="border-border text-primary hover:bg-primary/10"
                onClick={toggleExpand}
              >
                {!expand ? "(E)xpand All" : "Collapse"}
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-border text-primary hover:bg-primary/10"
                  onClick={handleCopy}
                >
                  (C)opy
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-border text-primary hover:bg-primary/10"
                  onClick={handleDownload}
                >
                  (D)ownload
                </Button>
              </div>
            </div>

            <div className="overflow-y-auto min-h-0">
              <ReactJson
                key={expand ? "expanded" : "collapsed"}
                src={obj}
                name={false}
                displayObjectSize={false}
                displayDataTypes={false}
                enableClipboard={false}
                iconStyle="triangle"
                groupArraysAfterLength={expand ? 0 : 100}
                collapsed={expand ? 99 : 1}
                theme="apathy"
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default JsonViewer;
