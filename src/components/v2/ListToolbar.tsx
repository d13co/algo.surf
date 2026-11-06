import React from "react";
import { cx } from "class-variance-authority";
import TablePagination from "src/components/v2/TablePagination";

interface ListToolbarProps {
  className?: string;
  pageIndex: number;
  pageCount: number;
  /** More pages may follow the last one loaded (see TablePagination). */
  hasMore?: boolean;
  canPreviousPage: boolean;
  canNextPage: boolean;
  onFirst: () => void;
  onPrev: () => void;
  onNext: () => void;
  onLast: () => void;
  loading?: boolean;
  children?: React.ReactNode;
  /** Buttons beside the page counter: on its left on desktop; on mobile, on its row at the left. */
  actions?: React.ReactNode;
}

export default function ListToolbar({
  className,
  children,
  pageIndex,
  pageCount,
  hasMore,
  canPreviousPage,
  canNextPage,
  onFirst,
  onPrev,
  onNext,
  onLast,
  loading,
  actions,
}: ListToolbarProps) {
  if (!children && !actions && (pageCount < 1 || (pageCount === 1 && !hasMore))) return <div className="mb-4 md:mb-0"></div>;

  const pagination = (className: string) => (
    <TablePagination
      className={className}
      pageIndex={pageIndex}
      pageCount={pageCount}
      hasMore={hasMore}
      canPreviousPage={canPreviousPage}
      canNextPage={canNextPage}
      onFirst={onFirst}
      onPrev={onPrev}
      onNext={onNext}
      onLast={onLast}
      loading={loading}
    />
  );

  return (
    <div className={cx("flex flex-wrap items-center justify-between gap-2 mb-3", className)}>
      {children}
      {actions ? (
        <div className="flex w-full items-center justify-between gap-2 md:ml-auto md:w-auto md:justify-end">
          {actions}
          {pagination("flex items-center justify-end gap-2")}
        </div>
      ) : (
        pagination("flex items-center justify-end gap-2 ml-auto")
      )}
    </div>
  );
}
