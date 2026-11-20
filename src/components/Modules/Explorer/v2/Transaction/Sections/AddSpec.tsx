import React, { useRef, useState } from "react";
import { FileCode2, FilePlus2, Upload, X } from "lucide-react";
import { cn } from "src/lib/utils";
import { isSourceName, specSourcePaths, type Note } from "src/utils/sourceFiles";
import type { SpecRecord } from "src/utils/specStore";
import { readAddedFiles, readSpecFiles, type ReadFile, type SpecInput } from "src/utils/traceSpecs";
import type { Frame } from "src/utils/traceStepper";
import type { Added, TraceSource } from "./useTraceSource";

/**
 * The source panel's bar: the TypeScript / TEAL switch for a program with a
 * spec with source lines (a spec without them only names things), else "Add ARC-56 spec" (a drop zone and a paste box), specs saved
 * for an older version of the app to try, and the saved specs to remove.
 * A saved spec takes more files ("Add files"): its `.puya.map`s and its
 * source files, from files or a folder.
 */

const appName = (m: { appId?: number }) => (m.appId ? `app ${m.appId}'s` : "this app's");

type Msg = Note;

/** What a match result says, one line per program. */
function matchLines(ms: Added[], spec?: SpecInput): Msg[] {
  if (!ms.length) return [{ text: "This run has no program disassembly to match with.", bad: true }];
  const out: Msg[] = [];
  for (const m of ms) {
    const r = m.result;
    const prog = m.current ? `${appName(m)} ${m.kind} program` : `its ${m.kind} program`;
    if ("mismatch" in r) {
      out.push({ text: `Doesn't match ${prog}: ${r.mismatch}.`, bad: m.current });
      continue;
    }
    const exact = r.exact ? ", exactly (the same bytecode)" : "";
    const bare = r.lines.length ? "" : "; its TEAL has no source lines (no `// file:line` comments), so there's no TypeScript view, but its names are used";
    if (!m.save) out.push({ text: `Matches ${prog}${exact}, but the spec's TEAL has no source lines (no \`// file:line\` comments), so there is no TypeScript view. Not saved.`, bad: m.current });
    else if (m.stored === false) out.push({ text: `Matches ${prog}${exact}${bare}. Kept for this page only: the browser didn't store it.`, bad: true });
    else out.push({ text: `Matches ${prog}${exact}${bare}. Saved in this browser.` });
    if (r.mapMismatch) out.push({ text: `The .puya.map doesn't fit the ${m.kind} program (${r.mapMismatch}). The TypeScript view works without stack names.`, bad: true });
  }
  if (spec?.unplaced && !ms.some((m) => m.puyaMap === spec.unplaced)) {
    out.push({ text: "The .puya.map whose name says neither approval nor clear fits neither program: left out.", bad: true });
  }
  return out;
}

const Seg = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    type="button"
    aria-pressed={on}
    onClick={onClick}
    className={cn("px-2 py-0.5 cursor-pointer", on ? "bg-primary/25 text-foreground" : "text-muted-foreground hover:bg-white/5")}
  >
    {children}
  </button>
);

/** A file list as read files, with their paths in a chosen folder; `keep` picks which to read (by name and path). */
async function readList(list: FileList | File[], keep: (name: string, path: string) => boolean = () => true): Promise<ReadFile[]> {
  const files = [...list].filter((x) => keep(x.name, x.webkitRelativePath ?? ""));
  return Promise.all(files.map(async (x) => ({ name: x.name, ...(x.webkitRelativePath && { path: x.webkitRelativePath }), text: await x.text() })));
}

const msgClass = (m: Msg) => (m.bad ? "text-red-400" : m.info ? "text-muted-foreground" : "text-green-400");

const smallBtn = "inline-flex items-center gap-1 rounded border border-border/50 px-1.5 py-0.5 hover:bg-primary/15 cursor-pointer [&_svg]:size-3.5";

export function SourceBar({ f, src }: { f: Frame; src: TraceSource }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [paste, setPaste] = useState("");
  const [drag, setDrag] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const hash = f.hash;
  if (!hash || !src.appPrograms(f).length) return null;
  const have = src.srcs.get(hash);
  const older = src.older.get(hash) ?? [];
  const view = src.viewOf(hash);

  const failed = (e: unknown) => setMsgs([{ text: `Couldn't read the spec: ${e instanceof Error ? e.message : String(e)}`, bad: true }]);
  const run = async (files: { name: string; text: string }[]) => {
    setBusy(true);
    try {
      const { spec, errors } = readSpecFiles(files);
      if (!spec) {
        setMsgs(errors.map((text) => ({ text, bad: true })));
        return;
      }
      const { added: ms, notes } = await src.addSpec(f, spec);
      setMsgs([...errors.map((text) => ({ text, bad: true })), ...matchLines(ms, spec), ...notes]);
      if (ms.some((m) => m.current && m.save)) {
        setOpen(false);
        setPaste("");
      }
    } catch (e) {
      failed(e);
    } finally {
      setBusy(false);
    }
  };
  const onFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    try {
      await run(await readList(list));
    } catch (e) {
      failed(e);
    }
  };
  // Files added to the saved spec: maps and source files.
  const add = async (files: ReadFile[], from?: string) => {
    setBusy(true);
    try {
      const saved = src.appPrograms(f).flatMap((p) => src.srcs.get(p.hash)?.rec.arc56 ?? []);
      const r = readAddedFiles(files, saved);
      const notes = r.maps.length || r.files.length ? await src.addFiles(f, r.maps, r.files) : [];
      const none = !files.length && from ? [{ text: `${from} has no file named as one of the spec's source files.`, bad: true }] : [];
      setMsgs([...none, ...r.errors.map((text) => ({ text, bad: true })), ...notes]);
    } catch (e) {
      failed(e);
    } finally {
      setBusy(false);
    }
  };
  const onAddFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    try {
      await add(await readList(list));
    } catch (e) {
      failed(e);
    }
  };
  // A folder: only its files named as one of the spec's source files are read (not node_modules').
  const onFolder = async (list: FileList | null) => {
    if (!list?.length || !have) return;
    // The source file names of every saved spec of the app's programs.
    const names = new Set(
      src.appPrograms(f).flatMap((p) => {
        const h = src.srcs.get(p.hash);
        return h ? specSourcePaths(h.map.lines, h.rec.puyaMap).map((x) => x.slice(x.lastIndexOf("/") + 1).toLowerCase()) : [];
      }),
    );
    const folder = list[0].webkitRelativePath.split("/")[0] || "The folder";
    try {
      await add(await readList(list, (name, path) => isSourceName(name) && names.has(name.toLowerCase()) && !/(^|\/)node_modules\//.test(path)), folder);
    } catch (e) {
      failed(e);
    }
  };
  const tryOld = async (rec: SpecRecord) => {
    setBusy(true);
    try {
      const { added, notes } = await src.tryRecord(f, rec);
      setMsgs([...matchLines(added), ...notes]);
    } catch (e) {
      failed(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="shrink-0 border-b border-border/40 px-3 py-1 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        {have ? (
          <>
            {have.map.lines.length ? (
              <span className="inline-flex overflow-hidden rounded border border-border/50" role="group" aria-label="Show the program as">
                <Seg on={view === "ts"} onClick={() => src.setView(hash, "ts")}>TypeScript</Seg>
                <Seg on={view === "teal"} onClick={() => src.setView(hash, "teal")}>TEAL</Seg>
              </span>
            ) : null}
            <span
              className="min-w-0 truncate text-muted"
              title={
                have.map.mapMismatch
                  ? `The .puya.map doesn't fit: ${have.map.mapMismatch}`
                  : !have.map.lines.length
                    ? "Its TEAL has no source lines (no // file:line comments), so there's no TypeScript view; its names are used"
                    : undefined
              }
            >
              {have.rec.name} spec{have.map.exact ? " · exact" : ""}
              {!have.map.lines.length ? " · names only" : ""}
              {have.rec.puyaMap && !have.map.mapMismatch ? " · with map" : ""}
              {have.map.mapMismatch ? " · map doesn't fit" : ""}
              {srcCount(have) ? ` · ${srcCount(have)} source ${srcCount(have) === 1 ? "file" : "files"}` : ""}
            </span>
            {!open ? (
              <button type="button" className={smallBtn} onClick={() => setOpen(true)} title="Add the spec's .puya.map (stack value names) or its source files (whole files)">
                <FilePlus2 />
                Add files
              </button>
            ) : null}
          </>
        ) : (
          <button type="button" className={smallBtn} onClick={() => setOpen(!open)} aria-expanded={open}>
            <FileCode2 />
            Add ARC-56 spec
          </button>
        )}
        {!have && older.length && !open ? (
          <span className="text-muted-foreground">
            A spec for an older version of this app is saved:{" "}
            {older.map((r) => (
              <button key={r.hash} type="button" disabled={busy} className={cn(smallBtn, "ml-1")} onClick={() => tryOld(r)} title={`Added ${new Date(r.addedAt).toLocaleString()}; used only if it matches this program`}>
                try {r.name}
              </button>
            ))}
          </span>
        ) : null}
        {have || open ? (
          <button type="button" className="ml-auto text-muted hover:text-foreground cursor-pointer" onClick={() => setOpen(!open)}>
            {open ? "close" : "specs…"}
          </button>
        ) : null}
      </div>

      {msgs.length ? (
        <div className="mt-1 flex items-start gap-2">
          <div className="min-w-0 flex-1 space-y-0.5">
            {msgs.map((m, k) => (
              <div key={k} className={cn("break-words", msgClass(m))}>
                {m.text}
              </div>
            ))}
          </div>
          <button type="button" aria-label="Dismiss" className="text-muted hover:text-foreground cursor-pointer" onClick={() => setMsgs([])}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      {open ? (
        <div className="mt-1.5 mb-1 space-y-2">
          {!have ? (
            <>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDrag(true);
                }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDrag(false);
                  onFiles(e.dataTransfer.files);
                }}
                className={cn("flex flex-wrap items-center gap-2 rounded border border-dashed border-border/70 px-3 py-2 text-muted-foreground", drag && "border-primary bg-primary/10")}
              >
                <Upload className="h-4 w-4" />
                <span>
                  Drop <span className="font-mono">*.arc56.json</span>, with its <span className="font-mono">*.puya.map</span> and <span className="font-mono">.ts</span> source files if you have them, or
                </span>
                <button type="button" className={smallBtn} disabled={busy} onClick={() => fileInput.current?.click()}>
                  choose files
                </button>
                <input ref={fileInput} type="file" multiple accept=".json,.map,.ts,.py,application/json" className="hidden" aria-label="ARC-56 spec files" onChange={(e) => (onFiles(e.target.files), (e.target.value = ""))} />
              </div>
              <div className="flex items-start gap-2">
                <textarea
                  value={paste}
                  onChange={(e) => setPaste(e.target.value)}
                  placeholder="or paste the ARC-56 spec JSON"
                  aria-label="ARC-56 spec JSON"
                  rows={2}
                  className="min-w-0 flex-1 resize-y rounded border border-border/50 bg-background px-2 py-1 font-mono text-[11px]"
                />
                <button type="button" className={smallBtn} disabled={busy || !paste.trim()} onClick={() => run([{ name: "pasted spec", text: paste }])}>
                  Match
                </button>
              </div>
              <div className="text-muted">The spec is matched with this program and kept in this browser only; nothing is uploaded.</div>
            </>
          ) : (
            <AddFiles busy={busy} onFiles={onAddFiles} onFolder={onFolder} />
          )}
          <SavedSpecs src={src} hash={hash} onRemoved={(name, ok) => setMsgs(ok ? [] : [{ text: `Couldn't remove the ${name} spec: the browser still holds it.`, bad: true }])} />
        </div>
      ) : null}
    </div>
  );
}

const srcCount = (have: { rec: SpecRecord }) => Object.keys(have.rec.sources ?? {}).length;

/** A drop zone for a saved spec's `.puya.map`s and source files, and a folder picker for the source files. */
function AddFiles({ busy, onFiles, onFolder }: { busy: boolean; onFiles: (l: FileList | null) => void; onFolder: (l: FileList | null) => void }) {
  const [drag, setDrag] = useState(false);
  const files = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);
  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          onFiles(e.dataTransfer.files);
        }}
        className={cn("flex flex-wrap items-center gap-2 rounded border border-dashed border-border/70 px-3 py-2 text-muted-foreground", drag && "border-primary bg-primary/10")}
      >
        <Upload className="h-4 w-4" />
        <span>
          Add to this spec: drop its <span className="font-mono">*.puya.map</span> (names stack values) or its <span className="font-mono">.ts</span> source files (whole files), or
        </span>
        <button type="button" className={smallBtn} disabled={busy} onClick={() => files.current?.click()}>
          choose files
        </button>
        <button type="button" className={smallBtn} disabled={busy} onClick={() => folder.current?.click()} title="Only the folder's files named as the spec's source files are read">
          choose folder
        </button>
        <input ref={files} type="file" multiple accept=".map,.ts,.py,application/json" className="hidden" aria-label="Files to add to the spec" onChange={(e) => (onFiles(e.target.files), (e.target.value = ""))} />
        <input
          ref={folder}
          type="file"
          className="hidden"
          aria-label="A folder with the spec's source files"
          {...{ webkitdirectory: "", directory: "" }}
          onChange={(e) => (onFolder(e.target.files), (e.target.value = ""))}
        />
      </div>
      <div className="mt-1 text-muted">Source files are matched to the spec's paths by name and checked against the lines its TEAL quotes. They stay in this browser.</div>
    </div>
  );
}

/** The specs this browser keeps, to remove one. */
function SavedSpecs({ src, hash, onRemoved }: { src: TraceSource; hash: string; onRemoved: (name: string, ok: boolean) => void }) {
  if (!src.saved.length) return null;
  return (
    <div>
      <div className="mb-0.5 text-muted-foreground">Specs saved in this browser</div>
      {src.saved.map((r) => (
        <div key={r.hash} className="flex items-center gap-2 py-0.5">
          <span className={cn("min-w-0 truncate", r.hash === hash && "text-foreground")}>
            {r.name} · {r.kind}
            {r.appId ? ` · app ${r.appId}` : ""}
            {r.hash === hash ? " · this program" : src.hashes.has(r.hash) ? " · in this trace" : ""}
          </span>
          <span className="ml-auto shrink-0 text-muted">{new Date(r.addedAt).toLocaleDateString()}</span>
          <button type="button" aria-label={`Remove the ${r.name} spec`} className="text-muted hover:text-foreground cursor-pointer" onClick={async () => onRemoved(r.name, await src.removeSpec(r.hash))}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
