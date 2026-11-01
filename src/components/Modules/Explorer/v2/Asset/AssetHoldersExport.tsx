import { useCallback, useEffect, useRef, useState } from "react";
import { decodeAddress } from "algosdk";
import { Download } from "lucide-react";
import { Button } from "src/components/v2/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "src/components/v2/ui/dialog";
import MultiDateViewer from "src/components/v2/MultiDateViewer";
import { useBlockHeader } from "src/hooks/useBlock";
import { CoreBlock } from "src/packages/core-sdk/classes/core/CoreBlock";
import { formatUnits } from "src/utils/formatUnits";
import { getAssetHoldersPage, getSearchDelayMs, HOLDERS_BATCH_SIZE, TTAssetHolder } from "src/utils/timeTravel";


const actionClassName = "border-border text-primary hover:bg-primary/10";

type Status = "idle" | "running" | "failed" | "done";

type Progress = {
  status: Status;
  /** Accounts the node listed (opted in), and of them the rows written. */
  read: number;
  written: number;
  /** How far through the address space the export is, 0 to 1. */
  fraction: number;
  error?: string;
};

const initial: Progress = { status: "idle", read: 0, written: 0, fraction: 0 };

/**
 * Where `address` is in the address space, 0 to 1. Holders come in address
 * order, and addresses are public keys spread evenly over it, so for an asset
 * with many holders this is about the share of them read so far.
 */
function addressFraction(address: string): number {
  try {
    const key = decodeAddress(address).publicKey;
    // The first 6 bytes: as fine as a float holds.
    let n = 0;
    for (let i = 0; i < 6; i++) n = n * 256 + key[i];
    return n / 2 ** 48;
  } catch {
    return 0;
  }
}

function csvRow(h: TTAssetHolder, decimals: number): string {
  return `${h.address},${h.amount},${formatUnits(h.amount, decimals, "")},${h.frozen}\n`;
}

/**
 * Exports an asset's holders at `round` to CSV: every batch read from the
 * time-travel node in turn (separately from the list on the page), with
 * progress, cancelled on close and resumed after a failure where it stopped.
 */
export default function AssetHoldersExport({
  assetId,
  round,
  decimals,
  unit,
  hideOptins,
}: {
  assetId: number;
  round: number;
  decimals: number;
  /** The asset's unit name, if any: in the dialog and the filename. */
  unit?: string;
  /** The list's own setting: the export starts with it. */
  hideOptins: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [skipOptins, setSkipOptins] = useState(hideOptins);
  const [progress, setProgress] = useState<Progress>(initial);
  // The run: what it has written, where it stopped (or that it read the last
  // page), and how to stop it.
  const run = useRef<{ chunks: string[]; next?: string; complete?: boolean; abort: AbortController } | null>(null);
  const [fileUrl, setFileUrl] = useState<string>();
  // The file's URL also in a ref, so it is let go of on unmount too, when no state update runs.
  const fileUrlRef = useRef<string>();

  // Only characters every file system takes.
  const fileUnit = unit?.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^[._]+|_+$/g, "");
  const filename = `asset-${assetId}${fileUnit ? `-${fileUnit}` : ""}-holders-block-${round}${skipOptins ? "" : "-with-optins"}.csv`;
  // The block's time, once the dialog is open.
  const { data: header } = useBlockHeader(open ? round : 0);
  const blockTime = header ? new CoreBlock(header).getTimestamp() : undefined;

  const download = useCallback(
    (url: string) => {
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
    },
    [filename],
  );

  const stop = useCallback(() => {
    run.current?.abort.abort();
    run.current = null;
  }, []);

  const clearFile = useCallback(() => {
    if (fileUrlRef.current) URL.revokeObjectURL(fileUrlRef.current);
    fileUrlRef.current = undefined;
    setFileUrl(undefined);
  }, []);

  // Reads on from where the run stopped (from the start for a new one).
  const resume = useCallback(async () => {
    const current = run.current;
    if (!current) return;
    const { signal } = current.abort;
    setProgress((p) => ({ ...p, status: "running", error: undefined }));
    try {
      // A retry after the last page (the file failed) reads nothing again.
      while (!current.complete) {
        const page = await getAssetHoldersPage(assetId, { round, next: current.next, limit: HOLDERS_BATCH_SIZE }, signal);
        let written = 0;
        for (const h of page.holders) {
          if (skipOptins && BigInt(h.amount) === 0n) continue;
          current.chunks.push(csvRow(h, decimals));
          written++;
        }
        current.next = page.nextToken;
        if (signal.aborted) return;
        setProgress((p) => ({
          ...p,
          read: p.read + page.holders.length,
          written: p.written + written,
          fraction: current.next ? Math.max(p.fraction, addressFraction(current.next)) : 1,
        }));
        if (!current.next) {
          current.complete = true;
          break;
        }
        const delay = getSearchDelayMs();
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
        if (signal.aborted) return;
      }
      const url = URL.createObjectURL(new Blob(current.chunks, { type: "text/csv" }));
      run.current = null;
      fileUrlRef.current = url;
      setFileUrl(url);
      setProgress((p) => ({ ...p, status: "done" }));
      download(url);
    } catch (e) {
      if (signal.aborted) return;
      setProgress((p) => ({ ...p, status: "failed", error: (e as Error).message }));
    }
  }, [assetId, round, decimals, skipOptins, download]);

  const start = useCallback(() => {
    stop();
    clearFile();
    run.current = { chunks: ["address,amount,balance,frozen\n"], abort: new AbortController() };
    setProgress({ ...initial, status: "running" });
    resume();
  }, [stop, clearFile, resume]);

  // Closing (or leaving the page) cancels a run and lets go of its file.
  const close = useCallback(() => {
    stop();
    clearFile();
    setProgress(initial);
    setOpen(false);
  }, [stop, clearFile]);
  useEffect(() => () => stop(), [stop]);
  useEffect(() => () => clearFile(), [clearFile]);

  const { status, read, written, fraction, error } = progress;
  const percent = Math.floor(fraction * 1000) / 10;
  const busy = status === "running";

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className={actionClassName}
        onClick={() => {
          setSkipOptins(hideOptins);
          setOpen(true);
        }}
      >
        <Download />
        <span className="md:hidden">CSV</span>
        <span className="hidden md:inline">Export CSV</span>
      </Button>
      <Dialog open={open} onOpenChange={(o) => !o && close()}>
        <DialogContent className="bg-background-muted text-foreground">
          <DialogHeader>
            <DialogTitle className="text-lg font-normal">Export holders</DialogTitle>
            <DialogDescription>
              Every holder of asset {assetId}
              {unit ? ` (${unit})` : ""} at the block below, in address order: address, amount in base units, balance
              in the asset's decimals, and whether it is frozen.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <span className="text-muted-foreground">Block</span>
            <span>
              {/* Not a link: leaving the page would cancel the export. */}
              {round}
            </span>
            <span className="text-muted-foreground">Time</span>
            <span>
              {blockTime !== undefined ? <MultiDateViewer timestamp={blockTime} variant="value" noBlock noCopy /> : "…"}
            </span>
          </div>

          <label className={`flex items-center gap-2 text-sm text-muted-foreground ${status === "idle" ? "cursor-pointer" : "opacity-60"}`}>
            <input
              type="checkbox"
              className="accent-primary"
              checked={skipOptins}
              disabled={status !== "idle"}
              onChange={(e) => setSkipOptins(e.target.checked)}
            />
            Hide optins
          </label>

          {status !== "idle" ? (
            <div className="flex flex-col gap-2 text-sm">
              <div className="h-2 w-full overflow-hidden rounded bg-border">
                <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${percent}%` }} />
              </div>
              <div className="flex flex-wrap justify-between gap-2 text-muted-foreground">
                <span>
                  {written.toLocaleString()} {written === 1 ? "row" : "rows"}
                  {skipOptins ? ` (${read.toLocaleString()} opted in)` : ""}
                </span>
                {/* An estimate from the addresses read so far (see addressFraction). */}
                <span title="Estimated from how far through the address space the export is">
                  {status === "done" ? "Done" : `~${percent.toLocaleString()}%`}
                </span>
              </div>
              {error ? <div className="text-red-400">Stopped: {error}</div> : null}
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            {status === "idle" ? (
              <Button variant="outline" size="sm" className={actionClassName} onClick={start}>
                Start export
              </Button>
            ) : null}
            {busy ? (
              <Button variant="outline" size="sm" className={actionClassName} onClick={close}>
                Cancel
              </Button>
            ) : null}
            {status === "failed" ? (
              <Button variant="outline" size="sm" className={actionClassName} onClick={resume}>
                Retry
              </Button>
            ) : null}
            {status === "done" && fileUrl ? (
              <Button variant="outline" size="sm" className={actionClassName} onClick={() => download(fileUrl)}>
                <Download />
                Download again
              </Button>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
