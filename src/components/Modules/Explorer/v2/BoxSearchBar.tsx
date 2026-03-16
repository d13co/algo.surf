import React, { useState } from "react";
import { Input } from "src/components/v2/ui/input";
import { Button } from "src/components/v2/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "src/components/v2/ui/dropdown-menu";
import { ChevronDown, Search, X } from "lucide-react";

export type BoxSearchMode = "key-prefix" | "key-search" | "value-search";

const modeLabels: Record<BoxSearchMode, string> = {
  "key-prefix": "Key prefix",
  "key-search": "Key search",
  "value-search": "Value search",
};

const modePlaceholders: Record<BoxSearchMode, string> = {
  "key-prefix": "UTF-8 prefix to filter keys",
  "key-search": "Search in keys",
  "value-search": "Search in values",
};

interface BoxSearchBarProps {
  onSearch: (mode: BoxSearchMode, term: string, isBase64: boolean) => void;
  onClear: () => void;
  loading: boolean;
  hasActiveSearch: boolean;
}

export default function BoxSearchBar({ onSearch, onClear, loading, hasActiveSearch }: BoxSearchBarProps) {
  const [mode, setMode] = useState<BoxSearchMode>("key-prefix");
  const [term, setTerm] = useState("");
  const [isBase64, setIsBase64] = useState(false);

  const showBase64Toggle = mode !== "key-prefix";

  const handleSearch = () => {
    if (!term.trim()) return;
    onSearch(mode, term.trim(), isBase64);
  };

  const handleClear = () => {
    setTerm("");
    onClear();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSearch();
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="muted"
            className="h-8 px-2.5 text-xs shrink-0 gap-1"
          >
            {modeLabels[mode]}
            <ChevronDown className="h-3 w-3 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="bg-background-card border-border text-foreground">
          {(Object.keys(modeLabels) as BoxSearchMode[]).map((m) => (
            <DropdownMenuItem
              key={m}
              onClick={() => setMode(m)}
              className="cursor-pointer"
            >
              {modeLabels[m]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="relative">
        <Input
          type="text"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={modePlaceholders[mode]}
          className="h-8 text-sm w-[220px] pr-8"
        />
        {showBase64Toggle && (
          <button
            type="button"
            onClick={() => setIsBase64(!isBase64)}
            className={`absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] font-mono px-1.5 py-0.5 rounded ${
              isBase64
                ? "bg-primary text-background"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title={isBase64 ? "Input is base64 encoded" : "Input is plain text"}
          >
            b64
          </button>
        )}
      </div>

      <Button
        variant="muted"
        size="icon"
        className="h-8 w-8 shrink-0 border-primary text-primary hover:bg-primary hover:text-background"
        onClick={handleSearch}
        disabled={loading || !term.trim()}
        title="Search"
      >
        <Search className="h-3.5 w-3.5" />
      </Button>

      {hasActiveSearch && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={handleClear}
          title="Clear search"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
