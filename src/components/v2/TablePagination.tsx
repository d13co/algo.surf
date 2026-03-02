import { Button } from "src/components/v2/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
} from "lucide-react";

interface TablePaginationProps {
  pageIndex: number;
  pageCount: number;
  canPreviousPage: boolean;
  canNextPage: boolean;
  onFirst: () => void;
  onPrev: () => void;
  onNext: () => void;
  onLast: () => void;
  loading?: boolean;
  onShowAll?: () => void;
  className?: string;
}

export default function TablePagination({
  pageIndex,
  pageCount,
  canPreviousPage,
  canNextPage,
  onFirst,
  onPrev,
  onNext,
  onLast,
  loading,
  onShowAll,
  className = "flex items-center justify-end gap-2",
}: TablePaginationProps) {
  if (pageCount <= 1) return null;

  return (
    <div className={className}>
      {onShowAll ? (
        <Button
          variant="ghost"
          size="sm"
          className="mr-auto text-muted-foreground"
          onClick={onShowAll}
        >
          Show all
        </Button>
      ) : null}
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : null}
      <span className="text-sm text-muted-foreground whitespace-nowrap">
        Page {pageIndex + 1} of {pageCount}
      </span>
      <Button
        variant="muted"
        size="icon"
        className="h-8 w-8"
        onClick={onFirst}
        disabled={!canPreviousPage}
      >
        <ChevronsLeft className="h-4 w-4" />
      </Button>
      <Button
        variant="muted"
        size="icon"
        className="h-8 w-8"
        onClick={onPrev}
        disabled={!canPreviousPage}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Button
        variant="muted"
        size="icon"
        className="h-8 w-8"
        onClick={onNext}
        disabled={!canNextPage}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
      <Button
        variant="muted"
        size="icon"
        className="h-8 w-8"
        onClick={onLast}
        disabled={!canNextPage}
      >
        <ChevronsRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
