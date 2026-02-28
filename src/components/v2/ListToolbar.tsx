import React from "react";
import { cx } from "class-variance-authority";
import TablePagination from "src/components/v2/TablePagination";

interface ListToolbarProps {
  className?: string;
  pageIndex: number;
  pageCount: number;
  canPreviousPage: boolean;
  canNextPage: boolean;
  onFirst: () => void;
  onPrev: () => void;
  onNext: () => void;
  onLast: () => void;
  loading?: boolean;
  children?: React.ReactNode;
}

export default function ListToolbar({
  className,
  children,
  pageIndex,
  pageCount,
  canPreviousPage,
  canNextPage,
  onFirst,
  onPrev,
  onNext,
  onLast,
  loading,
}: ListToolbarProps) {
  if (!children && pageCount <= 1) return null;

  return (
    <div className={cx("flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3", className)}>
      {children}
      <TablePagination
        className="flex items-center justify-end gap-2 ml-auto"
        pageIndex={pageIndex}
        pageCount={pageCount}
        canPreviousPage={canPreviousPage}
        canNextPage={canNextPage}
        onFirst={onFirst}
        onPrev={onPrev}
        onNext={onNext}
        onLast={onLast}
        loading={loading}
      />
    </div>
  );
}
