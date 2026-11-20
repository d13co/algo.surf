#!/usr/bin/env node
//
// Generates src/data/avmOps.json: the AVM opcode reference shown in the trace debugger and the
// program view (each op's stack inputs and outputs, immediates, doc, cost, version, and the
// fields of txn, global, asset_params_get and the like).
//
// The source is puya-ts's langspec.puya.json (MIT): go-algorand's langspec reshaped, with the
// stack inputs and outputs named (A, B… and X, Y…, as the docs refer to them) and richer types.
// go-algorand's own langspec_vN.json is AGPL, so it isn't copied from. Ops that puya-ts doesn't
// have yet are in EXTRA below, written here.
//
// The output is a checked-in artifact, so a bad parse shows up in `git diff` before it ships.
//
// Usage: node scripts/gen-avm-ops.mjs [--ref main] [--file path/to/langspec.puya.json]

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SCHEMA = 1;
const REPO = "algorandfoundation/puya-ts";
const PATH = "langspec.puya.json";

const arg = (k) => {
  const i = process.argv.indexOf(k);
  return i !== -1 ? process.argv[i + 1] : undefined;
};
const REF = arg("--ref") ?? "main";
const FILE = arg("--file");

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "data", "avmOps.json");

/** Ops the source doesn't have yet, by name. Same shape as the output's ops. */
const EXTRA = {
  bmodexp: {
    in: [["A", "bigint"], ["B", "bigint"], ["C", "bigint"]],
    out: [["X", "[]byte"]],
    imm: [],
    doc: "A to the power of B, modulo C. A, B and C are big-endian unsigned integers of up to 4096 bytes. Fails if C is zero, or if A and B are both zero.",
    cost: "10 + 1 per 32 bytes of A, B and C, plus more depending on the size of B and C",
    v: 14,
    mode: "any",
    group: "Byte Array Arithmetic",
  },
  mldsa_verify: {
    in: [["A", "[]byte"], ["B", "[]byte"], ["C", "[]byte"], ["D", "[]byte"]],
    out: [["X", "bool"]],
    imm: [["P", "arg_enum", "ML-DSA parameter set", "ML-DSA"]],
    doc: "1 if B is a valid ML-DSA (FIPS 204) signature of data A by public key C, with context D (empty for the default context), else 0.",
    extra:
      "MLDSA44 takes a 2420 byte signature and a 1312 byte public key; MLDSA65 a 3309 byte signature and a 1952 byte public key. The context is at most 255 bytes.",
    cost: "MLDSA44=3700 + 5 per 64 bytes of A; MLDSA65=5850 + 5 per 64 bytes of A",
    v: 14,
    mode: "any",
    group: "Cryptography",
  },
};
const EXTRA_ENUMS = {
  "ML-DSA": {
    MLDSA44: ["none", "ML-DSA-44: 1312 byte public key, 2420 byte signature", 14, "any"],
    MLDSA65: ["none", "ML-DSA-65: 1952 byte public key, 3309 byte signature", 14, "any"],
  },
};

async function load() {
  if (FILE) return { spec: JSON.parse(readFileSync(FILE, "utf8")), commit: null };
  const url = `https://raw.githubusercontent.com/${REPO}/${REF}/${PATH}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  const spec = await res.json();
  const c = await fetch(`https://api.github.com/repos/${REPO}/commits/${REF}`, { headers: { Accept: "application/vnd.github+json" } });
  return { spec, commit: c.ok ? (await c.json()).sha ?? null : null };
}

const io = (xs) => xs.map((x) => [x.name, x.stack_type]);

function convertOp(o) {
  // A string here would split into characters: check() reports the empty result.
  const [doc, ...rest] = Array.isArray(o.doc) ? o.doc : [];
  const op = {
    in: io(o.stack_inputs),
    out: io(o.stack_outputs),
    // [name, type, doc, field table, index of the input or output whose type the field sets]
    imm: o.immediate_args.map((a) => {
      const t = [a.name, a.immediate_type, (a.doc ?? "").trim()];
      if (a.arg_enum) {
        t.push(a.arg_enum);
        if (a.modifies_stack_output != null) t.push(["out", a.modifies_stack_output]);
        else if (a.modifies_stack_input != null) t.push(["in", a.modifies_stack_input]);
      }
      return t;
    }),
    doc,
    cost: o.cost?.doc,
    v: o.min_avm_version,
    mode: o.mode,
    group: o.groups?.[0],
  };
  if (rest.length) op.extra = rest.join("\n\n");
  if (o.halts) op.halts = true;
  return op;
}

async function main() {
  const { spec, commit } = await load();
  const ops = {};
  for (const [name, o] of Object.entries(spec.ops)) ops[name] = convertOp(o);
  for (const [name, o] of Object.entries(EXTRA)) if (!ops[name]) ops[name] = o;

  // field table → field → [type, doc, version, mode]
  const enums = {};
  for (const [name, fields] of Object.entries(spec.arg_enums)) {
    enums[name] = Object.fromEntries(fields.map((f) => [f.name, [f.stack_type ?? "none", (f.doc ?? "").trim(), f.min_avm_version, f.mode]]));
  }
  for (const [name, e] of Object.entries(EXTRA_ENUMS)) if (!enums[name]) enums[name] = e;

  const problems = [];
  const n = Object.keys(ops).length;
  if (n < 190) problems.push(`only ${n} ops (expected >= 190)`);
  for (const k of ["+", "txn", "app_global_get_ex", "box_get", "itxn_field", "frame_dig", "match"]) if (!ops[k]) problems.push(`no ${k}`);
  const str = (x) => typeof x === "string" && x.length > 0;
  const MODES = ["any", "app", "sig"];
  for (const [k, o] of Object.entries(ops)) {
    if (!str(o.doc)) problems.push(`${k}: no doc`);
    if (o.extra !== undefined && !str(o.extra)) problems.push(`${k}: bad extra doc`);
    if (!str(o.cost)) problems.push(`${k}: no cost`);
    if (!str(o.group)) problems.push(`${k}: no group`);
    if (!MODES.includes(o.mode)) problems.push(`${k}: unknown mode ${o.mode}`);
    if (!Number.isInteger(o.v) || o.v < 1) problems.push(`${k}: bad version ${o.v}`);
    for (const [side, xs] of [["in", o.in], ["out", o.out]]) {
      if (!xs.every((x) => str(x[0]) && str(x[1]))) problems.push(`${k}: bad stack ${side}`);
    }
    for (const im of o.imm) {
      if (!str(im[0]) || !str(im[1])) problems.push(`${k}: bad immediate`);
      if (im[3] && !enums[im[3]]) problems.push(`${k}: unknown field table ${im[3]}`);
      const mod = im[4];
      if (mod && !(Number.isInteger(mod[1]) && mod[1] >= 0 && mod[1] < (mod[0] === "in" ? o.in : o.out).length)) problems.push(`${k}: field sets a missing stack ${mod[0]}`);
    }
  }
  for (const [t, fields] of Object.entries(enums)) {
    for (const [f, x] of Object.entries(fields)) if (!str(x[0]) || typeof x[1] !== "string" || !Number.isInteger(x[2])) problems.push(`${t}.${f}: bad field`);
  }
  if (problems.length) {
    console.error("gen-avm-ops: parse looks wrong, refusing to write:");
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }

  const sorted = Object.fromEntries(Object.keys(ops).sort().map((k) => [k, ops[k]]));
  // One op, and one field table, per line: diffs stay readable; the bundle minifies it anyway.
  const lines = (o) => Object.entries(o).map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(",\n");
  const source = JSON.stringify({ repo: REPO, path: PATH, ref: REF, commit });
  writeFileSync(OUT, `{\n  "schema": ${SCHEMA},\n  "source": ${source},\n  "ops": {\n${lines(sorted)}\n  },\n  "enums": {\n${lines(enums)}\n  }\n}\n`);
  console.log(`gen-avm-ops: wrote ${n} ops, ${Object.keys(enums).length} field tables to src/data/avmOps.json\n  source: ${REPO}@${(commit ?? REF).slice(0, 12)}`);
}

main().catch((err) => {
  console.error(`gen-avm-ops: ${err.message}`);
  process.exit(1);
});
