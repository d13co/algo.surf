import "./ApplicationProgram.scss";
import React, { useEffect, useMemo, useState } from "react";
import { shadedClr } from "../../../../../../../utils/common";
import { theme } from "../../../../../../../theme/index";
import {
  Dialog,
  DialogContent,
} from "@mui/material";
import { PROGRAM_ENCODING } from "../../../../../../../packages/core-sdk/constants";
import { ApplicationClient } from "../../../../../../../packages/core-sdk/clients/applicationClient";
import explorer from "../../../../../../../utils/dappflow";
import { useDispatch } from "react-redux";
import CloseIcon from "@mui/icons-material/Close";
import {
  hideLoader,
  showLoader,
} from "../../../../../../../redux/common/actions/loader";
import { handleException } from "../../../../../../../redux/common/actions/exception";
import { CodeBlock, tomorrowNightBright } from "react-code-blocks";
import Copyable from "../../../../../../Common/Copyable/Copyable";
// import account from "algosdk/dist/types/account";
import LinkToAccount from "../../../../Common/Links/LinkToAccount";
import ApplicationLocalState from "../ApplicationLocalState/ApplicationLocalState";
import { ElectricScooterTwoTone } from "@mui/icons-material";
import { kMaxLength } from "buffer";
import { setSourceMapRange } from "typescript";

const myTheme = {
  ...tomorrowNightBright,
  backgroundColor: shadedClr,
  literalColor: theme.palette.primary.main,
  builtInColor: theme.palette.primary.main,
  typeColor: theme.palette.primary.main,
  metaColor: theme.palette.primary.light,
  numberColor: theme.palette.primary.light,
  commentColor: theme.palette.primary.dark,
};

interface ApplicationApprovalProgramState {
  encoding: string;
  prg: string;
}
const initialState: ApplicationApprovalProgramState = {
  encoding: PROGRAM_ENCODING.BASE64,
  prg: "",
};

interface WordCount {
  word: string;
  count: number;
}

const initCopyLabel = "Tip: click to copy word";

function ApplicationProgram(props: {
  name: string;
  program: string;
  id: number;
}): JSX.Element {
  const { name, program, id } = props;
  console.log({ program })
  const dispatch = useDispatch();

  const [{ encoding, prg }, setState] = useState({
    ...initialState,
    prg: program,
  });

  React.useEffect(() => {
    if (name === "Approval program" || name === "Logic program") {
      setTextEncoding(PROGRAM_ENCODING.TEAL);
    }
  }, [name]);

  async function setTextEncoding(encoding: string) {
    if (encoding === PROGRAM_ENCODING.BASE64) {
      setState((prevState) => ({ ...prevState, prg: program, encoding }));
    } else if (encoding === PROGRAM_ENCODING.TEAL) {
      try {
        dispatch(showLoader("Decompiling ..."));
        const applicationClient = new ApplicationClient(explorer.network);
        const result = await applicationClient.decompileProgram(program);
        dispatch(hideLoader());
        setState((prevState) => ({
          ...prevState,
          prg: result.data.result,
          encoding,
        }));
      } catch (e: any) {
        dispatch(hideLoader());
        dispatch(handleException(e));
      }
    }
  }
  const [showWordCloud, setShowWordCloud] = useState<"freq" | "alpha" | false>(
    false
  );
  const wordCloud: Array<WordCount> = useMemo(() => {
    if (!prg) return [];
    const words: Record<string, number> = {};
    const strRegex = /\/\/ "([^"]+)"/g;
    const addrRegex = /\/\/ addr ([A-Z2-7]{58})/g;
    for (const [_, word] of prg.matchAll(strRegex)) {
      if (words[word]) words[word]++;
      else words[word] = 1;
    }
    for (const [_, word] of prg.matchAll(addrRegex)) {
      if (words[word]) words[word]++;
      else words[word] = 1;
    }
    return Object.entries(words)
      .sort(([wa, ca], [wb, cb]) => {
        if (showWordCloud !== "freq" || ca === cb) return wa.localeCompare(wb);
        if (ca < cb) return 1;
        return -1;
      })
      .map(([word, count]) => ({ word, count }));
  }, [showWordCloud, prg]);

  React.useEffect(() => {
    if (showWordCloud)
      if (encoding !== PROGRAM_ENCODING.TEAL)
        setTextEncoding(PROGRAM_ENCODING.TEAL);
  }, [showWordCloud, encoding]);

  const handleClose = () => setShowWordCloud(false);

  const [copyLabel, setCopyLabel] = useState(initCopyLabel);
  const copy = (word: string) => {
    navigator.clipboard.writeText(word);
    setCopyLabel("Copied: "+word)
    setTimeout(() => setCopyLabel(initCopyLabel), 1500);
  }

  return (
    <>
      <Dialog
        onClose={handleClose}
        fullWidth={true}
        maxWidth={"md"}
        open={!!showWordCloud}
      >
        <DialogContent>
          <div className="word-cloud-container">
            <div className="word-cloud-header">
              <span>
                {id ? <>{name} word cloud</> : <>Logic Sig word cloud</>}
              </span>
              <CloseIcon className="modal-close-button" onClick={handleClose} />
            </div>
            <div className="word-cloud-body">
              <div className="line">
                <span>{id ? <>App {id}</> : null}</span>
                <span className="flex items-center gap-2">
                  <span className="sort-label">Sort</span>
                  <div className="inline-flex rounded border border-border overflow-hidden text-xs">
                    <button
                      type="button"
                      className={`px-2.5 py-1 cursor-pointer ${showWordCloud === "freq" ? "bg-primary text-background" : "bg-transparent text-primary hover:bg-primary/20"}`}
                      onClick={() => {
                        setShowWordCloud("freq");
                      }}
                    >
                      Frequency
                    </button>
                    <button
                      type="button"
                      className={`px-2.5 py-1 cursor-pointer border-l border-border ${showWordCloud === "alpha" ? "bg-primary text-background" : "bg-transparent text-primary hover:bg-primary/20"}`}
                      onClick={() => {
                        setShowWordCloud("alpha");
                      }}
                    >
                      Alphanumeric
                    </button>
                  </div>
                </span>
              </div>
              {wordCloud.length ? (
                <>
                  <div className="cloud">
                    {wordCloud.map(({ word, count }) => (
                      <div
                        onClick={() => copy(word)}
                        className="blob hover-cursor-pointer"
                        key={word}
                      >
                        <span>{word}</span>{" "}
                        <span className="faded">x{count}</span>
                      </div>
                    ))}
                  </div>
                  <span className="sort-label">{copyLabel}</span>
                </>
              ) : (
                <div className="line">No words in program</div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <div className={"application-program-wrapper"}>
        <div className={"application-program-container"}>
          <div className="key">
            <span style={{ marginLeft: "14px", display: "inline-flex", alignItems: "center", gap: "4px" }}>{name}<Copyable value={prg} /></span>

            <div className="whitespace-nowrap flex items-center gap-2.5">
              { wordCloud.length ? <button
                type="button"
                className="px-2.5 py-1 text-xs cursor-pointer rounded border border-border bg-transparent text-primary hover:bg-primary/20"
                onClick={() => {
                  setShowWordCloud("freq");
                }}
              >
                Wordcloud
              </button> : null }
              <div className="inline-flex rounded border border-border overflow-hidden text-xs">
                <button
                  type="button"
                  className={`px-2.5 py-1 cursor-pointer ${encoding === PROGRAM_ENCODING.BASE64 ? "bg-primary text-background" : "bg-transparent text-primary hover:bg-primary/20"}`}
                  onClick={() => {
                    setTextEncoding(PROGRAM_ENCODING.BASE64);
                  }}
                >
                  Base 64
                </button>
                <button
                  type="button"
                  className={`px-2.5 py-1 cursor-pointer border-l border-border ${encoding === PROGRAM_ENCODING.TEAL ? "bg-primary text-background" : "bg-transparent text-primary hover:bg-primary/20"}`}
                  onClick={() => {
                    setTextEncoding(PROGRAM_ENCODING.TEAL);
                  }}
                >
                  Teal
                </button>
              </div>
            </div>
          </div>
          <div className="small" style={{ marginTop: 20 }}>
            {encoding === PROGRAM_ENCODING.BASE64 ? (
              <>
                <div className="source padded">{prg}</div>
                <div className="program-length">{Buffer.from(prg, "base64").length} bytes</div>
              </>
            ) : (
              <div className="source">
                <CodeBlock
                  text={prg}
                  theme={myTheme}
                  language="swift"
                  showLineNumbers={false}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default ApplicationProgram;
