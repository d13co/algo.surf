import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ChevronDown, FileJson, FilePlus2, FolderOpen, Lock, Map as MapIcon, Search, Trash2, X } from "lucide-react";
import { cn } from "src/lib/utils";
import { network } from "src/packages/core-sdk/constants";
import useTitle from "src/components/Common/UseTitle/UseTitle";
import LoadingTile from "src/components/v2/LoadingTile";
import { Button } from "src/components/v2/ui/button";
import type { Note } from "src/utils/sourceFiles";
import { appKey, compilerLabel, importFiles, importFolder, libPaths, mapFit, specLang, type FolderEntry, type ImportResult, type LibApp, type LibSpec, type MapSlot } from "src/utils/specLibrary";
import { clearLibrary, deleteLibSpec, listLibrary, putLibSpec, updateLibSpec } from "src/utils/specLibraryStore";
import type { ReadFile } from "src/utils/traceSpecs";
import Link from "../Links/Link";
import Logo from "../../Header/Logo";

/**
 * /debug/contracts: the contracts this browser keeps for the debugger: each
 * an ARC-56 spec with its .puya.maps and source files, and the apps it
 * matched in a trace. They are added here (a folder, a spec, a map); the
 * debugger matches them with a trace's programs and records the apps.
 */

type Report = { title: string; notes: Note[] };

/** Files dropped, folders walked (node_modules and .git skipped), with their paths. */
async function droppedFiles(dt: DataTransfer): Promise<{ files: { file: File; path: string }[]; folder: boolean }> {
  const entries = [...dt.items].map((it) => it.webkitGetAsEntry?.() ?? null);
  if (!entries.some(Boolean)) return { files: [...dt.files].map((file) => ({ file, path: file.name })), folder: false };
  const out: { file: File; path: string }[] = [];
  let folder = false;
  const walk = async (e: FileSystemEntry, prefix: string): Promise<void> => {
    const path = prefix + e.name;
    if (e.isFile) {
      const file = await new Promise<File | null>((res) => (e as FileSystemFileEntry).file(res, () => res(null)));
      if (file) out.push({ file, path });
    } else if (e.isDirectory) {
      folder = true;
      if (e.name === "node_modules" || e.name === ".git") return;
      const reader = (e as FileSystemDirectoryEntry).createReader();
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((res) => reader.readEntries(res, () => res([])));
        if (!batch.length) break;
        for (const x of batch) await walk(x, `${path}/`);
      }
    }
  };
  for (const e of entries) if (e) await walk(e, "");
  return { files: out, folder };
}

const asFolder = (files: { file: File; path: string }[]): FolderEntry[] => files.map(({ file, path }) => ({ name: file.name, path, read: () => file.text() }));
const asRead = (files: { file: File; path: string }[]): Promise<ReadFile[]> =>
  Promise.all(files.map(async ({ file, path }) => ({ name: file.name, ...(path !== file.name && { path }), text: await file.text() })));
const fromList = (list: FileList) => [...list].map((file) => ({ file, path: file.webkitRelativePath || file.name }));

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const kb = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);
const day = (t: number) => new Date(t).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
const when = (t: number) => new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const noteClass = (n: Note) => (n.bad ? "text-red-400" : n.info ? "text-muted-foreground" : "text-green-400");
const dot = (state: "ok" | "warn" | "bad" | "none") =>
  cn("inline-block h-1.5 w-1.5 shrink-0 rounded-full", state === "ok" ? "bg-green-400" : state === "warn" ? "bg-warning" : state === "bad" ? "bg-red-400" : "bg-muted");

export default function ContractLibrary(): JSX.Element {
  useTitle("Contracts");
  const navigate = useNavigate();
  // Back to where it was opened from (the debugger, mostly); opened directly, to the home page in place of this entry.
  const back = () => (((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0 ? navigate(-1) : navigate("/", { replace: true }));
  const [params] = useSearchParams();
  const focus = params.get("spec") ?? undefined;

  const [specs, setSpecs] = useState<LibSpec[]>();
  const [report, setReport] = useState<Report>();
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState<Set<string>>(() => new Set(focus ? [focus] : []));
  const [drag, setDrag] = useState(false);
  const folderInput = useRef<HTMLInputElement>(null);
  const specInput = useRef<HTMLInputElement>(null);
  const mapInput = useRef<HTMLInputElement>(null);
  const addInput = useRef<HTMLInputElement>(null);
  const addTo = useRef<LibSpec>();

  const reload = useCallback(async () => setSpecs(await listLibrary(network).catch(() => [])), []);
  useEffect(() => {
    reload();
    // Back in view: the debugger (another tab) may have recorded apps since.
    const again = () => document.visibilityState === "visible" && reload();
    document.addEventListener("visibilitychange", again);
    window.addEventListener("focus", again);
    return () => {
      document.removeEventListener("visibilitychange", again);
      window.removeEventListener("focus", again);
    };
  }, [reload]);

  // Opened at a spec (from the debugger): open it and scroll to it, once per spec asked for.
  const scrolled = useRef<string>();
  useEffect(() => {
    if (focus) setOpen((o) => (o.has(focus) ? o : new Set([...o, focus])));
  }, [focus]);
  useEffect(() => {
    if (!focus || !specs || scrolled.current === focus) return;
    scrolled.current = focus;
    document.getElementById(`spec-${focus}`)?.scrollIntoView({ block: "center" });
  }, [focus, specs]);

  /** Saves what an import gives, and tells what happened. */
  const apply = async (title: string, r: ImportResult) => {
    const notes = [...r.notes];
    for (const s of r.put) if (!(await putLibSpec(s))) notes.push({ text: `${s.name}: the browser didn't store it; it is kept until you leave this page.`, bad: true });
    const added = r.put.length;
    setReport({ title: added ? title : "Nothing added", notes });
    await reload();
  };
  const busyRef = useRef(false);
  const run = async (fn: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setReport({ title: "Couldn't read those files", notes: [{ text: e instanceof Error ? e.message : String(e), bad: true }] });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  // Imports read the specs as stored now, not as this page last showed them (another tab may have changed them).
  const doFolder = async (files: { file: File; path: string }[]) => {
    const folder = files[0]?.path.split("/")[0] || "the folder";
    const r = await importFolder(asFolder(files), await listLibrary(network), Date.now());
    await apply(`From ${folder}`, r);
  };
  const doFiles = async (files: { file: File; path: string }[], target?: LibSpec) => {
    const saved = await listLibrary(network);
    const t = target && saved.find((x) => x.id === target.id);
    if (target && !t) {
      setReport({ title: `${target.name} is no longer saved`, notes: [{ text: "It was removed, perhaps in another tab. Add the spec again first.", bad: true }] });
      await reload();
      return;
    }
    const r = importFiles(await asRead(files), saved, Date.now(), t);
    await apply(t ? `Files for ${t.name}` : `${plural(files.length, "file")} read`, r);
  };
  const onFolder = (files: { file: File; path: string }[]) => run(() => doFolder(files));
  const onFiles = (files: { file: File; path: string }[], target?: LibSpec) => run(() => doFiles(files, target));
  // Files dropped anywhere in the window: elsewhere the browser would open them and leave the page.
  const onDrop = useRef<(dt: DataTransfer) => void>();
  onDrop.current = (dt) => {
    // Read the entries now: the drop's data is gone after this event.
    const dropped = droppedFiles(dt);
    run(async () => {
      const { files, folder } = await dropped;
      if (folder) await doFolder(files);
      else await doFiles(files);
    });
  };
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes("Files");
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDrag(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setDrag(false);
    };
    const over = (e: DragEvent) => hasFiles(e) && e.preventDefault();
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDrag(false);
      if (e.dataTransfer?.files.length) onDrop.current?.(e.dataTransfer);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, []);
  const remove = (s: LibSpec) =>
    run(async () => {
      const ok = await deleteLibSpec(s.id);
      setReport(ok ? { title: `Removed ${s.name}`, notes: [] } : { title: `Couldn't remove ${s.name}`, notes: [{ text: "The browser still holds it. Try again, or clear this site's data.", bad: true }] });
      await reload();
    });
  const [confirmAll, setConfirmAll] = useState(false);
  const removeAll = () =>
    run(async () => {
      const n = specs?.length ?? 0;
      const ok = await clearLibrary();
      setConfirmAll(false);
      setReport(ok ? { title: `Removed all ${plural(n, "contract")}`, notes: [] } : { title: "Couldn't remove the contracts", notes: [{ text: "The browser still holds them. Try again, or clear this site's data.", bad: true }] });
      await reload();
    });
  const forget = (s: LibSpec, a: LibApp) =>
    run(async () => {
      await updateLibSpec(s.id, (cur) => cur && { ...cur, apps: cur.apps.filter((x) => appKey(x) !== appKey(a)) });
      await reload();
    });

  // What the search looks in, per spec: worked out when the specs change, not on each keystroke.
  const hays = useMemo(
    () => new Map((specs ?? []).map((s) => [s.id, [s.name, s.from, s.file, ...(s.arc56.methods ?? []).map((m) => m.name), ...libPaths(s), ...s.apps.map((a) => String(a.appId ?? ""))].join(" ").toLowerCase()])),
    [specs],
  );
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q || !specs) return specs;
    return specs.filter((s) => q.split(/\s+/).every((t) => hays.get(s.id)!.includes(t)));
  }, [specs, hays, filter]);
  const apps = new Set((specs ?? []).flatMap((s) => s.apps.filter((a) => a.appId !== undefined).map((a) => `${a.network}:${a.appId}`))).size;

  return (
    <div className="flex flex-col gap-4 pb-10">
      <header className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
        <button
          type="button"
          onClick={back}
          title="Back"
          aria-label="Back"
          className="-ml-3 inline-flex h-12 w-12 shrink-0 self-center items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring header:h-9 header:w-9"
        >
          <ArrowLeft className="h-7 w-7 header:h-6 header:w-6" strokeWidth={1.75} />
        </button>
        <Link href="/" noStyle className="-ml-3 inline-flex h-12 items-center px-3 py-2 text-base text-muted-foreground header:h-auto">
          <Logo label="debugger" />
        </Link>
        <span className="text-sm text-muted-foreground">Contracts</span>
      </header>

      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 max-w-2xl">
          <h1 className="text-2xl font-bold">Contracts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Contracts the debugger knows: their ARC-56 specs, <span className="font-mono">.puya.map</span>s and source files, and the apps each matched. The debugger matches them with the programs in a trace, to show their source beside the TEAL, name methods and state keys, and explain failed asserts. A <span className="font-mono">.puya.map</span> names stack values too.
          </p>
        </div>
        <div className="flex gap-5 tabular-nums">
          <Count n={specs?.length ?? 0} label={specs?.length === 1 ? "contract" : "contracts"} />
          <Count n={apps} label={apps === 1 ? "app" : "apps"} />
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-border/40 bg-background-muted px-4 py-3 text-sm text-muted-foreground">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p>
          <span className="font-semibold text-foreground">Kept in this browser only.</span> Specs, maps and source files you add are read on your device and stored in this browser. They are never uploaded or shared, and clearing this site's data removes them.
        </p>
      </div>

      <section aria-label="Add contracts" className={cn("flex flex-col gap-3 rounded-lg border border-dashed border-border/70 bg-background-card p-4", drag && "border-solid border-primary bg-primary/10")}>
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={busy} onClick={() => folderInput.current?.click()} title="A project or build output folder: every X.arc56.json in it, with the .puya.maps beside it and its source files">
            <FolderOpen />
            Add a folder
          </Button>
          <Button variant="muted" disabled={busy} onClick={() => specInput.current?.click()}>
            <FileJson />
            ARC-56 spec
          </Button>
          <Button variant="muted" disabled={busy} onClick={() => mapInput.current?.click()} title="X.approval.puya.map or X.clear.puya.map: added to the saved spec named X">
            <MapIcon />
            Puya map
          </Button>
          {busy ? <span className="text-sm text-muted-foreground">Reading…</span> : null}
          <input ref={folderInput} type="file" className="hidden" aria-label="A folder with ARC-56 specs" {...{ webkitdirectory: "", directory: "" }} onChange={(e) => (e.target.files?.length && onFolder(fromList(e.target.files)), (e.target.value = ""))} />
          <input ref={specInput} type="file" multiple accept=".json,.map,.ts,.mts,.py,application/json" className="hidden" aria-label="ARC-56 spec files" onChange={(e) => (e.target.files?.length && onFiles(fromList(e.target.files)), (e.target.value = ""))} />
          <input ref={mapInput} type="file" multiple accept=".map,.json" className="hidden" aria-label=".puya.map files" onChange={(e) => (e.target.files?.length && onFiles(fromList(e.target.files)), (e.target.value = ""))} />
          <input
            ref={addInput}
            type="file"
            multiple
            accept=".map,.json,.ts,.mts,.py"
            className="hidden"
            aria-label="Files to add to the contract"
            onChange={(e) => (e.target.files?.length && addTo.current && onFiles(fromList(e.target.files), addTo.current), (e.target.value = ""))}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          A folder adds every <span className="font-mono">X.arc56.json</span> in it (not under <span className="font-mono">node_modules</span>) with the <span className="font-mono">X.approval.puya.map</span> and <span className="font-mono">X.clear.puya.map</span> beside it and the source files its TEAL names. You can also drop files or folders here.
        </p>
      </section>

      {report ? (
        <div role="status" className="rounded-lg border border-border/40 bg-background-muted px-4 py-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold">{report.title}</span>
            <button type="button" aria-label="Dismiss" className="text-muted hover:text-foreground cursor-pointer" onClick={() => setReport(undefined)}>
              <X className="h-4 w-4" />
            </button>
          </div>
          {report.notes.length ? (
            <ul className="mt-1 space-y-0.5">
              {report.notes.map((n, k) => (
                <li key={k} className={cn("break-words", noteClass(n))}>
                  {n.text}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Saved contracts</h2>
        {specs?.length ? (
          confirmAll ? (
            <span className="inline-flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              Remove all {plural(specs.length, "contract")} and their files?
              <Button size="sm" className="h-7 bg-red-500 px-2 text-white hover:bg-red-500/90" disabled={busy} onClick={removeAll}>
                Remove all
              </Button>
              <Button variant="ghost" size="sm" className="h-7 px-2 hover:bg-white/5" onClick={() => setConfirmAll(false)}>
                Cancel
              </Button>
            </span>
          ) : (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-red-400 hover:bg-red-500/10 hover:text-red-300" disabled={busy} onClick={() => setConfirmAll(true)}>
              <Trash2 />
              Remove all
            </Button>
          )
        ) : null}
        <span className="flex-1" />
        {specs?.length ? (
          <label className="relative min-w-0 flex-[0_1_18rem]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Name, app ID, method or file"
              aria-label="Filter contracts"
              className="w-full rounded-md border border-border/50 bg-background-muted py-1.5 pl-8 pr-2 text-sm outline-none focus:border-primary"
            />
          </label>
        ) : null}
      </div>

      {!specs ? (
        <LoadingTile />
      ) : !specs.length ? (
        <div className="rounded-lg border border-border/40 bg-background-card px-4 py-8 text-center text-sm text-muted-foreground">
          <div className="mb-1 text-base font-semibold text-foreground">No contracts yet</div>
          Add your contract's build output folder (such as <span className="font-mono">artifacts/</span>) or its project folder to start.
        </div>
      ) : !shown?.length ? (
        <div className="rounded-lg border border-border/40 bg-background-card px-4 py-8 text-center text-sm text-muted-foreground">No contract matches “{filter}”. Search covers names, app IDs, method names and source paths.</div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border/40 bg-background-card">
          {shown.map((s) => (
            <SpecRow
              key={s.id}
              s={s}
              open={open.has(s.id)}
              focused={s.id === focus}
              busy={busy}
              onToggle={() => setOpen((o) => (o.has(s.id) ? new Set([...o].filter((x) => x !== s.id)) : new Set([...o, s.id])))}
              onAdd={() => {
                addTo.current = s;
                addInput.current?.click();
              }}
              onRemove={() => remove(s)}
              onForget={(a) => forget(s, a)}
            />
          ))}
        </div>
      )}

      <section className="rounded-lg border border-border/40 px-4 py-3 text-sm text-muted-foreground">
        <h2 className="mb-1 text-sm font-semibold text-foreground">How apps get here</h2>
        <p>
          When the debugger opens a trace, it matches each app program in it with these contracts' specs: by bytecode when a spec has it, else TEAL op by op. A match records the app on the contract, so the contracts show which apps they are. An app update changes its program: a contract that doesn't match the new one keeps the app with the program it matched.
        </p>
      </section>
    </div>
  );
}

function Count({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex flex-col items-end">
      <span className="text-xl font-bold leading-tight">{n}</span>
      <span className="text-xs uppercase tracking-wider text-muted">{label}</span>
    </div>
  );
}

const SLOTS: MapSlot[] = ["approval", "clear", "unplaced"];

/** About how much the spec takes: its JSON, maps' events and source files, without serialising the maps and files. */
const specSize = (s: LibSpec) =>
  JSON.stringify(s.arc56).length +
  Object.values(s.sources).reduce((n, f) => n + f.text.length, 0) +
  Object.values(s.maps).reduce((n, m) => n + (m ? (m.map.mappings?.length ?? 0) + Object.keys(m.map.pc_events ?? {}).length * 40 : 0), 0);

function SpecRow({ s, open, focused, busy, onToggle, onAdd, onRemove, onForget }: {
  s: LibSpec;
  open: boolean;
  focused: boolean;
  busy: boolean;
  onToggle: () => void;
  onAdd: () => void;
  onRemove: () => void;
  onForget: (a: LibApp) => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const info = useMemo(() => {
    const paths = libPaths(s);
    const methods = s.arc56.methods ?? [];
    const keys = (["global", "local", "box"] as const).map((k) => [k, Object.keys(s.arc56.state?.keys?.[k] ?? {}).length, Object.keys(s.arc56.state?.maps?.[k] ?? {}).length] as const);
    const maps = SLOTS.flatMap((slot) => {
      const m = s.maps[slot];
      return m ? [{ slot, m, fit: mapFit(s.arc56, slot, m.map) }] : [];
    });
    return { paths, methods, keys, maps, lang: specLang(s.arc56), compiler: compilerLabel(s.arc56), found: paths.filter((p) => s.sources[p]).length, size: specSize(s) };
  }, [s]);
  const keyCount = info.keys.reduce((n, [, k, m]) => n + k + m, 0);
  const srcState = !info.paths.length ? "none" : info.found === info.paths.length ? "ok" : info.found ? "warn" : "bad";
  // One chip per app: its programs together.
  const appChips = useMemo(() => {
    const by = new Map<string, { a: LibApp; kinds: string[] }>();
    for (const a of s.apps) {
      const k = `${a.network}:${a.appId ?? a.hash}`;
      const g = by.get(k) ?? { a, kinds: [] };
      g.kinds.push(a.kind);
      by.set(k, g);
    }
    return [...by.values()];
  }, [s.apps]);

  return (
    <article id={`spec-${s.id}`} className={cn("border-b border-border/40 last:border-b-0", focused && "ring-1 ring-inset ring-primary")}>
      <div className="grid grid-cols-1 gap-x-5 gap-y-2.5 px-4 py-3 sm:grid-cols-[1fr_auto]">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
          <h3 className="break-words text-base font-bold">{s.name}</h3>
          {info.lang ? <span className="rounded-full border border-primary/60 px-2 text-xs font-semibold text-primary">{info.lang}</span> : null}
          {info.compiler ? <span className="rounded-full border border-border/50 px-2 text-xs text-muted-foreground">{info.compiler}</span> : null}
        </div>
        <div className="whitespace-nowrap text-xs text-muted tabular-nums sm:text-right">
          {kb(info.size)} · added {day(s.addedAt)}
        </div>
        <div className="grid grid-cols-1 gap-x-5 gap-y-2 text-sm sm:col-span-2 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Apps">
            {appChips.length ? (
              <span className="flex flex-wrap gap-1.5">
                {appChips.map(({ a, kinds }) => (
                  <span key={`${a.network}:${a.appId ?? a.hash}`} title={`${kinds.join(" + ")} program`} className="inline-flex items-center gap-1.5 rounded border border-border/60 bg-primary-dark px-1.5 font-mono text-xs">
                    <span className="font-sans text-[10px] font-bold uppercase tracking-wider text-primary">{a.network}</span>
                    {a.appId === undefined ? "no ID" : a.network === network ? <Link href={`/application/${a.appId}`} keepRound={false}>{a.appId}</Link> : a.appId}
                  </span>
                ))}
              </span>
            ) : (
              <span className="italic text-muted">Not seen in a trace yet</span>
            )}
          </Fact>
          <Fact label="ABI">
            {plural(info.methods.length, "method")} · {plural(keyCount, "state key")}
          </Fact>
          <Fact label=".puya.maps">
            {info.maps.length ? (
              info.maps.map(({ slot, fit }) => (
                <span key={slot} className="inline-flex items-center gap-1.5" title={fit.text}>
                  <span className={dot(fit.ok ? "ok" : "warn")} />
                  {slot === "unplaced" ? (fit.kind ?? "unnamed") : slot}
                </span>
              ))
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <span className={dot("none")} /> none
              </span>
            )}
          </Fact>
          <Fact label="Source files">
            <span className="inline-flex items-center gap-1.5">
              <span className={dot(srcState)} />
              {info.paths.length ? `${info.found} of ${info.paths.length} found` : "none named in its TEAL"}
            </span>
          </Fact>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground hover:bg-white/5" aria-expanded={open} onClick={onToggle}>
            <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
            {open ? "Hide details" : "Details"}
          </Button>
          <Button variant="muted" size="sm" className="h-7 px-2" disabled={busy} onClick={onAdd} title="Its .puya.maps (stack value names) or source files (whole files)">
            <FilePlus2 />
            Add files
          </Button>
          <span className="flex-1" />
          {confirm ? (
            <span className="inline-flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              Remove {s.name} and its files?
              <Button size="sm" className="h-7 bg-red-500 px-2 text-white hover:bg-red-500/90" disabled={busy} onClick={onRemove}>
                Remove
              </Button>
              <Button variant="ghost" size="sm" className="h-7 px-2 hover:bg-white/5" onClick={() => setConfirm(false)}>
                Cancel
              </Button>
            </span>
          ) : (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-red-400 hover:bg-red-500/10 hover:text-red-300" onClick={() => setConfirm(true)}>
              <Trash2 />
              Remove
            </Button>
          )}
        </div>
      </div>
      {open ? <Details s={s} info={info} onForget={onForget} /> : null}
    </article>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[11px] font-bold uppercase tracking-wider text-muted">{label}</span>
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">{children}</span>
    </div>
  );
}

type Info = {
  paths: string[];
  methods: NonNullable<LibSpec["arc56"]["methods"]>;
  keys: readonly (readonly ["global" | "local" | "box", number, number])[];
  maps: { slot: MapSlot; m: { name: string }; fit: ReturnType<typeof mapFit> }[];
};

function Details({ s, info, onForget }: { s: LibSpec; info: Info; onForget: (a: LibApp) => void }) {
  const sig = (m: Info["methods"][number]) => `${m.name}(${(m.args ?? []).map((a) => a.type).join(",")})${m.returns?.type ?? "void"}`;
  const apps = [...s.apps].sort((a, b) => b.lastSeen - a.lastSeen);
  const H = ({ children }: { children: React.ReactNode }) => <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted">{children}</h4>;
  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-4 border-t border-dashed border-border/40 bg-background-muted px-4 py-3 text-sm md:grid-cols-2">
      <section className="flex min-w-0 flex-col gap-1.5">
        <H>Methods</H>
        {info.methods.length ? (
          <ul className="space-y-0.5">
            {info.methods.map((m, k) => (
              <li key={`${k}:${sig(m)}`} className="flex min-w-0 items-baseline gap-2">
                <span className="break-all font-mono text-xs text-muted-foreground">{sig(m)}</span>
                {m.readonly ? <span className="text-xs text-muted">readonly</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="italic text-muted">No ABI methods</p>
        )}
        {info.keys.some(([, k, m]) => k || m) ? (
          <>
            <H>State</H>
            <ul className="space-y-0.5 text-muted-foreground">
              {info.keys
                .filter(([, k, m]) => k || m)
                .map(([kind, k, m]) => (
                  <li key={kind}>
                    {kind}: {[k && plural(k, "key"), m && plural(m, "map")].filter(Boolean).join(", ")}
                  </li>
                ))}
            </ul>
          </>
        ) : null}
      </section>
      <section className="flex min-w-0 flex-col gap-1.5">
        <H>Source files</H>
        {info.paths.length ? (
          <ul className="space-y-0.5">
            {info.paths.map((p) => (
              <li key={p} className="flex min-w-0 items-center gap-2">
                <span className={dot(s.sources[p] ? "ok" : "bad")} />
                <span className="min-w-0 break-all font-mono text-xs text-muted-foreground">{p}</span>
                <span className="ml-auto shrink-0 text-xs text-muted">{s.sources[p] ? kb(s.sources[p].text.length) : "missing"}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="italic text-muted">Its TEAL names no source files (built without source comments): the debugger uses its names only.</p>
        )}
        <H>.puya.maps</H>
        {info.maps.length ? (
          <ul className="space-y-0.5">
            {info.maps.map(({ slot, m, fit }) => (
              <li key={slot} className="flex min-w-0 items-center gap-2">
                <span className={dot(fit.ok ? "ok" : "warn")} />
                <span className="min-w-0 break-all font-mono text-xs text-muted-foreground">{m.name}</span>
                <span className="ml-auto shrink-0 text-right text-xs text-muted">{fit.text}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="italic text-muted">None. A map names stack values in the debugger.</p>
        )}
      </section>
      <section className="flex min-w-0 flex-col gap-1.5 md:col-span-2">
        <H>Apps this contract matched</H>
        {apps.length ? (
          <div className="overflow-x-auto rounded border border-border/40">
            <table className="w-full text-xs tabular-nums">
              <thead className="bg-background-card text-left text-[10px] uppercase tracking-wider text-muted">
                <tr>
                  {["Network", "App", "Program", "Matched by", "First seen", "Last seen", ""].map((h) => (
                    <th key={h} className="whitespace-nowrap px-2.5 py-1.5 font-bold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {apps.map((a) => (
                  <tr key={`${a.network}:${a.hash}:${a.appId}`} className="border-t border-border/30 text-muted-foreground">
                    <td className="whitespace-nowrap px-2.5 py-1">{a.network}</td>
                    <td className="whitespace-nowrap px-2.5 py-1 font-mono">{a.appId === undefined ? "—" : a.network === network ? <Link href={`/application/${a.appId}`} keepRound={false}>{a.appId}</Link> : a.appId}</td>
                    <td className="whitespace-nowrap px-2.5 py-1">{a.kind}</td>
                    <td className="whitespace-nowrap px-2.5 py-1" title={`Program hash ${a.hash}`}>{a.exact ? "bytecode" : "TEAL ops"}</td>
                    <td className="whitespace-nowrap px-2.5 py-1">{when(a.firstSeen)}</td>
                    <td className="whitespace-nowrap px-2.5 py-1">{when(a.lastSeen)}</td>
                    <td className="px-2.5 py-1 text-right">
                      <button type="button" aria-label={`Forget app ${a.appId ?? ""}`} title="Forget this app: the debugger records it again when it matches" className="text-muted hover:text-foreground cursor-pointer" onClick={() => onForget(a)}>
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="italic text-muted">No app has matched it yet. Open a transaction of the app in the debugger and it is recorded here.</p>
        )}
      </section>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-xs md:col-span-2">
        <dt className="text-muted">Added from</dt>
        <dd className="min-w-0 break-all font-mono text-muted-foreground">{s.from ?? s.file ?? "the debugger"}</dd>
        <dt className="text-muted">Spec ID</dt>
        <dd className="min-w-0 break-all font-mono text-muted-foreground" title="SHA-512/256 of the spec JSON">
          {s.id.slice(0, 16)}…
        </dd>
      </dl>
    </div>
  );
}
