import { useState } from 'react';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { playHover, playClick } from '../utils/sound';

// Generic paginated table shared by every "manage a roster" page (Admin
// Residents/Psychologists, LGU Residents/Psychologist Directory) so they all
// share one real table + pagination implementation instead of four near-copies.
function DataTable({ columns, rows, keyField = 'id', pageSize = 10, emptyMessage = 'No results.', itemLabel = 'results' }) {
  const [page, setPage] = useState(1);
  // Jump back to page 1 whenever the filtered row count changes (a new
  // search/filter), without the cascading-render cost of doing it in an effect.
  const [lastRowCount, setLastRowCount] = useState(rows.length);
  if (rows.length !== lastRowCount) {
    setLastRowCount(rows.length);
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, totalPages);
  const start = (current - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);

  if (rows.length === 0) {
    return <p className="text-sm text-brand-ink/50 py-10 text-center">{emptyMessage}</p>;
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] text-brand-ink/50 uppercase bg-brand-bg/60">
              <th className="px-5 py-3 font-medium w-10">#</th>
              {columns.map((col) => (
                <th key={col.key} className="px-5 py-3 font-medium">{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, i) => (
              <tr key={row[keyField]} className="border-t border-brand-ink/10">
                <td className="px-5 py-3 text-brand-ink/40">{start + i + 1}</td>
                {columns.map((col) => (
                  <td key={col.key} className="px-5 py-3 align-middle">{col.render ? col.render(row) : row[col.key]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between px-5 py-3.5 border-t border-brand-ink/10 flex-wrap gap-3">
        <p className="text-xs text-brand-ink/50">
          Showing {start + 1}–{Math.min(start + pageRows.length, rows.length)} of {rows.length} {itemLabel}
        </p>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => { playClick(); setPage((p) => Math.max(1, p - 1)); }}
              onMouseEnter={playHover}
              disabled={current === 1}
              className="interactive w-7 h-7 rounded-full border border-brand-ink/15 flex items-center justify-center disabled:opacity-30"
            >
              <IconChevronLeft size={14} />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => { playClick(); setPage(p); }}
                onMouseEnter={playHover}
                className={`interactive w-7 h-7 rounded-full text-xs font-medium ${
                  p === current ? 'bg-brand-primary text-white' : 'text-brand-ink/60 hover:bg-brand-ink/5'
                }`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => { playClick(); setPage((p) => Math.min(totalPages, p + 1)); }}
              onMouseEnter={playHover}
              disabled={current === totalPages}
              className="interactive w-7 h-7 rounded-full border border-brand-ink/15 flex items-center justify-center disabled:opacity-30"
            >
              <IconChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default DataTable;
