import React, { Suspense, useState, useCallback, useMemo, useRef, useLayoutEffect } from "react";
const ReactJson = React.lazy(() => import("react-json-view"));
import { exportData } from "src/utils/common";
import { X } from "lucide-react";
import { useHotkeys } from "react-hotkeys-hook";
import { Button } from "src/components/v2/ui/button";
import Copyable from "src/components/v2/Copyable";
import {
  ApiService,
  apiRequiresToken,
  getApiCurlCommand,
  getApiUrl,
} from "src/utils/nodeApi";
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

/**
 * Paths (with query) on each service that serve the record being viewed. A key
 * is omitted where no endpoint exists - algod cannot look up a confirmed
 * transaction, and inner transactions are not addressable at all - so nothing
 * is rendered rather than a link that cannot work.
 */
export type JsonViewerApi = { algod?: string; indexer?: string };

const apiServices: ApiService[] = ["algod", "indexer"];

const apiLabel: Record<ApiService, JSX.Element> = {
  algod: <span className="whitespace-nowrap">Open <u>a</u>lgod API</span>,
  indexer: <span className="whitespace-nowrap">Open <u>i</u>ndexer API</span>,
};

const actionClassName = "border-border text-primary hover:bg-primary/10";

function JsonViewer(props: {
  obj?: () => any;
  filename?: string;
  title?: string;
  size?: "sm" | "default";
  fullWidth?: boolean;
  variant?: "outline" | "default";
  /**
   * Identity of the record `obj` reads from. While the viewer is open, changing
   * this re-reads `obj` so the JSON follows the page (e.g. block arrow keys,
   * or the query resolving after a navigation).
   */
  dataKey?: unknown;
  /** REST endpoints serving this record; see JsonViewerApi. */
  api?: JsonViewerApi;
}): JSX.Element {
  const {
    obj: getObj = () => ({}),
    filename,
    title = "Raw JSON",
    size = "sm",
    fullWidth = false,
    variant = "outline",
    dataKey,
    api,
  } = props;

  const [data, setData] = useState<any>(null);
  // Always read through the latest closure; call sites pass a fresh arrow each render.
  const getObjRef = useRef(getObj);
  getObjRef.current = getObj;

  const [{ show, expand, expanding, copied }, setState] = useState({ ...initialState, expanding: false, copied: false });
  // Which service's curl command is being shown, if any.
  const [curlService, setCurlService] = useState<ApiService | null>(null);

  const endpoints = useMemo(
    () =>
      apiServices.flatMap((service) => {
        const path = api?.[service];
        if (!path) return [];
        return [{ service, path, requiresToken: apiRequiresToken(service) }];
      }),
    [api?.algod, api?.indexer]
  );

  const toggle = useCallback(() => {
    setState((prev) => ({ ...prev, show: !prev.show }));
  }, []);

  const handleClose = useCallback(() => {
    setState((prev) => ({ ...prev, show: false }));
    setCurlService(null);
  }, []);

  const toggleExpand = useCallback(() => {
    setState((prev) => ({ ...prev, expanding: true }));
    setTimeout(() => {
      setState((prev) => ({ ...prev, expand: !prev.expand, expanding: false }));
    }, 5);
  }, []);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(JSON.stringify(data ?? {}));
    setState((prev) => ({ ...prev, copied: true }));
    setTimeout(() => setState((prev) => ({ ...prev, copied: false })), 1000);
  }, [data]);

  const handleDownload = useCallback(() => {
    exportData(data ?? {}, filename);
  }, [data, filename]);

  // Keyboard equivalent of clicking an endpoint button.
  const openEndpoint = useCallback(
    (service: ApiService) => {
      const endpoint = endpoints.find((e) => e.service === service);
      if (!endpoint) return;
      if (endpoint.requiresToken) {
        setCurlService(service);
      } else {
        window.open(getApiUrl(service, endpoint.path), "_blank", "noopener,noreferrer");
      }
    },
    [endpoints]
  );

  // Snapshot on open, and refresh whenever the underlying record changes while open.
  useLayoutEffect(() => {
    if (!show) return;
    setData(getObjRef.current());
  }, [show, dataKey]);

  useHotkeys("j", toggle);
  useHotkeys("e", toggleExpand, { enabled: show });
  useHotkeys("c", handleCopy, { enabled: show });
  useHotkeys("d", handleDownload, { enabled: show });
  useHotkeys("a", () => openEndpoint("algod"), { enabled: show && !!api?.algod }, [openEndpoint]);
  useHotkeys("i", () => openEndpoint("indexer"), { enabled: show && !!api?.indexer }, [openEndpoint]);

  const curlPath = curlService ? api?.[curlService] : undefined;

  return (
    <div>
      <Button
        variant={variant}
        size={size}
        className={`${actionClassName} ${fullWidth ? "w-full" : ""}`}
        onClick={() => setState((prev) => ({ ...prev, show: true }))}
      >
        <span className="whitespace-nowrap">View&nbsp;<span className="underline">J</span>SON</span>
      </Button>

      <Dialog open={show} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col bg-background-muted text-foreground">
          <DialogHeader>
            <DialogTitle className="text-lg font-normal">{title}</DialogTitle>
          </DialogHeader>

          <div className="text-[13px] flex flex-col min-h-0">
            <div className="flex flex-wrap justify-between gap-2 border-b border-primary pb-4 mb-4 shrink-0">
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className={actionClassName}
                  onClick={toggleExpand}
                >
                  {expanding ? (expand ? "Collapsing" : "Expanding") : !expand ? <span><u>E</u>xpand All</span> : "Collapse"}
                </Button>

                {endpoints.map(({ service, path, requiresToken }) =>
                  requiresToken ? (
                    // The token travels in a request header, which a browser
                    // navigation cannot set - offer the command instead of a 401.
                    <Button
                      key={service}
                      variant="outline"
                      size="sm"
                      className={actionClassName}
                      onClick={() => setCurlService(service)}
                    >
                      {apiLabel[service]}
                    </Button>
                  ) : (
                    <Button key={service} variant="outline" size="sm" className={actionClassName} asChild>
                      <a
                        href={getApiUrl(service, path)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="no-underline text-inherit"
                      >
                        {apiLabel[service]}
                      </a>
                    </Button>
                  )
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className={actionClassName}
                  onClick={handleCopy}
                >
                  {copied ? "Copied" : <span><u>C</u>opy</span>}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className={actionClassName}
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
                  src={data ?? {}}
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

      <Dialog
        open={!!curlService && !!curlPath}
        onOpenChange={(open) => !open && setCurlService(null)}
      >
        <DialogContent className="max-w-2xl bg-background-muted text-foreground">
          <DialogHeader>
            <DialogTitle className="text-lg font-normal">
              {curlService} API
            </DialogTitle>
          </DialogHeader>

          {curlService && curlPath && (
            // min-w-0 on the grid item: without it the row below is sized by
            // the URL's min-content, which for one long unbreakable token is
            // the whole URL - and the dialog overflows.
            <div className="text-[13px] flex flex-col gap-4 min-w-0">
              <p className="text-muted-foreground m-0">
                This node authenticates with a token sent as a request header, which a
                browser cannot add when following a link. Run this instead:
              </p>

              <div className="flex items-start gap-2 rounded bg-background-card p-3 min-w-0">
                <pre className="m-0 flex-1 min-w-0 whitespace-pre-wrap break-all font-mono">
                  {getApiCurlCommand(curlService, curlPath)}
                </pre>
                <Copyable
                  className="opacity-60 hover:opacity-100 mt-0.5 shrink-0"
                  value={getApiCurlCommand(curlService, curlPath)}
                />
              </div>

              <div className="flex items-start gap-2 min-w-0">
                <span className="text-muted-foreground shrink-0">URL</span>
                <span className="min-w-0 break-all font-mono">
                  {getApiUrl(curlService, curlPath)}
                </span>
                <Copyable
                  className="opacity-60 hover:opacity-100 shrink-0"
                  value={getApiUrl(curlService, curlPath)}
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default JsonViewer;
