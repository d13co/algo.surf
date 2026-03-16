import React, { useCallback, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import BoxesList from "../BoxesList";
import BoxSearchBar, { BoxSearchMode } from "../BoxSearchBar";
import { useApplicationBoxNames, useApplicationBox } from "src/hooks/useApplication";
import MultiFormatViewer from "src/components/v2/MultiFormatViewer";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "src/components/v2/ui/dialog";
import { Input } from "src/components/v2/ui/input";
import Copyable from "src/components/v2/Copyable";
import { ArrowLeftFromLine, ArrowRightFromLine, Loader2 } from "lucide-react";
import { useHotkeys } from "react-hotkeys-hook";
import { ABIType, isValidAddress, decodeAddress } from "algosdk";
import { getABIDecodedValue } from "@algorandfoundation/algokit-utils/types/app-arc56";
import { BoxClient } from "src/packages/core-sdk/clients/boxClient";
import explorer from "src/utils/dappflow";
import { A_BoxName } from "src/packages/core-sdk/types";

// --- Value type filter parsing ---

interface ParsedTypes {
  types: string[];
  error?: string;
}

function parseTypeFilter(filter: string): ParsedTypes | null {
  const trimmed = filter.trim();
  if (!trimmed) return null;
  const types: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of trimmed) {
    if (char === "(") depth++;
    if (char === ")") depth--;
    if (char === " " && depth === 0) {
      if (current) types.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (current) types.push(current);
  if (types.length === 0) return null;

  for (const t of types) {
    try {
      ABIType.from(t);
    } catch {
      return { types, error: `Invalid ARC4 type: ${t}` };
    }
  }
  return { types };
}

// --- Decoded value rendering ---

interface DecodedEntry {
  type: string;
  value: string;
  copyValue?: string;
  base64Value?: string;
  indent: number;
}

function isByteArrayType(abiType: ABIType): boolean {
  return "childType" in abiType && (abiType as any).childType.toString() === "byte";
}

function toBase64(value: unknown): string {
  if (value instanceof Uint8Array) return Buffer.from(value).toString("base64");
  return String(value);
}

function flattenDecoded(value: unknown, type: string, indent: number): DecodedEntry[] {
  const abiType = ABIType.from(type);
  const entries: DecodedEntry[] = [];

  if ("childTypes" in abiType && Array.isArray((abiType as any).childTypes)) {
    const childTypes = (abiType as any).childTypes as ABIType[];
    const values = value as unknown[];
    entries.push({ type, value: "", indent });
    for (let i = 0; i < childTypes.length; i++) {
      entries.push(...flattenDecoded(values[i], childTypes[i].toString(), indent + 1));
    }
    return entries;
  }

  if (isByteArrayType(abiType) && value instanceof Uint8Array) {
    const b64 = Buffer.from(value).toString("base64");
    return [{ type, value: "", base64Value: b64, indent }];
  }

  if ("childType" in abiType && Array.isArray(value)) {
    const childType = (abiType as any).childType as ABIType;
    const isByteArrayChild = isByteArrayType(childType);

    if (isByteArrayChild) {
      const b64Values = (value as unknown[]).map(toBase64);
      const jsonCopy = JSON.stringify(b64Values);
      entries.push({ type, value: `(${(value as unknown[]).length} items)`, copyValue: jsonCopy, indent });
    } else {
      const jsonCopy = JSON.stringify(value, (_k, v) => typeof v === "bigint" ? v.toString() : v);
      entries.push({ type, value: `(${(value as unknown[]).length} items)`, copyValue: jsonCopy, indent });
    }
    for (let i = 0; i < (value as unknown[]).length; i++) {
      entries.push(...flattenDecoded((value as unknown[])[i], childType.toString(), indent + 1));
    }
    return entries;
  }

  const display = typeof value === "bigint" ? value.toString() : String(value);
  return [{ type, value: display, indent }];
}

function DecodedValueView({ value, types }: { value: string; types: string[] }) {
  const result = useMemo(() => {
    const buffer = new Uint8Array(Buffer.from(value, "base64"));
    for (const type of types) {
      try {
        const decoded = getABIDecodedValue(buffer, type, {});
        return { entries: flattenDecoded(decoded, type, 0), matchedType: type };
      } catch {
        continue;
      }
    }
    return null;
  }, [value, types]);

  if (!result) {
    return <MultiFormatViewer view="auto" includeNum="auto" value={value} />;
  }

  const { entries } = result;

  return (
    <div className="space-y-1 font-mono text-sm">
      {entries.map((entry, i) => (
        <div key={i} style={{ paddingLeft: entry.indent * 16 }}>
          <span className="text-muted-foreground">{entry.type}</span>
          {entry.base64Value ? (
            <span className="inline">
              : <MultiFormatViewer view="auto" includeNum="auto" value={entry.base64Value} />
            </span>
          ) : entry.value ? (
            <span className="break-all">
              : {entry.value}
              <Copyable size="s" className="ml-1 opacity-60 hover:opacity-100" value={entry.copyValue ?? entry.value} />
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

// --- Search helpers ---

function getSearchBytes(term: string, isBase64: boolean): Uint8Array {
  if (isBase64) {
    return new Uint8Array(Buffer.from(term, "base64"));
  }
  if (term.trim().length === 58) {
    try {
      if (isValidAddress(term.trim())) {
        return decodeAddress(term.trim()).publicKey;
      }
    } catch { /* not an address */ }
  }
  return new Uint8Array(Buffer.from(term, "utf-8"));
}

function bytesContain(haystack: Uint8Array, needle: Uint8Array): boolean {
  if (needle.length === 0) return true;
  if (needle.length > haystack.length) return false;
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

// --- Main component ---

function ApplicationBoxes(): JSX.Element {
  const { id, "*": boxNameRaw } = useParams();
  const navigate = useNavigate();
  const numId = Number(id);

  const boxName = boxNameRaw ? decodeURIComponent(boxNameRaw) : undefined;
  const dialogOpen = !!boxName;

  const storageKey = `box-value-filter:${numId}`;
  const [valueFilter, setValueFilter] = useState(() => localStorage.getItem(storageKey) ?? "");

  const handleFilterChange = (v: string) => {
    setValueFilter(v);
    if (v) {
      localStorage.setItem(storageKey, v);
    } else {
      localStorage.removeItem(storageKey);
    }
  };

  const parsedFilter = useMemo(() => parseTypeFilter(valueFilter), [valueFilter]);

  const {
    data,
    error: boxError,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useApplicationBoxNames(numId);

  const { data: boxData, isLoading: boxLoading } = useApplicationBox(numId, boxName);

  const boxNames = useMemo(
    () => data?.pages.flatMap((p) => p.boxes) ?? [],
    [data],
  );

  // --- Search state ---
  const [searchResults, setSearchResults] = useState<A_BoxName[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchProgress, setSearchProgress] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const cachedAllBoxNames = useRef<A_BoxName[] | null>(null);

  const fetchAllBoxNames = useCallback(async (signal: AbortSignal): Promise<A_BoxName[]> => {
    if (cachedAllBoxNames.current) return cachedAllBoxNames.current;
    if (!hasNextPage) {
      cachedAllBoxNames.current = boxNames;
      return boxNames;
    }

    const client = new BoxClient(explorer.network);
    const allBoxes: A_BoxName[] = [];
    let token: string | undefined;
    do {
      if (signal.aborted) return allBoxes;
      const page = await client.getBoxNamesPage(numId, token, 10000);
      allBoxes.push(...page.boxes);
      token = page.nextToken;
      setSearchProgress(`Loading box names... (${allBoxes.length})`);
    } while (token);
    cachedAllBoxNames.current = allBoxes;
    return allBoxes;
  }, [boxNames, hasNextPage, numId]);

  const filterKeys = useCallback((allNames: A_BoxName[], mode: BoxSearchMode, term: string, isBase64: boolean): A_BoxName[] => {
    if (mode === "key-prefix") {
      return allNames.filter((box) => {
        try {
          return Buffer.from(box.name, "base64").toString("utf-8").startsWith(term);
        } catch {
          return false;
        }
      });
    }
    const needle = getSearchBytes(term, isBase64);
    return allNames.filter((box) => {
      const keyBytes = new Uint8Array(Buffer.from(box.name, "base64"));
      return bytesContain(keyBytes, needle);
    });
  }, []);

  const handleSearch = useCallback(async (mode: BoxSearchMode, term: string, isBase64: boolean) => {
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    setSearchLoading(true);
    setSearchProgress("Loading...");

    // Start filtering immediately with what we have
    if (mode !== "value-search") {
      setSearchResults(filterKeys(cachedAllBoxNames.current ?? boxNames, mode, term, isBase64));
    } else {
      setSearchResults([]);
    }

    try {
      if (mode === "key-prefix" || mode === "key-search") {
        const allNames = await fetchAllBoxNames(abort.signal);
        if (abort.signal.aborted) return;
        setSearchResults(filterKeys(allNames, mode, term, isBase64));
      } else {
        const allNames = await fetchAllBoxNames(abort.signal);
        if (abort.signal.aborted) return;

        const needle = getSearchBytes(term, isBase64);
        const client = new BoxClient(explorer.network);
        const results: A_BoxName[] = [];

        for (let i = 0; i < allNames.length; i++) {
          if (abort.signal.aborted) return;
          setSearchProgress(`Fetching values... (${i + 1} of ${allNames.length})`);
          try {
            const box = await client.getBox(numId, allNames[i].name);
            const valueBytes = new Uint8Array(Buffer.from(box.value, "base64"));
            if (bytesContain(valueBytes, needle)) {
              results.push({ ...allNames[i] });
              setSearchResults([...results]);
            }
          } catch {
            // skip boxes that fail to fetch
          }
        }
        setSearchResults(results);
      }
    } finally {
      if (!abort.signal.aborted) {
        setSearchLoading(false);
        setSearchProgress("");
      }
    }
  }, [fetchAllBoxNames, filterKeys, boxNames, numId]);

  const handleSearchClear = useCallback(() => {
    abortRef.current?.abort();
    setSearchResults(null);
    setSearchLoading(false);
    setSearchProgress("");
  }, []);

  const displayedBoxNames = searchResults ?? boxNames;

  // --- Navigation ---
  const currentIndex = boxName ? displayedBoxNames.findIndex((b) => b.name === boxName) : -1;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < displayedBoxNames.length - 1;

  const goTo = (name: string) => {
    navigate(`/application/${id}/boxes/${encodeURIComponent(name)}`, { replace: true });
  };

  const goToPrev = () => {
    if (hasPrev) goTo(displayedBoxNames[currentIndex - 1].name);
  };
  const goToNext = () => {
    if (hasNext) goTo(displayedBoxNames[currentIndex + 1].name);
  };

  useHotkeys("left", goToPrev, { enabled: dialogOpen && hasPrev }, [currentIndex, displayedBoxNames, id]);
  useHotkeys("right", goToNext, { enabled: dialogOpen && hasNext }, [currentIndex, displayedBoxNames, id]);

  const handleClose = () => {
    navigate(`/application/${id}/boxes`);
  };

  return (
    <>
      <div>
        {boxError ? (
          <div className="text-secondary p-4">
            {(boxError as Error)?.message || "Failed to load box names"}
          </div>
        ) : (
          <BoxesList
            appId={numId}
            boxNames={displayedBoxNames}
            hasMore={searchResults ? false : !!hasNextPage}
            loadMore={searchResults ? undefined : fetchNextPage}
            loadingMore={searchResults ? false : isFetchingNextPage}
            searchLoading={searchLoading}
            searchProgress={searchProgress}
            onCancelSearch={handleSearchClear}
          >
            <BoxSearchBar
              onSearch={handleSearch}
              onClear={handleSearchClear}
              loading={searchLoading}
              hasActiveSearch={searchResults !== null}
            />
          </BoxesList>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <div className="flex items-center gap-2">
              <a
                href={hasPrev ? `/application/${id}/boxes/${encodeURIComponent(displayedBoxNames[currentIndex - 1]?.name)}` : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  goToPrev();
                }}
                className={`rounded p-1.5 ${hasPrev ? "text-primary hover:bg-primary/10 cursor-pointer" : "text-muted-foreground/30 pointer-events-none"}`}
                title="Previous box (←)"
              >
                <ArrowLeftFromLine size={18} />
              </a>
              <DialogTitle>
                Box {currentIndex >= 0 ? `(${currentIndex + 1} of ${displayedBoxNames.length})` : ""}
              </DialogTitle>
              <a
                href={hasNext ? `/application/${id}/boxes/${encodeURIComponent(displayedBoxNames[currentIndex + 1]?.name)}` : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  goToNext();
                }}
                className={`rounded p-1.5 ${hasNext ? "text-primary hover:bg-primary/10 cursor-pointer" : "text-muted-foreground/30 pointer-events-none"}`}
                title="Next box (→)"
              >
                <ArrowRightFromLine size={18} />
              </a>
            </div>
          </DialogHeader>
          {boxLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : boxData ? (
            <div className="space-y-4">
              <div>
                <div className="text-sm text-muted-foreground mb-1">Value Types</div>
                <Input
                  type="text"
                  value={valueFilter}
                  onChange={(e) => handleFilterChange(e.target.value)}
                  placeholder="Space separated ARC4 types for Values (e.g. 'string uint64 (address,bool)')"
                  className={`font-mono text-sm h-8 ${parsedFilter?.error ? "!border-secondary" : ""}`}
                />
                {parsedFilter?.error && (
                  <div className="text-secondary text-xs mt-1">{parsedFilter.error}</div>
                )}
              </div>
              <div>
                <div className="text-sm text-muted-foreground mb-1">Key</div>
                <MultiFormatViewer view="auto" includeNum="auto" value={boxData.name} />
              </div>
              <div>
                <div className="text-sm text-muted-foreground mb-1">Value</div>
                {parsedFilter?.types && !parsedFilter.error ? (
                  <DecodedValueView value={boxData.value} types={parsedFilter.types} />
                ) : (
                  <MultiFormatViewer view="auto" includeNum="auto" value={boxData.value} />
                )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default ApplicationBoxes;
