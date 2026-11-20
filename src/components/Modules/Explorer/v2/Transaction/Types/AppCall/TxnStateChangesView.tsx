import React, { useState } from "react";
import { History } from "lucide-react";
import { withRound } from "src/hooks/useRound";
import type { Change, DJson } from "src/utils/versionDelta";
import { byApp, boxValue, changeId, explorerInnerPath, SCAppChanges, SCAttribution, SCChange, SCTealValue } from "src/utils/txnStateChanges";
import JsonDiffTree from "src/components/v2/JsonDiffTree";
import MultiFormatViewer from "src/components/v2/MultiFormatViewer";
import { Chip } from "src/components/v2/Chips";
import Copyable from "src/components/v2/Copyable";
import Link from "../../../Links/Link";
import LinkToAccount from "../../../Links/LinkToAccount";
import LinkToApplication from "../../../Links/LinkToApplication";
import { BoxValueDiff, byteLength, SHORT_VALUE, SizeNote } from "../../../Application/BoxValueDiff";
import { useBoxValueTypes } from "../../../Application/BoxValue";

/** A TEAL value as the diff tree reads it: an integer, or bytes. */
function asDJson(v: SCTealValue): DJson {
  return v.type === 2 ? (v.uint ?? 0) : { $bytes: v.bytes ?? "" };
}

function changeOf(c: SCChange): Change {
  if (!c.before) return { path: [], kind: "added", after: asDJson(c.after!) };
  if (!c.after) return { path: [], kind: "removed", before: asDJson(c.before) };
  return { path: [], kind: "changed", before: asDJson(c.before), after: asDJson(c.after) };
}

function StatusChip({ c }: { c: SCChange }) {
  if (!c.before) return <Chip className="border-green-400 text-green-400">created</Chip>;
  if (!c.after) return <Chip className="border-red-400 text-red-400">deleted</Chip>;
  return null;
}

/** Who changed each key, for a transaction with inner transactions; the inner transaction's href by its node path. */
export type Attribution = { of: Map<string, SCAttribution>; innerHref: (path: number[]) => string };

/** Who changed a key: the transaction's own code, and the innermost inner transactions that did. */
function ChangedBy({ c, attribution }: { c: SCChange; attribution?: Attribution }) {
  const a = attribution?.of.get(changeId(c));
  if (!a) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
      {a.own ? <span className="text-muted-foreground" title="Changed by this transaction's own code">this call</span> : null}
      {a.via.map((path) => {
        const label = explorerInnerPath(path);
        return (
          <Link key={label} href={attribution!.innerHref(path)} title={`Changed by inner transaction ${label}`}>
            inner {label}
          </Link>
        );
      })}
    </span>
  );
}

/** Global or local keys: key, then its value before → after. */
function KeyChanges({ changes, attribution }: { changes: SCChange[]; attribution?: Attribution }) {
  return (
    <div className="text-sm">
      {changes.map((c) => (
        <div key={c.key} className="border-b border-border py-2 grid grid-cols-1 md:grid-cols-[minmax(0,30%)_minmax(0,1fr)] gap-x-4 gap-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
            <span className="min-w-0 truncate">
              {/* An app may use the empty key. */}
              {c.key ? <MultiFormatViewer view="auto" value={c.key} side="left" /> : <span className="text-muted-foreground italic">(empty key)</span>}
            </span>
            <StatusChip c={c} />
            <ChangedBy c={c} attribution={attribution} />
          </div>
          <div className="min-w-0 break-words">
            <JsonDiffTree value={{ $change: changeOf(c) }} groupDigits copyInts />
          </div>
        </div>
      ))}
    </div>
  );
}

/** A button copying a box's whole value (base64), before or after. */
function CopyValue({ label, value }: { label: string; value: string | null }) {
  if (value === null) return null;
  return (
    <Copyable value={value} className="text-xs text-muted-foreground hover:text-foreground">
      {label}
    </Copyable>
  );
}

/**
 * A box's change: the changed lines, or, toggled, its whole value with the
 * changes marked in it; its whole value before and after to copy.
 */
function BoxChange({ c, types, attribution }: { c: SCChange; types?: string[]; attribution?: Attribution }) {
  const [full, setFull] = useState(false);
  const before = boxValue(c.before);
  const after = boxValue(c.after);
  // Short values already show whole.
  const long = byteLength(before) > SHORT_VALUE || byteLength(after) > SHORT_VALUE;
  return (
    <div className="border-b border-border py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="min-w-0 max-w-full truncate">
          <MultiFormatViewer view="auto" value={c.key} side="left" />
        </span>
        <StatusChip c={c} />
        <SizeNote before={before} after={after} />
        <ChangedBy c={c} attribution={attribution} />
        <span className="ml-auto inline-flex items-center gap-3">
          {long ? (
            <button type="button" className="text-xs text-primary hover:underline cursor-pointer" onClick={() => setFull((f) => !f)}>
              {full ? "Show changes only" : "Show full value"}
            </button>
          ) : null}
          <CopyValue label="before" value={before} />
          <CopyValue label="after" value={after} />
        </span>
      </div>
      <div className="mt-1.5">
        <BoxValueDiff before={before} after={after} types={types} full={full} />
      </div>
    </div>
  );
}

function BoxChanges({ appId, changes, attribution }: { appId: number; changes: SCChange[]; attribution?: Attribution }) {
  const { types } = useBoxValueTypes(appId);
  return (
    <div className="text-sm">
      {changes.map((c) => (
        <BoxChange key={c.key} c={c} types={types} attribution={attribution} />
      ))}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-sm font-medium mt-4 mb-1.5">{children}</div>;
}

function AppChanges({ app, round, attribution }: { app: SCAppChanges; round: number; attribution?: Attribution }) {
  const { appId, globals, locals, boxes } = app;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-sm">
          App <LinkToApplication id={appId} copy="right" copySize="s" />
        </span>
        <span className="ml-auto inline-flex items-center gap-3 text-sm">
          <History className="h-4 w-4 text-muted-foreground" />
          {round > 1 ? (
            <>
              <Link href={withRound(`/application/${appId}`, round - 1)} keepRound={false}>
                View app at {round - 1}
              </Link>
              <Link href={withRound(`/application/${appId}`, round)} keepRound={false}>
                at {round}
              </Link>
            </>
          ) : (
            <Link href={withRound(`/application/${appId}`, round)} keepRound={false}>
              View app at {round}
            </Link>
          )}
        </span>
      </div>

      {globals.length ? (
        <>
          <SectionTitle>Global state ({globals.length.toLocaleString()})</SectionTitle>
          <KeyChanges changes={globals} attribution={attribution} />
        </>
      ) : null}

      {locals.length ? (
        <>
          <SectionTitle>Local state</SectionTitle>
          <div className="space-y-3">
            {locals.map(({ account, changes }) => (
              <div key={account}>
                <div className="text-[13px] mb-1 break-words overflow-hidden">
                  <LinkToAccount copySize="m" address={account} subPage={`opted-applications/${appId}`} />
                </div>
                <KeyChanges changes={changes} attribution={attribution} />
              </div>
            ))}
          </div>
        </>
      ) : null}

      {boxes.length ? (
        <>
          <SectionTitle>Boxes ({boxes.length.toLocaleString()})</SectionTitle>
          <BoxChanges appId={appId} changes={boxes} attribution={attribution} />
        </>
      ) : null}
    </div>
  );
}

/**
 * What one transaction did to app state, each key and box with its value
 * before and after the transaction, by app. A transaction's changes include
 * its inner transactions'; with `attribution`, each says who made it.
 */
export default function TxnStateChangesView({ changes, round, attribution, empty = "No app state changes" }: {
  changes: SCChange[];
  round: number;
  attribution?: Attribution;
  empty?: string;
}): JSX.Element {
  // An entry has a before, an after or both; one with neither changed nothing.
  const apps = byApp(changes.filter((c) => c.before || c.after));
  if (!apps.length) return <div className="text-sm text-muted-foreground">{empty}</div>;
  return (
    <div className="space-y-6">
      {apps.map((app) => (
        <AppChanges key={app.appId} app={app} round={round} attribution={attribution} />
      ))}
    </div>
  );
}
