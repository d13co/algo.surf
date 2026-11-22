import { describe, expect, it } from "vitest";
import { githubFiles, parseGithubLink, resolveRef, type GithubLink } from "./githubSpecs";

const SHA = "0123456789abcdef0123456789abcdef01234567";

/** A fetch that answers from a table of URLs, and records what was asked. */
function stub(routes: Record<string, () => Response>) {
  const asked: string[] = [];
  const f = (async (input: RequestInfo | URL) => {
    const url = String(input);
    asked.push(url);
    const r = routes[url];
    return r ? r() : new Response("not found", { status: 404 });
  }) as typeof fetch;
  return { f, asked };
}
const json = (o: unknown) => () => new Response(JSON.stringify(o), { status: 200 });
const sha = () => new Response(SHA, { status: 200 });

describe("parseGithubLink", () => {
  it("reads repo links in their usual forms", () => {
    const repo = { owner: "algorandfoundation", repo: "puya-ts", kind: "root", rest: [] };
    for (const s of [
      "https://github.com/algorandfoundation/puya-ts",
      "github.com/algorandfoundation/puya-ts/",
      "www.github.com/algorandfoundation/puya-ts.git",
      "algorandfoundation/puya-ts",
      "git@github.com:algorandfoundation/puya-ts.git",
      "https://github.com/algorandfoundation/puya-ts/issues/12",
      "  https://github.com/algorandfoundation/puya-ts?tab=readme  ",
    ])
      expect(parseGithubLink(s), s).toEqual(repo);
  });

  it("reads folder, file, commit and raw links, ref and path as one list", () => {
    expect(parseGithubLink("https://github.com/o/r/tree/feature/x/smart_contracts/artifacts")).toEqual({ owner: "o", repo: "r", kind: "tree", rest: ["feature", "x", "smart_contracts", "artifacts"] });
    expect(parseGithubLink("github.com/o/r/blob/main/a/Escreg.arc56.json")).toEqual({ owner: "o", repo: "r", kind: "blob", rest: ["main", "a", "Escreg.arc56.json"] });
    expect(parseGithubLink(`https://github.com/o/r/commit/${SHA}`)).toEqual({ owner: "o", repo: "r", kind: "tree", rest: [SHA] });
    expect(parseGithubLink("https://raw.githubusercontent.com/o/r/main/a/X.arc56.json")).toEqual({ owner: "o", repo: "r", kind: "blob", rest: ["main", "a", "X.arc56.json"] });
    expect(parseGithubLink("https://github.com/o/r/tree/main/with%20space")?.rest).toEqual(["main", "with space"]);
  });

  it("rejects what isn't a GitHub repo", () => {
    for (const s of ["", "github.com", "github.com/o", "https://gitlab.com/o/r", "https://example.com/o/r", "ftp://github.com/o/r", "o", "o/r/x", "-bad/r", "o/..", "https://raw.githubusercontent.com/o/r/main"])
      expect(parseGithubLink(s), s).toBeUndefined();
  });
});

describe("resolveRef", () => {
  it("takes the default branch's head for a repo link", async () => {
    const { f, asked } = stub({ "https://api.github.com/repos/o/r": json({ default_branch: "main" }), "https://api.github.com/repos/o/r/commits/main": sha });
    expect(await resolveRef(parseGithubLink("o/r")!, f)).toEqual({ sha: SHA, ref: "main", path: "" });
    expect(asked).toHaveLength(2);
  });

  it("finds a ref with slashes, shortest first, and the path after it", async () => {
    const { f, asked } = stub({ "https://api.github.com/repos/o/r/commits/feature/x": sha });
    const link = parseGithubLink("https://github.com/o/r/tree/feature/x/smart_contracts/artifacts")!;
    expect(await resolveRef(link, f)).toEqual({ sha: SHA, ref: "feature/x", path: "smart_contracts/artifacts" });
    expect(asked).toEqual(["https://api.github.com/repos/o/r/commits/feature", "https://api.github.com/repos/o/r/commits/feature/x"]);
  });

  it("says when the repo is missing or private, or the limit is used up", async () => {
    await expect(resolveRef(parseGithubLink("o/r")!, stub({}).f)).rejects.toThrow(/private/);
    const limited = stub({ "https://api.github.com/repos/o/r": () => new Response("", { status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1700000000" } }) });
    await expect(resolveRef(parseGithubLink("o/r")!, limited.f)).rejects.toThrow(/60 requests an hour/);
    const link: GithubLink = { owner: "o", repo: "r", kind: "tree", rest: ["nope", "a"] };
    await expect(resolveRef(link, stub({}).f)).rejects.toThrow(/no branch, tag or commit nope/);
  });
});

describe("githubFiles", () => {
  const tree = json({
    truncated: false,
    tree: [
      { path: "contracts", type: "tree" },
      { path: "contracts/escreg/contract.algo.ts", type: "blob" },
      { path: "contracts/artifacts/Escreg.arc56.json", type: "blob" },
    ],
  });

  it("lists the repo's files under its name, read at the commit", async () => {
    const { f, asked } = stub({
      "https://api.github.com/repos/o/r/commits/main": sha,
      [`https://api.github.com/repos/o/r/git/trees/${SHA}?recursive=1`]: tree,
      [`https://raw.githubusercontent.com/o/r/${SHA}/contracts/artifacts/Escreg.arc56.json`]: () => new Response("{}", { status: 200 }),
    });
    const gh = await githubFiles(parseGithubLink("github.com/o/r/tree/main/contracts/artifacts/")!, f);
    expect(gh.files.map((x) => [x.name, x.path])).toEqual([
      ["contract.algo.ts", "r/contracts/escreg/contract.algo.ts"],
      ["Escreg.arc56.json", "r/contracts/artifacts/Escreg.arc56.json"],
    ]);
    expect(gh.scope).toBe("r/contracts/artifacts");
    expect(gh.label).toBe("o/r@main/contracts/artifacts");
    expect(gh.truncated).toBe(false);
    expect(gh.blobUrl("r/contracts/artifacts/Escreg.arc56.json")).toBe(`https://github.com/o/r/blob/${SHA}/contracts/artifacts/Escreg.arc56.json`);
    // Nothing read until asked.
    expect(asked).toHaveLength(2);
    expect(await gh.files[1].read()).toBe("{}");
    await expect(gh.files[0].read()).rejects.toThrow(/contract\.algo\.ts.*404/);
  });

  it("wants a file after the ref in a blob link", async () => {
    const { f } = stub({ "https://api.github.com/repos/o/r/commits/main": sha });
    await expect(githubFiles({ owner: "o", repo: "r", kind: "blob", rest: ["main"] }, f)).rejects.toThrow(/no file/);
  });
});
