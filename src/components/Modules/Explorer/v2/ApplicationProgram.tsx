import React, { Suspense, useMemo, useState } from "react";
import { PROGRAM_ENCODING } from "src/packages/core-sdk/constants";
import { ApplicationClient } from "src/packages/core-sdk/clients/applicationClient";
import explorer from "src/utils/dappflow";
import { Loader2 } from "lucide-react";

const LazyTealViewer = React.lazy(() => import("./TealViewer"));

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "src/components/v2/ui/dialog";

interface WordCount {
  word: string;
  count: number;
}

function ApplicationProgram(props: {
  name: string;
  program: string;
  id: number;
}): JSX.Element {
  const { name, program, id } = props;

  const [encoding, setEncoding] = useState(PROGRAM_ENCODING.BASE64);
  const [prg, setPrg] = useState(program);
  const [decompiling, setDecompiling] = useState(false);
  const [copiedSrc, setCopiedSrc] = useState(false);
  const [showWordCloud, setShowWordCloud] = useState<"freq" | "alpha" | false>(false);
  const [copyLabel, setCopyLabel] = useState("Tip: click to copy word");

  React.useEffect(() => {
    if (name === "Approval program" || name === "Logic program") {
      switchEncoding(PROGRAM_ENCODING.TEAL);
    }
  }, [name]);

  async function switchEncoding(enc: string) {
    if (enc === PROGRAM_ENCODING.BASE64) {
      setPrg(program);
      setEncoding(enc);
    } else if (enc === PROGRAM_ENCODING.TEAL) {
      try {
        setDecompiling(true);
        const client = new ApplicationClient(explorer.network);
        const result = await client.decompileProgram(program);
        setPrg(result.data.result);
        setEncoding(enc);
      } catch {
        // decompilation failed — stay on current encoding
      } finally {
        setDecompiling(false);
      }
    }
  }

  const wordCounts = useMemo(() => {
    if (!prg) return [];
    const words: Record<string, number> = {};
    for (const [, word] of prg.matchAll(/\/\/ "([^"]+)"/g)) {
      words[word] = (words[word] ?? 0) + 1;
    }
    for (const [, word] of prg.matchAll(/\/\/ addr ([A-Z2-7]{58})/g)) {
      words[word] = (words[word] ?? 0) + 1;
    }
    return Object.entries(words).map(([word, count]) => ({ word, count }));
  }, [prg]);

  const wordCloud: WordCount[] = useMemo(() => {
    return [...wordCounts].sort((a, b) => {
      if (showWordCloud !== "freq" || a.count === b.count) return a.word.localeCompare(b.word);
      return b.count - a.count;
    });
  }, [showWordCloud, wordCounts]);

  React.useEffect(() => {
    if (showWordCloud && encoding !== PROGRAM_ENCODING.TEAL) {
      switchEncoding(PROGRAM_ENCODING.TEAL);
    }
  }, [showWordCloud, encoding]);

  function copyWord(word: string) {
    navigator.clipboard.writeText(word);
    setCopyLabel("Copied: " + word);
    setTimeout(() => setCopyLabel("Tip: click to copy word"), 1500);
  }

  return (
    <>
      {/* Wordcloud dialog */}
      <Dialog open={!!showWordCloud} onOpenChange={(open) => !open && setShowWordCloud(false)}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col bg-background-muted text-foreground">
          <DialogHeader>
            <DialogTitle className="text-lg font-normal">
              {id ? `${name} word cloud` : "Logic Sig word cloud"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-5 mt-2">
            <div className="flex items-center justify-between gap-2">
              <span>{id ? `App ${id}` : null}</span>
              <span className="flex items-center gap-2">
                <span className="text-muted-foreground text-sm">Sort</span>
                <div className="inline-flex rounded border border-border overflow-hidden text-xs">
                  <button
                    type="button"
                    className={`px-2.5 py-1 cursor-pointer ${showWordCloud === "freq" ? "bg-primary text-background" : "bg-transparent text-primary hover:bg-primary/20"}`}
                    onClick={() => setShowWordCloud("freq")}
                  >
                    Frequency
                  </button>
                  <button
                    type="button"
                    className={`px-2.5 py-1 cursor-pointer border-l border-border ${showWordCloud === "alpha" ? "bg-primary text-background" : "bg-transparent text-primary hover:bg-primary/20"}`}
                    onClick={() => setShowWordCloud("alpha")}
                  >
                    Alphanumeric
                  </button>
                </div>
              </span>
            </div>
            {wordCloud.length ? (
              <>
                <div className="flex flex-wrap gap-1">
                  {wordCloud.map(({ word, count }) => (
                    <div
                      key={word}
                      onClick={() => copyWord(word)}
                      className="inline-flex items-center gap-2 border border-border rounded-full px-2 py-0.5 text-sm cursor-pointer hover:bg-primary/10"
                    >
                      <span>{word}</span>
                      <span className="text-muted-foreground text-xs">x{count}</span>
                    </div>
                  ))}
                </div>
                <span className="text-muted-foreground text-sm">{copyLabel}</span>
              </>
            ) : (
              <div className="text-muted-foreground">No words in program</div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Toolbar */}
      <div className="flex items-center justify-center gap-2.5 flex-wrap">
        {wordCloud.length ? (
          <button
            type="button"
            className="px-2.5 py-1 text-xs cursor-pointer rounded border border-border bg-transparent text-primary hover:bg-primary/20"
            onClick={() => setShowWordCloud("freq")}
          >
            Wordcloud
          </button>
        ) : null}
        <div className="inline-flex rounded border border-border overflow-hidden text-xs">
          <button
            type="button"
            className={`px-2.5 py-1 cursor-pointer ${encoding === PROGRAM_ENCODING.BASE64 ? "bg-primary text-background" : "bg-transparent text-primary hover:bg-primary/20"}`}
            onClick={() => switchEncoding(PROGRAM_ENCODING.BASE64)}
          >
            Base 64
          </button>
          <button
            type="button"
            className={`px-2.5 py-1 cursor-pointer border-l border-border ${encoding === PROGRAM_ENCODING.TEAL ? "bg-primary text-background" : "bg-transparent text-primary hover:bg-primary/20"}`}
            onClick={() => switchEncoding(PROGRAM_ENCODING.TEAL)}
          >
            Teal
          </button>
        </div>
        <button
          type="button"
          className="px-2.5 py-1 text-xs cursor-pointer rounded border border-border bg-transparent text-primary hover:bg-primary/20"
          onClick={() => {
            navigator.clipboard.writeText(prg);
            setCopiedSrc(true);
            setTimeout(() => setCopiedSrc(false), 1000);
          }}
        >
          {copiedSrc ? "Copied" : "Copy source"}
        </button>
        {decompiling ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : null}
      </div>

      {/* Program source */}
      <div className="mt-5">
        {encoding === PROGRAM_ENCODING.BASE64 ? (
          <>
            <div className="rounded-lg bg-background p-2 break-all text-sm">{prg}</div>
            <div className="mt-2 ml-2 text-[13px] text-muted-foreground">
              {Buffer.from(prg, "base64").length} bytes
            </div>
          </>
        ) : (
          <div className="rounded-lg bg-background overflow-hidden">
            <Suspense fallback={<div className="p-4 text-muted-foreground">Loading...</div>}>
              <LazyTealViewer text={prg} />
            </Suspense>
          </div>
        )}
      </div>
    </>
  );
}

export default React.memo(ApplicationProgram);
