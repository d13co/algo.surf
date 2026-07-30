#!/usr/bin/env node
//
// Generates public/consensus-versions.json — the protocol-string -> friendly-name table used to
// label consensus upgrades in the UI.
//
// There is no official human-readable name for Algorand consensus protocols: the specs repo has no
// meaningful tags and the developer portal has no mapping table. The only canonical source is
// go-algorand, so we parse it:
//
//   protocol/consensus.go  const ConsensusV41 = ConsensusVersion("https://.../tree/<hash>")
//                          plus the doc comment above each const, and ConsensusCurrentVersion.
//   config/consensus.go    LogicSigVersion (the AVM/TEAL version) and the upgrade-vote params.
//
// AVM version is INHERITED, not declared: config/consensus.go derives each version by copy
// (`v42 := v41`, `vAlpha1 := v32`, `vFnet4 := vFnet1`) and only writes LogicSigVersion when it
// changes. So resolving "what AVM is v33?" means walking that parent chain — which is exactly why
// this is generated rather than hand-maintained.
//
// The output is a checked-in artifact, so a bad parse shows up in `git diff` before it ships.
//
// Usage: node scripts/gen-consensus-versions.mjs [--ref master]
//
// The consumer fetches this file same-origin at /consensus-versions.json. Renaming it is safe as
// long as src/packages/core-sdk/consensusVersions.ts moves with it; bump `schema` for shape changes.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SCHEMA = 1;
const REPO = "algorand/go-algorand";

const refArgIndex = process.argv.indexOf("--ref");
const REF = refArgIndex !== -1 ? process.argv[refArgIndex + 1] : "master";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "consensus-versions.json");

async function fetchText(path) {
  const url = `https://raw.githubusercontent.com/${REPO}/${REF}/${path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.text();
}

async function fetchCommit() {
  const res = await fetch(`https://api.github.com/repos/${REPO}/commits/${REF}`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) return null;
  const body = await res.json();
  return body.sha ?? null;
}

/** ConsensusV41 -> v41, ConsensusFuture -> vFuture, ConsensusVAlpha3 -> alpha3, ConsensusVFnet1 -> fnet1 */
function nameForConst(goConst) {
  let m = goConst.match(/^ConsensusV(\d+)$/);
  if (m) return `v${m[1]}`;
  if (goConst === "ConsensusFuture") return "vFuture";
  m = goConst.match(/^ConsensusVAlpha(\d+)$/);
  if (m) return `alpha${m[1]}`;
  m = goConst.match(/^ConsensusVFnet(\d+)$/);
  if (m) return `fnet${m[1]}`;
  return null;
}

function cleanDescription(docLines, goConst) {
  if (!docLines.length) return null;
  let text = docLines.join(" ").replace(/\s+/g, " ").trim();
  // Doc comments start with the const name ("ConsensusV41 enables txn access, ...").
  if (text.startsWith(goConst)) text = text.slice(goConst.length).trim();
  if (!text) return null;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Pass A: protocol/consensus.go -> { goConst -> { protocol, name, description } } and the
 * const that ConsensusCurrentVersion points at.
 */
function parseProtocolFile(src) {
  const lines = src.split("\n");
  const byConst = new Map();
  let currentVersionConst = null;
  let doc = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith("//")) {
      doc.push(line.slice(2).trim());
      continue;
    }

    const decl = line.match(/^const\s+(\w+)\s*=\s*ConsensusVersion\((.*)$/);
    if (decl) {
      const goConst = decl[1];
      // Find the string literal: same line for the short form, a following line for the gofmt'd
      // multi-line form (which may have its own inner comment lines in between).
      let protocol = null;
      let rest = decl[2];
      for (let j = i; j < lines.length; j++) {
        const sm = rest.match(/"([^"]*)"/);
        if (sm) {
          protocol = sm[1];
          break;
        }
        if (j + 1 >= lines.length) break;
        rest = lines[j + 1].trim();
      }
      if (protocol && !goConst.startsWith("DEPRECATED")) {
        const name = nameForConst(goConst);
        if (name) {
          byConst.set(goConst, { protocol, name, description: cleanDescription(doc, goConst) });
        }
      }
      doc = [];
      continue;
    }

    const cur = line.match(/^const\s+ConsensusCurrentVersion\s*=\s*(Consensus\w+)$/);
    if (cur) currentVersionConst = cur[1];

    doc = [];
  }

  return { byConst, currentVersionConst };
}

const NUMERIC_FIELDS = ["LogicSigVersion", "UpgradeVoteRounds", "UpgradeThreshold"];

/**
 * Pass B: config/consensus.go -> per-params-var field values (walking `v42 := v41` inheritance)
 * and the goConst -> params-var mapping from `Consensus[protocol.ConsensusV41] = v41`.
 */
function parseConfigFile(src) {
  const lines = src.split("\n");
  const parent = new Map(); // var -> var it was copied from
  const explicit = new Map(); // var -> { field -> number }
  const constToVar = new Map(); // ConsensusV41 -> v41

  const setExplicit = (v, field, value) => {
    if (!explicit.has(v)) explicit.set(v, {});
    explicit.get(v)[field] = value;
  };

  let literalVar = null; // inside `v7 := ConsensusParams{ ... }`

  for (const raw of lines) {
    // Strip trailing comments before matching. Several assignments carry them, e.g.
    // `vFuture.LogicSigVersion = 14 // When moving this to a release, ...` — an end-anchored
    // regex would miss those and silently inherit the parent's value instead. Safe here because
    // this file has no string literals on the lines we parse (unlike protocol/consensus.go,
    // where the spec URL itself contains "//").
    const line = raw.replace(/\/\/.*$/, "").trim();
    if (!line) continue;

    if (literalVar) {
      if (line === "}") {
        literalVar = null;
        continue;
      }
      const field = line.match(/^(\w+):\s*(\d+),?$/);
      if (field && NUMERIC_FIELDS.includes(field[1])) {
        setExplicit(literalVar, field[1], Number(field[2]));
      }
      continue;
    }

    const openLiteral = line.match(/^(\w+)\s*:=\s*ConsensusParams\{$/);
    if (openLiteral) {
      literalVar = openLiteral[1];
      continue;
    }

    const copy = line.match(/^(\w+)\s*:=\s*(\w+)$/);
    if (copy && copy[2] !== "ConsensusParams") {
      parent.set(copy[1], copy[2]);
      continue;
    }

    const assign = line.match(/^(\w+)\.(\w+)\s*=\s*(\d+)$/);
    if (assign && NUMERIC_FIELDS.includes(assign[2])) {
      setExplicit(assign[1], assign[2], Number(assign[3]));
      continue;
    }

    const register = line.match(/^Consensus\[protocol\.(Consensus\w+)\]\s*=\s*(\w+)$/);
    if (register) constToVar.set(register[1], register[2]);
  }

  const cache = new Map();
  function resolve(v) {
    if (cache.has(v)) return cache.get(v);
    cache.set(v, {}); // cycle guard — a cycle resolves to empty rather than hanging
    const inherited = parent.has(v) ? resolve(parent.get(v)) : {};
    const merged = { ...inherited, ...(explicit.get(v) ?? {}) };
    cache.set(v, merged);
    return merged;
  }

  return { constToVar, resolve };
}

function sortKey(name) {
  let m = name.match(/^v(\d+)$/);
  if (m) return [0, Number(m[1])];
  if (name === "vFuture") return [1, 0];
  m = name.match(/^alpha(\d+)$/);
  if (m) return [2, Number(m[1])];
  m = name.match(/^fnet(\d+)$/);
  if (m) return [3, Number(m[1])];
  return [4, 0];
}

const SPEC_URL_RE = /^https:\/\/github\.com\/(algorand\/spec|algorandfoundation\/specs)\/tree\/[0-9a-f]{40}$/;

async function main() {
  const [protocolSrc, configSrc, commit] = await Promise.all([
    fetchText("protocol/consensus.go"),
    fetchText("config/consensus.go"),
    fetchCommit(),
  ]);

  const { byConst, currentVersionConst } = parseProtocolFile(protocolSrc);
  const { constToVar, resolve } = parseConfigFile(configSrc);

  const entries = [];
  for (const [goConst, info] of byConst) {
    const paramsVar = constToVar.get(goConst);
    const params = paramsVar ? resolve(paramsVar) : {};

    const entry = { name: info.name };
    if (params.LogicSigVersion) entry.avm = params.LogicSigVersion;
    entry.goConst = goConst;
    if (SPEC_URL_RE.test(info.protocol)) entry.spec = info.protocol;
    if (params.UpgradeVoteRounds) entry.voteRounds = params.UpgradeVoteRounds;
    if (params.UpgradeThreshold) entry.threshold = params.UpgradeThreshold;
    if (info.description) entry.description = info.description;

    entries.push({ protocol: info.protocol, entry });
  }

  entries.sort((a, b) => {
    const [ka, na] = sortKey(a.entry.name);
    const [kb, nb] = sortKey(b.entry.name);
    return ka - kb || na - nb || a.entry.name.localeCompare(b.entry.name);
  });

  const versions = {};
  for (const { protocol, entry } of entries) versions[protocol] = entry;

  const current = currentVersionConst ? byConst.get(currentVersionConst)?.protocol ?? null : null;

  // Sanity gates. Upstream reformatting must fail loudly rather than emit a plausible-looking
  // but empty table.
  const problems = [];
  if (entries.length < 35) problems.push(`only parsed ${entries.length} versions (expected >= 35)`);
  if (!current) problems.push(`could not resolve ConsensusCurrentVersion (${currentVersionConst})`);
  else if (!versions[current]?.avm) problems.push(`current version ${current} has no avm`);
  const withAvm = entries.filter((e) => e.entry.avm).length;
  if (withAvm < 20) problems.push(`only ${withAvm} versions have an avm (expected >= 20)`);
  if (problems.length) {
    console.error("gen-consensus-versions: parse looks wrong, refusing to write:");
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }

  const out = {
    schema: SCHEMA,
    generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    source: { repo: REPO, ref: REF, commit },
    current,
    versions,
  };

  writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
  console.log(
    `gen-consensus-versions: wrote ${entries.length} versions to public/consensus-versions.json\n` +
      `  current: ${versions[current].name} (avm ${versions[current].avm})\n` +
      `  source:  ${REPO}@${(commit ?? REF).slice(0, 12)}`,
  );
}

main().catch((err) => {
  console.error(`gen-consensus-versions: ${err.message}`);
  process.exit(1);
});
