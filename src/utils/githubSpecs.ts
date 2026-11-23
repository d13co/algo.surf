import type { FolderEntry } from "./specLibrary";
import { createLimit } from "./limit";

/**
 * Contracts from a public GitHub repo, for the Contracts & Specs page: a link to a
 * repo, a folder in it (`/tree/<ref>/<path>`) or a spec (`/blob/<ref>/<path>`)
 * becomes the repo's files as a chosen folder's (see importFolder), each read
 * from raw.githubusercontent.com at the commit the link resolves to. Only the
 * files the import needs are fetched: the specs, their maps and their source
 * files.
 */

/** A GitHub link: its repo, and the ref and path segments after `tree/` or `blob/` (a ref may hold slashes, so they come as one list). */
export type GithubLink = { owner: string; repo: string; kind: "root" | "tree" | "blob"; rest: string[] };

const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;

function repoOf(owner: string | undefined, repo: string | undefined): { owner: string; repo: string } | undefined {
  const r = repo?.replace(/\.git$/i, "");
  if (!owner || !r || !OWNER.test(owner) || !REPO.test(r) || r === "." || r === "..") return undefined;
  return { owner, repo: r };
}

/** `refs/heads/<branch>` and `refs/tags/<tag>` (as raw links have them) as the branch or tag. */
const unref = (segs: string[]) => (segs[0] === "refs" && (segs[1] === "heads" || segs[1] === "tags") && segs.length > 2 ? segs.slice(2) : segs);

const decode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/**
 * Reads a GitHub link: `https://github.com/o/r`, `github.com/o/r`, `o/r`,
 * `git@github.com:o/r.git`, `…/tree/<ref>/<path>`, `…/blob/<ref>/<path>`,
 * `…/commit/<sha>`, `raw.githubusercontent.com/o/r/<ref>/<path>`; a file's
 * raw, blame and edit pages read as its blob, a ref's commits page as its
 * tree. Other pages of a repo (issues, pulls) read as the repo. Undefined for
 * anything else.
 */
export function parseGithubLink(input: string): GithubLink | undefined {
  const s = input.trim();
  if (!s) return undefined;
  // The short forms with a page's #fragment or ?query left on.
  const bare = s.replace(/[?#].*$/, "");
  const ssh = /^git@github\.com:([^/]+)\/([^/]+?)\/?$/i.exec(bare);
  if (ssh) {
    const r = repoOf(ssh[1], ssh[2]);
    return r && { ...r, kind: "root", rest: [] };
  }
  const short = /^([^/\s:]+)\/([^/\s:]+?)\/?$/.exec(bare);
  if (short && !short[1].includes(".")) {
    const r = repoOf(short[1], short[2]);
    return r && { ...r, kind: "root", rest: [] };
  }
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
  const host = url.hostname.toLowerCase();
  const segs = url.pathname.split("/").filter(Boolean).map(decode);
  if (host === "raw.githubusercontent.com") {
    const r = repoOf(segs[0], segs[1]);
    return r && segs.length > 3 ? { ...r, kind: "blob", rest: unref(segs.slice(2)) } : undefined;
  }
  if (host !== "github.com" && host !== "www.github.com") return undefined;
  const r = repoOf(segs[0], segs[1]);
  if (!r) return undefined;
  const [kind, ...rest] = segs.slice(2);
  if (!rest.length) return { ...r, kind: "root", rest: [] };
  if (kind === "tree" || kind === "commits") return { ...r, kind: "tree", rest: unref(rest) };
  if (kind === "blob" || kind === "raw" || kind === "blame" || kind === "edit") return { ...r, kind: "blob", rest: unref(rest) };
  if (kind === "commit") return { ...r, kind: "tree", rest: rest.slice(0, 1) };
  return { ...r, kind: "root", rest: [] };
}

/** What a GitHub request failed with, as the page tells it. */
export class GithubError extends Error {}

type Fetch = typeof fetch;

const API = "https://api.github.com";
const encPath = (p: string) => p.split("/").map(encodeURIComponent).join("/");

const clock = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

/** GitHub limiting this network: the hourly limit used up, or a short wait asked for (`retry-after`, its secondary limits). */
function limitHit(res: Response): string | undefined {
  if (res.status !== 403 && res.status !== 429) return undefined;
  const wait = Number(res.headers.get("retry-after"));
  if (res.headers.get("x-ratelimit-remaining") === "0") {
    const reset = Number(res.headers.get("x-ratelimit-reset"));
    return `GitHub's limit of 60 requests an hour from this network is used up.${reset ? ` Try again after ${clock(reset * 1000)}.` : ""}`;
  }
  if (wait > 0 || res.status === 429) return `GitHub is limiting requests from this network.${wait > 0 ? ` Try again after ${clock(Date.now() + wait * 1000)}.` : " Try again in a few minutes."}`;
  return undefined;
}

/** How long a request to GitHub may take before it's given up on, so a stalled one doesn't hold the page. */
const TIMEOUT = 30_000;

const late = (e: unknown) => e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError");
const lateError = (what: string) => new GithubError(`GitHub didn't answer in ${TIMEOUT / 1000} s for ${what}.`);

/** A request to GitHub: no answer (offline, or none in time) is a GithubError. The time limit covers reading the body too (see `body`). */
async function get(f: Fetch, url: string, what: string, headers?: Record<string, string>): Promise<Response> {
  try {
    return await f(url, { headers, signal: AbortSignal.timeout(TIMEOUT) });
  } catch (e) {
    throw late(e) ? lateError(what) : new GithubError(`Couldn't reach GitHub for ${what}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** A response's text; its time running out on the way is a GithubError. */
async function body(res: Response, what: string): Promise<string> {
  try {
    return await res.text();
  } catch (e) {
    throw late(e) ? lateError(what) : new GithubError(`Couldn't read GitHub's answer for ${what}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function call(f: Fetch, path: string, what: string, accept = "application/vnd.github+json"): Promise<Response> {
  const res = await get(f, `${API}${path}`, what, { Accept: accept });
  const limit = limitHit(res);
  if (limit) throw new GithubError(limit);
  return res;
}

/** A response's JSON; a body that isn't JSON (a proxy's page, say) is GitHub failing. */
async function json<T>(res: Response, what: string): Promise<T> {
  const text = await body(res, what);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new GithubError(`GitHub's answer for ${what} wasn't JSON.`);
  }
}

const failed = (res: Response, what: string) => new GithubError(`GitHub couldn't give ${what} (${res.status}${res.statusText ? ` ${res.statusText}` : ""}).`);

/** A link's commit: the default branch's head for a repo link, else the shortest ref of its segments that GitHub knows; the segments after it are the path. */
export async function resolveRef(link: GithubLink, f: Fetch = fetch): Promise<{ sha: string; ref: string; path: string }> {
  const name = `${link.owner}/${link.repo}`;
  const commit = async (ref: string) => {
    const res = await call(f, `/repos/${name}/commits/${encPath(ref)}`, `${ref} in ${name}`, "application/vnd.github.sha");
    if (res.ok) {
      const sha = (await body(res, `${ref} in ${name}`)).trim();
      if (/^[0-9a-f]{40}$/.test(sha)) return sha;
      throw new GithubError(`GitHub gave no commit for ${ref} in ${name}.`);
    }
    if (res.status === 404 || res.status === 422) return undefined;
    if (res.status === 409) throw new GithubError(`${name} is empty: it has no commits.`);
    throw failed(res, `${ref} in ${name}`);
  };
  if (!link.rest.length) {
    const res = await call(f, `/repos/${name}`, name);
    if (res.status === 404) throw new GithubError(`${name}: no such repo on GitHub, or it is private. Only public repos can be read.`);
    if (!res.ok) throw failed(res, name);
    const ref = (await json<{ default_branch?: string }>(res, name)).default_branch;
    if (!ref) throw new GithubError(`${name} has no default branch: is it empty?`);
    const sha = await commit(ref);
    if (!sha) throw new GithubError(`${name} has no commits on ${ref}.`);
    return { sha, ref, path: "" };
  }
  // Shortest first: most refs are one segment. A few tries at most, to spare the hourly limit.
  const tries = Math.min(link.rest.length, 5);
  for (let i = 1; i <= tries; i++) {
    const ref = link.rest.slice(0, i).join("/");
    const sha = await commit(ref);
    if (sha) return { sha, ref, path: link.rest.slice(i).join("/") };
  }
  throw new GithubError(`${name}: no branch, tag or commit ${link.rest[0]}, or the repo is private or missing. Only public repos can be read.`);
}

export type GithubFiles = {
  /** The repo's files as a chosen folder's: under the repo's name. */
  files: FolderEntry[];
  /** Where the link points in the repo (a folder or a spec), under the repo's name; specs are taken from there only. */
  scope?: string;
  /** The tree was too big for GitHub to list whole: some files are missing. */
  truncated: boolean;
  /** `owner/repo@ref`, and `/path` when the link has one. */
  label: string;
  /** The page on GitHub of a file (by its path in `files`), at the commit read. */
  blobUrl: (path: string) => string;
};

/** The repo's files at the link's commit, each read only when asked. */
export async function githubFiles(link: GithubLink, f: Fetch = fetch): Promise<GithubFiles> {
  const name = `${link.owner}/${link.repo}`;
  const { sha, ref, path } = await resolveRef(link, f);
  if (link.kind === "blob" && !path) throw new GithubError(`The link names ${ref} in ${name} but no file.`);
  const res = await call(f, `/repos/${name}/git/trees/${sha}?recursive=1`, `the files of ${name}`);
  if (!res.ok) throw failed(res, `the files of ${name}`);
  const tree = await json<{ tree?: { path: string; type: string }[]; truncated?: boolean }>(res, `the files of ${name}`);
  const root = `${link.repo}/`;
  // A folder's specs are read at once: a few files at a time, so each read gets its 30 s on a slow link.
  const rawLimit = createLimit(6);
  const files: FolderEntry[] = (tree.tree ?? [])
    .filter((e) => e.type === "blob")
    .map((e) => {
      // Read once: a source file several specs name is fetched for the first and shared with the rest.
      // A failed read isn't kept: a spec that asks again later tries again.
      let text: Promise<string> | undefined;
      return {
        name: e.path.slice(e.path.lastIndexOf("/") + 1),
        path: root + e.path,
        read: () =>
          (text ??= rawLimit(async () => {
            const r = await get(f, `https://raw.githubusercontent.com/${name}/${sha}/${encPath(e.path)}`, e.path);
            if (!r.ok) throw new GithubError(limitHit(r) ?? `Couldn't read ${e.path} from GitHub (${r.status}).`);
            return body(r, e.path);
          }).catch((err) => {
            text = undefined;
            throw err;
          })),
      };
    });
  const clean = path.replace(/\/+$/, "");
  return {
    files,
    ...(clean && { scope: root + clean }),
    truncated: !!tree.truncated,
    label: `${name}@${/^[0-9a-f]{40}$/.test(ref) ? ref.slice(0, 7) : ref}${clean ? `/${clean}` : ""}`,
    blobUrl: (p) => `https://github.com/${name}/blob/${sha}/${encPath(p.startsWith(root) ? p.slice(root.length) : p)}`,
  };
}
