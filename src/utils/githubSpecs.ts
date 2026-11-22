import type { FolderEntry } from "./specLibrary";

/**
 * Contracts from a public GitHub repo, for the Contracts page: a link to a
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
 * `…/commit/<sha>`, `raw.githubusercontent.com/o/r/<ref>/<path>`. Other
 * pages of a repo (issues, pulls) read as the repo. Undefined for anything else.
 */
export function parseGithubLink(input: string): GithubLink | undefined {
  const s = input.trim();
  if (!s) return undefined;
  const ssh = /^git@github\.com:([^/]+)\/([^/]+?)\/?$/i.exec(s);
  if (ssh) {
    const r = repoOf(ssh[1], ssh[2]);
    return r && { ...r, kind: "root", rest: [] };
  }
  const short = /^([^/\s:]+)\/([^/\s:]+?)\/?$/.exec(s);
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
    return r && segs.length > 3 ? { ...r, kind: "blob", rest: segs.slice(2) } : undefined;
  }
  if (host !== "github.com" && host !== "www.github.com") return undefined;
  const r = repoOf(segs[0], segs[1]);
  if (!r) return undefined;
  const [kind, ...rest] = segs.slice(2);
  if ((kind === "tree" || kind === "blob") && rest.length) return { ...r, kind, rest };
  if (kind === "commit" && rest.length) return { ...r, kind: "tree", rest: rest.slice(0, 1) };
  return { ...r, kind: "root", rest: [] };
}

/** What a GitHub request failed with, as the page tells it. */
export class GithubError extends Error {}

type Fetch = typeof fetch;

const API = "https://api.github.com";
const encPath = (p: string) => p.split("/").map(encodeURIComponent).join("/");

function limitHit(res: Response): string | undefined {
  if ((res.status !== 403 && res.status !== 429) || res.headers.get("x-ratelimit-remaining") !== "0") return undefined;
  const reset = Number(res.headers.get("x-ratelimit-reset"));
  const at = reset ? ` Try again after ${new Date(reset * 1000).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}.` : "";
  return `GitHub's limit of 60 requests an hour from this network is used up.${at}`;
}

async function call(f: Fetch, path: string, accept = "application/vnd.github+json"): Promise<Response> {
  let res: Response;
  try {
    res = await f(`${API}${path}`, { headers: { Accept: accept } });
  } catch (e) {
    throw new GithubError(`Couldn't reach GitHub: ${e instanceof Error ? e.message : String(e)}`);
  }
  const limit = limitHit(res);
  if (limit) throw new GithubError(limit);
  return res;
}

const failed = (res: Response, what: string) => new GithubError(`GitHub couldn't give ${what} (${res.status}${res.statusText ? ` ${res.statusText}` : ""}).`);

/** A link's commit: the default branch's head for a repo link, else the shortest ref of its segments that GitHub knows; the segments after it are the path. */
export async function resolveRef(link: GithubLink, f: Fetch = fetch): Promise<{ sha: string; ref: string; path: string }> {
  const name = `${link.owner}/${link.repo}`;
  const commit = async (ref: string) => {
    const res = await call(f, `/repos/${name}/commits/${encPath(ref)}`, "application/vnd.github.sha");
    if (res.ok) {
      const sha = (await res.text()).trim();
      if (/^[0-9a-f]{40}$/.test(sha)) return sha;
      throw new GithubError(`GitHub gave no commit for ${ref} in ${name}.`);
    }
    if (res.status === 404 || res.status === 422) return undefined;
    throw failed(res, `${ref} in ${name}`);
  };
  if (!link.rest.length) {
    const res = await call(f, `/repos/${name}`);
    if (res.status === 404) throw new GithubError(`${name}: no such repo on GitHub, or it is private. Only public repos can be read.`);
    if (!res.ok) throw failed(res, name);
    const ref = ((await res.json()) as { default_branch?: string }).default_branch;
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
  const res = await call(f, `/repos/${name}/git/trees/${sha}?recursive=1`);
  if (!res.ok) throw failed(res, `the files of ${name}`);
  const tree = (await res.json()) as { tree?: { path: string; type: string }[]; truncated?: boolean };
  const root = `${link.repo}/`;
  const files: FolderEntry[] = (tree.tree ?? [])
    .filter((e) => e.type === "blob")
    .map((e) => ({
      name: e.path.slice(e.path.lastIndexOf("/") + 1),
      path: root + e.path,
      read: async () => {
        let r: Response;
        try {
          r = await f(`https://raw.githubusercontent.com/${name}/${sha}/${encPath(e.path)}`);
        } catch (err) {
          throw new GithubError(`Couldn't read ${e.path} from GitHub: ${err instanceof Error ? err.message : String(err)}`);
        }
        if (!r.ok) throw new GithubError(`Couldn't read ${e.path} from GitHub (${r.status}).`);
        return r.text();
      },
    }));
  const clean = path.replace(/\/+$/, "");
  return {
    files,
    ...(clean && { scope: root + clean }),
    truncated: !!tree.truncated,
    label: `${name}@${/^[0-9a-f]{40}$/.test(ref) ? ref.slice(0, 7) : ref}${clean ? `/${clean}` : ""}`,
    blobUrl: (p) => `https://github.com/${name}/blob/${sha}/${encPath(p.startsWith(root) ? p.slice(root.length) : p)}`,
  };
}
