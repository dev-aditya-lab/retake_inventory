import { ChevronLeft, ChevronRight } from "lucide-react";

export function Pagination({
  page,
  limit,
  total,
  onPageChange,
}: {
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(total / limit));
  if (total <= limit) return null;

  const first = (page - 1) * limit + 1;
  const last = Math.min(page * limit, total);

  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-between gap-3">
      <p className="text-xs text-muted">
        {first}–{last} of {total}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="flex items-center gap-1 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-ink-100 disabled:opacity-40"
        >
          <ChevronLeft size={16} aria-hidden />
          Prev
        </button>
        <span className="text-sm text-muted">
          {page} / {pageCount}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pageCount}
          className="flex items-center gap-1 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-ink-100 disabled:opacity-40"
        >
          Next
          <ChevronRight size={16} aria-hidden />
        </button>
      </div>
    </nav>
  );
}
