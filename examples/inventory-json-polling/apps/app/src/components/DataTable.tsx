import { type ReactNode, useMemo, useState } from "react";
import { SyncBadge } from "./SyncBadge";

type PlainRow = Record<string, unknown>;

export interface ColumnDef {
  key: string;
  label: string;
  render?: (value: unknown, row: PlainRow) => ReactNode;
  sortable?: boolean;
}

interface DataTableProps {
  columns: ColumnDef[];
  error?: string | null;
  filterable?: boolean;
  loading: boolean;
  onDelete: (row: PlainRow) => Promise<void>;
  onStatus?: (msg: string) => void;
  rows: PlainRow[];
  title: string;
}

type SortDir = "asc" | "desc";
type SyncFilter = "all" | "synced" | "unsynced";

export function DataTable({
  title,
  columns,
  rows,
  loading,
  error,
  filterable = true,
  onDelete,
  onStatus,
}: DataTableProps) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [search, setSearch] = useState("");
  const [syncFilter, setSyncFilter] = useState<SyncFilter>("all");

  const plainRows = rows;

  const filtered = useMemo(() => {
    let result = plainRows;

    if (search) {
      const lower = search.toLowerCase();
      result = result.filter((row) =>
        Object.values(row).some(
          (value) =>
            typeof value === "string" && value.toLowerCase().includes(lower)
        )
      );
    }

    if (syncFilter !== "all") {
      result = result.filter((row) =>
        syncFilter === "synced"
          ? row.isSynced === true || row.isSynced === 1
          : row.isSynced === false || row.isSynced === 0
      );
    }

    if (sortKey) {
      result = [...result].sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        if (av == null && bv == null) {
          return 0;
        }
        if (av == null) {
          return 1;
        }
        if (bv == null) {
          return -1;
        }
        const cmp = String(av).localeCompare(String(bv), undefined, {
          numeric: true,
        });
        return sortDir === "asc" ? cmp : -cmp;
      });
    }

    return result;
  }, [plainRows, search, syncFilter, sortKey, sortDir]);

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(key);
    setSortDir("asc");
  }

  async function handleDelete(row: PlainRow) {
    try {
      await onDelete(row);
    } catch (deleteError) {
      onStatus?.(`Delete failed: ${String(deleteError)}`);
    }
  }

  return (
    <section className="rounded-3xl border border-cream-300 bg-cream-50 p-5 shadow-[0_24px_60px_rgba(49,33,17,0.08)]">
      <h2 className="mb-3 font-medium font-serif text-wood-900 text-xl">
        {title}
      </h2>

      {filterable && (
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <input
            className="rounded-xl border border-cream-300 bg-white px-3 py-1.5 text-sm text-wood-900 outline-none placeholder:text-wood-500/50 focus:border-forest-500 focus:ring-1 focus:ring-forest-500"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search…"
            type="text"
            value={search}
          />
          <select
            className="rounded-xl border border-cream-300 bg-white px-3 py-1.5 text-sm text-wood-900 outline-none focus:border-forest-500"
            onChange={(event) =>
              setSyncFilter(event.target.value as SyncFilter)
            }
            value={syncFilter}
          >
            <option value="all">All</option>
            <option value="synced">Synced</option>
            <option value="unsynced">Unsynced</option>
          </select>
        </div>
      )}

      {error && <p className="mb-3 text-sm text-terra-500">{error}</p>}
      {loading && plainRows.length === 0 && (
        <p className="text-sm text-wood-500">Loading rows…</p>
      )}
      {!loading && filtered.length === 0 && search.length === 0 && (
        <p className="text-sm text-wood-500">No rows yet.</p>
      )}
      {!loading && filtered.length === 0 && search.length > 0 && (
        <p className="text-sm text-wood-500">No matching rows.</p>
      )}
      {filtered.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-cream-300 border-b text-wood-500 text-xs uppercase tracking-wider">
                <th className="px-3 py-2">Status</th>
                {columns.map((column) => (
                  <th
                    className={`px-3 py-2 ${column.sortable ? "cursor-pointer select-none hover:text-wood-900" : ""}`}
                    key={column.key}
                    onClick={() => column.sortable && handleSort(column.key)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {column.label}
                      {sortKey === column.key && (
                        <span className="text-forest-500">
                          {sortDir === "asc" ? "↑" : "↓"}
                        </span>
                      )}
                    </span>
                  </th>
                ))}
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, index) => (
                <tr
                  className="animate-stagger-in border-cream-200/60 border-b transition-colors last:border-0 hover:bg-forest-50/30"
                  key={String(row.id)}
                  style={{ animationDelay: `${index * 40}ms` }}
                >
                  <td className="px-3 py-2.5">
                    <SyncBadge
                      synced={row.isSynced === true || row.isSynced === 1}
                    />
                  </td>
                  {columns.map((column) => (
                    <td
                      className="max-w-[180px] truncate px-3 py-2.5 font-mono text-xs"
                      key={column.key}
                    >
                      {column.render
                        ? column.render(row[column.key], row)
                        : String(row[column.key] ?? "")}
                    </td>
                  ))}
                  <td className="px-3 py-2.5">
                    <button
                      className="cursor-pointer rounded-lg px-2.5 py-1 font-medium text-terra-500 text-xs transition-colors hover:bg-terra-500/10 hover:text-terra-600"
                      onClick={() => handleDelete(row)}
                      type="button"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
