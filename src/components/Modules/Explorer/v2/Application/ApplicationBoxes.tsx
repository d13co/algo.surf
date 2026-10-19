import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import BoxesList from "../BoxesList";
import BoxSearchBar, { BoxSearchMode } from "../BoxSearchBar";
import { useApplicationBoxNames, useApplicationBox, boxClientFor } from "src/hooks/useApplication";
import { useRound, withRound } from "src/hooks/useRound";
import { parseVersionsOrder, withVersionsOrder } from "src/utils/versionFilter";
import MultiFormatViewer from "src/components/v2/MultiFormatViewer";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "src/components/v2/ui/dialog";
import Copyable from "src/components/v2/Copyable";
import { ArrowLeftFromLine, ArrowRightFromLine, Loader2 } from "lucide-react";
import { useHotkeys } from "react-hotkeys-hook";
import { isValidAddress, decodeAddress } from "algosdk";
import { A_BoxName } from "src/packages/core-sdk/types";
import NumberFormat from "react-number-format";
import AlgoIcon from "../../AlgoIcon/AlgoIcon";
import { microalgosToAlgos } from "src/utils/common";
import TabsUnderline from "src/components/v2/shadcn-studio/tabs/tabs-11";
import { useTimeTravelSupport } from "src/hooks/useTimeTravel";
import { BoxValueTypesInput, DecodedValueView, useBoxValueTypes } from "./BoxValue";
import BoxHistory from "./BoxHistory";

/** The box dialog shows the value, or with a time-travel node its history (`?view=history`). */
type BoxView = "value" | "history";

const BOX_FLAT_COST = 2500;
const BOX_BYTE_COST = 400;

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

// Suggesting base64 is only helpful if the term could plausibly decode as one.
function looksLikeBase64(term: string): boolean {
  return /^[A-Za-z0-9+/]+={0,2}$/.test(term) && Buffer.from(term, "base64").length > 0;
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
  // Boxes as they were at a past round, when the URL asks for one.
  const { round } = useRound();
  const hasHistory = useTimeTravelSupport();
  const [searchParams] = useSearchParams();
  const view: BoxView = hasHistory && searchParams.get("view") === "history" ? "history" : "value";

  const boxName = boxNameRaw ? decodeURIComponent(boxNameRaw) : undefined;
  const dialogOpen = !!boxName;

  const { filter: valueFilter, setFilter: handleFilterChange, parsed: parsedFilter, types: valueTypes } = useBoxValueTypes(numId);

  const {
    data,
    error: boxError,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useApplicationBoxNames(numId, round);

  const { data: boxData, isLoading: boxLoading, error: boxValueError } = useApplicationBox(numId, boxName, round);

  // A box raises the app account's minimum balance by 2500 + 400 per byte of
  // key + value (microAlgos).
  const boxCost = useMemo(() => {
    if (!boxData) return null;
    const keyLength = Buffer.from(boxData.name, "base64").length;
    const valueLength = Buffer.from(boxData.value, "base64").length;
    return {
      keyLength,
      valueLength,
      microAlgos: BOX_FLAT_COST + BOX_BYTE_COST * (keyLength + valueLength),
    };
  }, [boxData]);

  const boxNames = useMemo(
    () => data?.pages.flatMap((p) => p.boxes) ?? [],
    [data],
  );

  // --- Search state ---
  const [searchResults, setSearchResults] = useState<A_BoxName[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchProgress, setSearchProgress] = useState("");
  const [isBase64, setIsBase64] = useState(false);
  const [lastSearch, setLastSearch] = useState<{ mode: BoxSearchMode; term: string; isBase64: boolean } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const cachedAllBoxNames = useRef<A_BoxName[] | null>(null);

  const fetchAllBoxNames = useCallback(async (signal: AbortSignal): Promise<A_BoxName[]> => {
    if (cachedAllBoxNames.current) return cachedAllBoxNames.current;
    // `hasNextPage` is also false before the first page lands, so require the
    // query to have data — otherwise an early search caches an empty list and
    // every later search on this app comes up empty.
    if (data && !hasNextPage) {
      cachedAllBoxNames.current = boxNames;
      return boxNames;
    }

    const client = boxClientFor(round);
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
  }, [boxNames, data, hasNextPage, numId, round]);

  const filterKeys = useCallback((allNames: A_BoxName[], mode: "key-prefix" | "key-search", term: string, isBase64: boolean): A_BoxName[] => {
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
    setLastSearch({ mode, term, isBase64 });

    // Start filtering immediately with what we have
    if (mode === "key-prefix" || mode === "key-search") {
      setSearchResults(filterKeys(cachedAllBoxNames.current ?? boxNames, mode, term, isBase64));
    } else {
      setSearchResults([]);
    }

    try {
      if (mode === "key-exact") {
        // Exact keys resolve against algod directly, no need to page through names
        setSearchProgress("Looking up box...");
        const nameB64 = Buffer.from(getSearchBytes(term, isBase64)).toString("base64");
        const client = boxClientFor(round);
        try {
          await client.getBox(numId, nameB64);
          if (abort.signal.aborted) return;
          setSearchResults([{ name: nameB64 }]);
        } catch {
          // no box under that key
          if (abort.signal.aborted) return;
          setSearchResults([]);
        }
      } else if (mode === "key-prefix" || mode === "key-search") {
        const allNames = await fetchAllBoxNames(abort.signal);
        if (abort.signal.aborted) return;
        setSearchResults(filterKeys(allNames, mode, term, isBase64));
      } else {
        const allNames = await fetchAllBoxNames(abort.signal);
        if (abort.signal.aborted) return;

        const needle = getSearchBytes(term, isBase64);
        const client = boxClientFor(round);
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
  }, [fetchAllBoxNames, filterKeys, boxNames, numId, round]);

  // The route keeps this component mounted when navigating between apps (or
  // rounds), so drop anything scoped to the previous app id and round.
  useEffect(() => {
    abortRef.current?.abort();
    cachedAllBoxNames.current = null;
    setSearchResults(null);
    setSearchLoading(false);
    setSearchProgress("");
    setLastSearch(null);
  }, [numId, round]);

  const handleSearchClear = useCallback(() => {
    abortRef.current?.abort();
    setSearchResults(null);
    setSearchLoading(false);
    setSearchProgress("");
    setLastSearch(null);
  }, []);

  // A plain-text search that came up empty may well have been a base64 key
  // pasted without the b64 toggle on — offer to redo it as base64.
  const retryAsBase64 = useCallback(() => {
    if (!lastSearch) return;
    setIsBase64(true);
    handleSearch(lastSearch.mode, lastSearch.term, true);
  }, [handleSearch, lastSearch]);

  const suggestBase64 =
    !searchLoading &&
    searchResults?.length === 0 &&
    !!lastSearch &&
    !lastSearch.isBase64 &&
    lastSearch.mode !== "key-prefix" &&
    looksLikeBase64(lastSearch.term);

  const displayedBoxNames = searchResults ?? boxNames;

  // --- Navigation ---
  const currentIndex = boxName ? displayedBoxNames.findIndex((b) => b.name === boxName) : -1;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < displayedBoxNames.length - 1;

  // Stepping between boxes keeps the view, and the history's order.
  const boxHref = (name: string, v: BoxView = view) => {
    const path = `/application/${id}/boxes/${encodeURIComponent(name)}`;
    return withRound(v === "history" ? withVersionsOrder(`${path}?view=history`, parseVersionsOrder(searchParams)) : path, round);
  };

  const goTo = (name: string) => {
    navigate(boxHref(name), { replace: true });
  };

  const goToPrev = () => {
    if (hasPrev) goTo(displayedBoxNames[currentIndex - 1].name);
  };
  const goToNext = () => {
    if (hasNext) goTo(displayedBoxNames[currentIndex + 1].name);
  };

  useHotkeys("left", goToPrev, { enabled: dialogOpen && hasPrev }, [currentIndex, displayedBoxNames, id, round, view]);
  useHotkeys("right", goToNext, { enabled: dialogOpen && hasNext }, [currentIndex, displayedBoxNames, id, round, view]);

  const valueTypesInput = <BoxValueTypesInput value={valueFilter} onChange={handleFilterChange} parsed={parsedFilter} />;

  const handleClose = () => {
    navigate(withRound(`/application/${id}/boxes`, round));
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
            round={round}
            history={hasHistory}
            boxNames={displayedBoxNames}
            hasMore={searchResults ? false : !!hasNextPage}
            loadMore={searchResults ? undefined : fetchNextPage}
            loadingMore={searchResults ? false : isFetchingNextPage}
            searchLoading={searchLoading}
            searchProgress={searchProgress}
            onCancelSearch={handleSearchClear}
            emptySuggestion={
              suggestBase64 ? (
                <>
                  Did you forget to toggle{" "}
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      retryAsBase64();
                    }}
                    className="text-primary hover:underline"
                  >
                    base 64
                  </a>
                  ?
                </>
              ) : null
            }
          >
            <BoxSearchBar
              onSearch={handleSearch}
              onClear={handleSearchClear}
              loading={searchLoading}
              hasActiveSearch={searchResults !== null}
              isBase64={isBase64}
              onBase64Change={setIsBase64}
            />
          </BoxesList>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <div className="flex items-center gap-2">
              <a
                href={hasPrev ? boxHref(displayedBoxNames[currentIndex - 1]?.name) : undefined}
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
                href={hasNext ? boxHref(displayedBoxNames[currentIndex + 1]?.name) : undefined}
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
          {hasHistory ? (
            <TabsUnderline
              value={view}
              onValueChange={(v) => navigate(boxHref(boxName, v as BoxView), { replace: true })}
              activationMode="manual"
              tabs={[
                { name: "Value", value: "value" },
                { name: "History", value: "history" },
              ]}
            />
          ) : null}
          {view === "history" ? (
            <div className="space-y-4 min-w-0">
              {valueTypesInput}
              <div>
                <div className="text-sm text-muted-foreground mb-1">Key</div>
                <MultiFormatViewer view="auto" includeNum="auto" value={boxName} />
              </div>
              <BoxHistory appId={numId} name={boxName} round={round} types={valueTypes} />
            </div>
          ) : boxLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : boxData ? (
            <div className="space-y-4">
              {valueTypesInput}
              <div>
                <div className="text-sm text-muted-foreground mb-1">Key</div>
                <MultiFormatViewer view="auto" includeNum="auto" value={boxData.name} />
              </div>
              <div>
                <div className="text-sm text-muted-foreground mb-1">Value</div>
                {valueTypes ? (
                  <DecodedValueView value={boxData.value} types={valueTypes} />
                ) : (
                  <MultiFormatViewer view="auto" includeNum="auto" value={boxData.value} />
                )}
              </div>
              {boxCost ? (
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Box cost</div>
                  <div className="group inline-flex items-center gap-1">
                    <AlgoIcon />
                    <NumberFormat
                      value={microalgosToAlgos(boxCost.microAlgos)}
                      displayType="text"
                      thousandSeparator={true}
                    />
                    <Copyable
                      className="opacity-60 group-hover:opacity-100"
                      value={microalgosToAlgos(boxCost.microAlgos)}
                    />
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {boxCost.microAlgos.toLocaleString()} µALGO ={" "}
                    {BOX_FLAT_COST.toLocaleString()} + {BOX_BYTE_COST} ×{" "}
                    {(boxCost.keyLength + boxCost.valueLength).toLocaleString()} bytes
                    ({boxCost.keyLength.toLocaleString()} key +{" "}
                    {boxCost.valueLength.toLocaleString()} value)
                  </div>
                </div>
              ) : null}
            </div>
          ) : boxValueError ? (
            <div className="text-secondary">{(boxValueError as Error).message || "Failed to load box"}</div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default ApplicationBoxes;
