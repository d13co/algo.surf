import React, { useRef, useState } from "react";
import { FileCode2, FilePlus2, Upload, X } from "lucide-react";
import { cn } from "src/lib/utils";
import { sourceLang } from "src/utils/arc56Source";
import { specSourcePaths, type Note } from "src/utils/sourceFiles";
import { getSpec, type SpecRecord } from "src/utils/specStore";
import { bestFit, folderSources, folderSpecs, readAddedFiles, readSpecFiles, type ReadFile, type SpecInput } from "src/utils/traceSpecs";
import type { Frame } from "src/utils/traceStepper";
import type { Added, TraceSource } from "./useTraceSource";

/**
 * The source panel's bar: the TEAL / source switch for a program with a
 * spec with source lines (a spec without them only names things), else "Add ARC-56 spec" (a drop zone, a
 * project folder to find the spec in, and a paste box), specs saved
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
    const bare = r.lines.length ? "" : "; its TEAL has no source lines (no `// file:line` comments), so there's no source view, but its names are used";
    if (!m.save) out.push({ text: `Matches ${prog}${exact}, but the spec's TEAL has no source lines (no \`// file:line\` comments), so there is no source view. Not saved.`, bad: m.current });
    else if (m.stored === false) out.push({ text: `Matches ${prog}${exact}${bare}. Kept for this page only: the browser didn't store it.`, bad: true });
    else out.push({ text: `Matches ${prog}${exact}${bare}. Saved in this browser.` });
    if (r.mapMismatch) out.push({ text: `The .puya.map doesn't fit the ${m.kind} program (${r.mapMismatch}). ${r.lines.length ? `The ${sourceLang(r)} view works without stack names.` : "Its other names are still used."}`, bad: true });
  }
  if (spec?.unplaced && !ms.some((m) => m.puyaMap === spec.unplaced)) {
    out.push({ text: "The .puya.map whose name says neither approval nor clear fits neither program: left out.", bad: true });
  }
  return out;
}

const Seg = ({ on, onClick, title, children }: { on: boolean; onClick: () => void; title?: string; children: React.ReactNode }) => (
  <button
    type="button"
    aria-pressed={on}
    title={title}
    onClick={onClick}
    className={cn("px-2 py-0.5 cursor-pointer", on ? "bg-primary/25 text-foreground" : "text-muted-foreground hover:bg-white/5")}
  >
    {children}
  </button>
);

/** A file list as read files, with their paths in a chosen folder. */
async function readList(list: FileList | File[]): Promise<ReadFile[]> {
  return Promise.all([...list].map(readOne));
}

const readOne = async (x: File): Promise<ReadFile> => ({ name: x.name, ...(x.webkitRelativePath && { path: x.webkitRelativePath }), text: await x.text() });

/** A chosen folder's files, unread, by name and path; and the folder's name. */
function folderList(list: FileList) {
  const files = [...list].map((file) => ({ name: file.name, path: file.webkitRelativePath || file.name, file }));
  return { files, folder: files[0]?.path.split("/")[0] || "The folder" };
}

type FolderEntry = ReturnType<typeof folderList>["files"][number];

/** A folder's spec, read: its path there, its files (the spec, then its maps), and the spec. */
type Cand = { path: string; files: ReadFile[]; spec: SpecInput };

/** Reads a folder's specs with their maps, once; and those that couldn't be read, with why. */
async function readCands(all: { spec: FolderEntry; maps: FolderEntry[] }[]): Promise<{ cands: Cand[]; unread: string[] }> {
  const cands: Cand[] = [];
  const unread: string[] = [];
  for (const c of all) {
    const files = await Promise.all([c.spec, ...c.maps].map((x) => readOne(x.file)));
    const { spec, errors } = readSpecFiles(files);
    if (spec) cands.push({ path: c.spec.path, files, spec });
    else unread.push(`${c.spec.path}: ${errors.join("; ")}`);
  }
  return { cands, unread };
}

/** A folder's source files at `paths`, read. */
const readSources = (files: FolderEntry[], paths: string[]) => (paths.length ? Promise.all(folderSources(files, paths).map((x) => readOne(x.file))) : Promise.resolve([]));

/** ` with 1 .puya.map and 2 source files`, or nothing. */
function found(maps: number, sources: number): string {
  const t = [`${maps} .puya.${maps === 1 ? "map" : "maps"}`, `${sources} source ${sources === 1 ? "file" : "files"}`].filter((x) => !x.startsWith("0 ")).join(" and ");
  return t ? ` with ${t}` : "";
}

/** A frame's app, as a message names it. */
const appOf = (g: Frame) => (g.appId !== undefined && Number(g.appId) ? `app ${g.appId}` : "an app without an ID");

const msgClass = (m: Msg) => (m.bad ? "text-red-400" : m.info ? "text-muted-foreground" : "text-green-400");

const smallBtn = "inline-flex items-center gap-1 rounded border border-border/50 px-1.5 py-0.5 hover:bg-primary/15 cursor-pointer [&_svg]:size-3.5";

export function SourceBar({ f, src }: { f: Frame; src: TraceSource }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [paste, setPaste] = useState("");
  const [drag, setDrag] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  const hash = f.hash;
  if (!hash || !src.appPrograms(f).length) return null;
  const have = src.srcs.get(hash);
  const older = src.older.get(hash) ?? [];
  const view = src.viewOf(hash);

  const failed = (e: unknown) => setMsgs([{ text: `Couldn't read the spec: ${e instanceof Error ? e.message : String(e)}`, bad: true }]);
  /** Matches a spec (with its maps and source files) with frame `g`'s app and saves it: what it says, and whether `g`'s program took it. */
  const addTo = async (g: Frame, files: ReadFile[]): Promise<{ msgs: Msg[]; ok: boolean }> => {
    const { spec, errors } = readSpecFiles(files);
    const errs = errors.map((text) => ({ text, bad: true }));
    if (!spec) return { msgs: errs, ok: false };
    const { added: ms, notes } = await src.addSpec(g, spec);
    return { msgs: [...errs, ...matchLines(ms, spec), ...notes], ok: ms.some((m) => m.current && m.save) };
  };
  const run = async (files: ReadFile[]) => {
    setBusy(true);
    try {
      const r = await addTo(f, files);
      setMsgs(r.msgs);
      if (r.ok) {
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
    if (!list?.length || busy) return;
    try {
      await run(await readList(list));
    } catch (e) {
      failed(e);
    }
  };
  /** Maps and source files added to the saved specs of frame `g`'s app. */
  const filesTo = async (g: Frame, files: ReadFile[]): Promise<Msg[]> => {
    const saved = src.appPrograms(g).flatMap((p) => src.srcs.get(p.hash)?.rec.arc56 ?? []);
    const r = readAddedFiles(files, saved);
    const notes = r.maps.length || r.files.length ? await src.addFiles(g, r.maps, r.files) : [];
    return [...r.errors.map((text) => ({ text, bad: true })), ...notes];
  };
  const onAddFiles = async (list: FileList | null) => {
    if (!list?.length || busy) return;
    setBusy(true);
    try {
      setMsgs(await filesTo(f, await readList(list)));
    } catch (e) {
      failed(e);
    } finally {
      setBusy(false);
    }
  };
  /** The source paths of the saved specs of frame `g`'s app. */
  const savedPaths = (g: Frame) =>
    src.appPrograms(g).flatMap((p) => {
      const h = src.srcs.get(p.hash);
      return h ? specSourcePaths(h.map.lines, h.rec.puyaMap) : [];
    });
  /** The source paths of the saved specs of frame `g`'s app without a saved file: an app's files already saved stay as they are. */
  const missingPaths = (g: Frame) =>
    src.appPrograms(g).flatMap((p) => {
      const h = src.srcs.get(p.hash);
      return h ? specSourcePaths(h.map.lines, h.rec.puyaMap).filter((path) => h.rec.sources?.[path] === undefined) : [];
    });
  /**
   * The trace's other apps without a saved spec: inner calls and the
   * group's other app calls. From the store, not `src.srcs`, which is
   * empty until the saved specs load: an app's saved spec (and its source
   * files) is never replaced by a folder's.
   */
  const unsaved = async () => {
    const out: Frame[] = [];
    for (const g of src.otherApps(f)) {
      const recs = await Promise.all(src.appPrograms(g).map((p) => getSpec(p.hash)));
      if (!recs.some(Boolean)) out.push(g);
    }
    return out;
  };
  /** Each of `apps`' best fit among a folder's specs, saved with its maps and the folder's source files at its paths. */
  const specsFor = async (apps: Frame[], files: FolderEntry[], cands: Cand[], also: boolean): Promise<Msg[]> => {
    const out: Msg[] = [];
    for (const g of apps) {
      // Matching every spec with every app: the page paints between apps.
      await new Promise((r) => setTimeout(r));
      const best = bestFit(cands, (spec) => src.matchOnly(g, spec));
      if (!best) continue;
      const sources = await readSources(files, best.paths);
      const r = await addTo(g, [...best.cand.files, ...sources]);
      out.push({ text: `${also ? "Also using" : "Using"} ${best.cand.path}${found(best.cand.files.length - 1, sources.length)}, for ${appOf(g)}.`, info: true }, ...r.msgs);
    }
    return out;
  };
  /**
   * A folder for a saved spec: its source files at the spec's paths. Also
   * for the trace's other apps: source files their saved specs don't have
   * yet (not replacing any they do), and the folder's specs for those
   * without one.
   */
  const onFolder = async (list: FileList | null) => {
    if (!list?.length || !have || busy) return;
    const { files, folder } = folderList(list);
    setBusy(true);
    try {
      const mine = await readSources(files, savedPaths(f));
      const out: Msg[] = mine.length ? await filesTo(f, mine) : [];
      for (const g of src.otherApps(f)) {
        const theirs = await readSources(files, missingPaths(g));
        if (theirs.length) out.push({ text: `For ${appOf(g)}:`, info: true }, ...(await filesTo(g, theirs)));
      }
      const apps = await unsaved();
      if (apps.length) out.push(...(await specsFor(apps, files, (await readCands(folderSpecs(files))).cands, false)));
      // Nothing for this spec: an error only when the folder gave nothing at all.
      if (!mine.length) out.unshift({ text: `${folder} has no file named as one of this spec's source files.`, bad: !out.length, info: out.length > 0 });
      setMsgs(out);
    } catch (e) {
      failed(e);
    } finally {
      setBusy(false);
    }
  };
  /**
   * A project or artifacts folder, before any spec: its ARC-56 spec that
   * fits this program best (see fitsBetter), with the .puya.maps beside it
   * and the source files at its paths. Only those files are read. Its
   * specs are tried against the trace's other apps without a saved spec
   * too (inner calls, the group's other app calls).
   */
  const onSpecFolder = async (list: FileList | null) => {
    if (!list?.length || busy) return;
    const { files, folder } = folderList(list);
    setBusy(true);
    try {
      const all = folderSpecs(files);
      if (!all.length) {
        setMsgs([{ text: `${folder} has no ARC-56 spec (*.arc56.json) outside node_modules.`, bad: true }]);
        return;
      }
      // Every candidate is tried, the best fit kept (see fitsBetter): a spec copy without its maps loses to the build output with them.
      const { cands, unread } = await readCands(all);
      const best = bestFit(cands, (spec) => src.matchOnly(f, spec));
      const out: Msg[] = [];
      let ok = false;
      if (best) {
        const sources = await readSources(files, best.paths);
        const r = await addTo(f, [...best.cand.files, ...sources]);
        out.push({ text: `Using ${best.cand.path}${found(best.cand.files.length - 1, sources.length)}.`, info: true }, ...r.msgs);
        ok = r.ok;
      } else {
        const names = all.slice(0, 4).map((c) => c.spec.name).join(", ");
        out.push(
          { text: `None of the ${all.length} ARC-56 ${all.length === 1 ? "spec" : "specs"} in ${folder} (${names}${all.length > 4 ? ", …" : ""}) matches this program.`, bad: true },
          ...unread.slice(0, 3).map((text) => ({ text: `Couldn't read ${text}`, bad: true })),
          ...(unread.length > 3 ? [{ text: `…and ${unread.length - 3} more specs couldn't be read.`, bad: true }] : []),
        );
      }
      out.push(...(await specsFor(await unsaved(), files, cands, !!best)));
      setMsgs(out);
      if (ok) {
        setOpen(false);
        setPaste("");
      }
    } catch (e) {
      failed(e);
    } finally {
      setBusy(false);
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
                <Seg on={view === "teal"} onClick={() => src.setView(hash, "teal")}>TEAL</Seg>
                <Seg on={view === "ts"} onClick={() => src.setView(hash, "ts")}>{sourceLang(have.map)}</Seg>
              </span>
            ) : null}
            {have.map.lines.length && view === "teal" ? (
              <span className="inline-flex overflow-hidden rounded border border-border/50">
                <Seg on={src.colOf(hash)} onClick={() => src.setCol(hash, !src.colOf(hash))} title="Show the source line beside each run of TEAL ops">
                  Source lines
                </Seg>
              </span>
            ) : null}
            <span
              className="min-w-0 truncate text-muted"
              title={
                have.map.mapMismatch
                  ? `The .puya.map doesn't fit: ${have.map.mapMismatch}`
                  : !have.map.lines.length
                    ? "Its TEAL has no source lines (no // file:line comments), so there's no source view; its names are used"
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
                <button
                  type="button"
                  className={smallBtn}
                  disabled={busy}
                  onClick={() => folderInput.current?.click()}
                  title="A project or artifacts folder: its *.arc56.json that matches this program is used, with the .puya.maps beside it and its source files, and those that match the trace's other apps (inner calls too). Only those files are read."
                >
                  choose folder
                </button>
                <input ref={fileInput} type="file" multiple accept=".json,.map,.ts,.py,application/json" className="hidden" aria-label="ARC-56 spec files" onChange={(e) => (onFiles(e.target.files), (e.target.value = ""))} />
                <input
                  ref={folderInput}
                  type="file"
                  className="hidden"
                  aria-label="A folder with the ARC-56 spec"
                  {...{ webkitdirectory: "", directory: "" }}
                  onChange={(e) => (onSpecFolder(e.target.files), (e.target.value = ""))}
                />
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
        <button type="button" className={smallBtn} disabled={busy} onClick={() => folder.current?.click()} title="The spec's source files from a folder, and those of the trace's other apps; their specs too, for apps without one">
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
