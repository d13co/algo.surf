import { useCallback, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useGlobalUI } from "../../../../contexts/GlobalUIContext";
import { Search as SearchIcon, ClipboardPaste, X } from "lucide-react";
import { useHotkeys } from "react-hotkeys-hook";
import coreSearch, { NotSearchableError } from "./CoreSearch";
import { useAbelAssetsContext } from "../../../Common/AbelAssetsProvider";
import { Input } from "src/components/v2/ui/input";

interface SearchProps {
  placeholder?: string;
  autoFocus?: boolean;
  /** "default" = compact, "lg" = always large, "responsive" = large on mobile, compact on md+ */
  size?: "default" | "lg" | "responsive";
}

const defaultPlaceholder = "Address / Transaction / Asset / Application";

function Search(props: SearchProps): JSX.Element {
  const {
    autoFocus,
    placeholder = defaultPlaceholder,
    size = "default",
  } = props;
  const inputRef = useRef<HTMLInputElement>(null);

  const onHotkey = useCallback(
    (e: KeyboardEvent) => {
      e.preventDefault();
      inputRef.current?.focus();
    },
    [inputRef],
  );

  useHotkeys("/", onHotkey);
  useHotkeys("ctrl+k", onHotkey);

  const navigate = useNavigate();
  const { showLoader, hideLoader, showSnack } = useGlobalUI();
  const { loading: abelLoading, loadedPromise } = useAbelAssetsContext();

  const [searchStr, setSearchStr] = useState("");

  const clearState = useCallback(() => {
    setSearchStr("");
  }, []);

  const doSearch = useCallback(
    (override?: string) => {
      (async function () {
        const target = override ?? searchStr;
        if (!target) {
          return;
        }

        showLoader("Searching");
        try {
          const destination = await coreSearch(target);
          setSearchStr("");
          inputRef.current?.blur();
          navigate(destination);
        } catch (e) {
          // If assets aren't searchable yet but ABEL is still loading, wait and retry
          if (
            e instanceof NotSearchableError &&
            abelLoading &&
            loadedPromise
          ) {
            console.log("Retrying search after ABEL assets load", e);
            hideLoader();
            showLoader("Loading verified asset database...");
            try {
              await loadedPromise;
              const destination = await coreSearch(target);
              setSearchStr("");
              inputRef.current?.blur();
              navigate(destination);
            } catch (e2) {
              showSnack({
                severity: "error",
                message: (e2 as Error).message,
              });
            }
          } else {
            showSnack({
              severity: "error",
              message: (e as Error).message,
            });
          }
        }
        hideLoader();
      })();
    },
    [searchStr, showLoader, hideLoader, showSnack, navigate, abelLoading, loadedPromise],
  );

  const doPasteSearch = useCallback(() => {
    (async function () {
      try {
        const value = await navigator.clipboard.readText();
        setSearchStr(value);
        doSearch(value);
      } catch (_e) {
        const e = _e as Error;
        if (e.message.includes("is not a function")) {
          showSnack({
            severity: "error",
            message:
              "Could not paste and search: Your browser does not support this Paste button.",
          });
        } else {
          showSnack({
            severity: "error",
            message: `Could not paste and search: ${e.message}`,
          });
        }
      }
    })();
  }, [doSearch]);

  const sizeClasses = {
    default: {
      wrapper: "",
      icon: "h-4 w-4",
      iconLeft: "left-3",
      iconRight: "right-3",
      input: "pl-9 pr-9 rounded-full bg-[rgba(18,18,18,0.7)]",
    },
    lg: {
      wrapper: "",
      icon: "h-5 w-5",
      iconLeft: "left-4",
      iconRight: "right-4",
      input: "pl-12 pr-12 h-12 text-base rounded-full bg-[rgba(18,18,18,0.7)]",
    },
    responsive: {
      wrapper: "-mb-2 header:mb-0",
      icon: "h-5 w-5 header:h-4 header:w-4",
      iconLeft: "left-4 header:left-3",
      iconRight: "right-4 header:right-3",
      input: "pl-12 pr-12 h-12 text-base header:pl-9 header:pr-9 header:h-9 header:text-sm rounded-full bg-[rgba(18,18,18,0.7)]",
    },
  }[size];

  return (
    <div className={`relative w-full ${sizeClasses.wrapper}`}>
      <SearchIcon
        className={`absolute ${sizeClasses.iconLeft} top-1/2 -translate-y-1/2 ${sizeClasses.icon} text-muted-foreground pointer-events-none`}
      />
      <Input
        ref={inputRef}
        autoFocus={autoFocus}
        placeholder={placeholder}
        className={sizeClasses.input}
        value={searchStr}
        onChange={(ev) => {
          setSearchStr(ev.target.value);
          const { length } = ev.target.value;
          if (length === 52 || length === 58) {
            doSearch(ev.target.value);
          }
          if (ev.target.value.endsWith(".algo")) {
            doSearch(ev.target.value.trim());
          }
        }}
        onKeyUp={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            doSearch();
          }
        }}
      />
      {searchStr ? (
        <button
          type="button"
          className={`absolute ${sizeClasses.iconRight} top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground`}
          onClick={() => clearState()}
          title="Clear"
        >
          <X className={sizeClasses.icon} />
        </button>
      ) : (
        <button
          type="button"
          className={`absolute ${sizeClasses.iconRight} top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground`}
          onClick={() => doPasteSearch()}
          title="Paste and search"
        >
          <ClipboardPaste className={sizeClasses.icon} />
        </button>
      )}
    </div>
  );
}

export default Search;
