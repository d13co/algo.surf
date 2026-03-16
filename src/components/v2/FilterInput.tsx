import { useRef } from "react";
import { Filter, Loader2, X } from "lucide-react";
import { Input } from "src/components/v2/ui/input";
import { Button } from "src/components/v2/ui/button";

interface FilterInputProps {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  loading?: boolean;
}

function FilterInput({ value, onChange, onClear, placeholder = "Filter", className, inputClassName, loading }: FilterInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className={`relative ${className ?? ""}`}>
      <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <Input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputClassName ?? "pl-9 pr-8 h-8"}
      />
      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
        {loading && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
        {value && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 rounded-full"
            onClick={() => {
              onChange("");
              onClear?.();
              inputRef.current?.focus();
            }}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

export default FilterInput;
