'use client';

/**
 * DataTable - TanStack Table Integration
 * Arsitektur Reference: Bagian 13.2, 13.7
 *
 * Generic CRUD table component dengan support untuk:
 * - Sorting & filtering
 * - Pagination
 * - Inline editing
 * - Custom columns (dynamic fields)
 */

import React, { useState, useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  createColumnHelper,
  SortingState,
  ColumnFiltersState,
} from '@tanstack/react-table';

interface ColumnDef<T> {
  accessorKey?: string;
  header: string;
  cell?: (info: any) => React.ReactNode;
  enableSorting?: boolean;
  enableFiltering?: boolean;
}

interface DataTableProps<T extends { id: string }> {
  data: T[];
  columns: ColumnDef<T>[];
  isLoading?: boolean;
  onRowEdit?: (row: T) => void;
  onRowDelete?: (id: string) => void;
  onPageChange?: (page: number) => void;
  onSortChange?: (sorting: SortingState) => void;
  page?: number;
  pageSize?: number;
  totalCount?: number;
  emptyMessage?: string;
}

export function DataTable<T extends { id: string }>({
  data,
  columns,
  isLoading,
  onRowEdit,
  onRowDelete,
  onPageChange,
  onSortChange,
  page = 1,
  pageSize = 20,
  totalCount,
  emptyMessage = 'Tidak ada data',
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');

  const table = useReactTable({
    data,
    columns: columns.map(col => ({
      ...col,
      cell: col.cell || ((info: any) => String(info.getValue() ?? '-')),
    })) as any,
    state: {
      sorting,
      columnFilters,
      globalFilter,
    },
    onSortingChange: (updater) => {
      const newSorting = typeof updater === 'function' ? updater(sorting) : updater;
      setSorting(newSorting);
      onSortChange?.(newSorting);
    },
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    manualPagination: onPageChange !== undefined,
    pageCount: onPageChange ? Math.ceil((totalCount || 0) / pageSize) : undefined,
  });

  const totalPages = Math.ceil((totalCount || data.length) / pageSize);

  if (isLoading) {
    return (
      <div className="table-loading">
        <div className="spinner" />
        <p>Memuat data...</p>
      </div>
    );
  }

  return (
    <div className="data-table-container">
      {/* Search Bar */}
      <div className="table-toolbar">
        <div className="search-input">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder="Cari..."
            value={globalFilter ?? ''}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="form-text-input"
          />
        </div>
        <div className="table-info">
          {totalCount !== undefined && (
            <span className="record-count">
              {totalCount} total records
            </span>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <th
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                    className={header.column.getCanSort() ? 'sortable' : ''}
                  >
                    <div className="header-content">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getCanSort() && (
                        <span className="sort-icon">
                          {{
                            asc: ' ↑',
                            desc: ' ↓',
                          }[header.column.getIsSorted() as string] ?? ' ↕'}
                        </span>
                      )}
                    </div>
                  </th>
                ))}
                {(onRowEdit || onRowDelete) && (
                  <th className="actions-header">Aksi</th>
                )}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="empty-row">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map(row => (
                <tr key={row.id}>
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                  {(onRowEdit || onRowDelete) && (
                    <td className="actions-cell">
                      {onRowEdit && (
                        <button
                          className="action-btn"
                          onClick={() => onRowEdit(row.original)}
                          title="Edit"
                        >
                          ✏️
                        </button>
                      )}
                      {onRowDelete && (
                        <button
                          className="action-btn delete"
                          onClick={() => onRowDelete(row.original.id)}
                          title="Hapus"
                        >
                          🗑️
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="table-pagination">
          <div className="pagination-info">
            Halaman {page} dari {totalPages}
          </div>
          <div className="pagination-controls">
            <button
              className="pagination-btn"
              onClick={() => onPageChange?.(1)}
              disabled={page === 1}
            >
              ⟪
            </button>
            <button
              className="pagination-btn"
              onClick={() => onPageChange?.(page - 1)}
              disabled={page === 1}
            >
              ←
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (page <= 3) {
                pageNum = i + 1;
              } else if (page >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = page - 2 + i;
              }
              return (
                <button
                  key={pageNum}
                  className={`pagination-btn ${page === pageNum ? 'active' : ''}`}
                  onClick={() => onPageChange?.(pageNum)}
                >
                  {pageNum}
                </button>
              );
            })}
            <button
              className="pagination-btn"
              onClick={() => onPageChange?.(page + 1)}
              disabled={page === totalPages}
            >
              →
            </button>
            <button
              className="pagination-btn"
              onClick={() => onPageChange?.(totalPages)}
              disabled={page === totalPages}
            >
              ⟫
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        .data-table-container {
          width: 100%;
        }

        .table-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
          gap: 16px;
        }

        .search-input {
          position: relative;
          flex: 1;
          max-width: 300px;
        }

        .search-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          opacity: 0.5;
        }

        .search-input input {
          padding-left: 36px;
        }

        .table-info {
          color: var(--text-secondary, #94A3B8);
          font-size: 0.85rem;
        }

        .table-wrapper {
          overflow-x: auto;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .data-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.9rem;
        }

        .data-table th {
          background: rgba(255, 255, 255, 0.03);
          padding: 12px 16px;
          text-align: left;
          font-weight: 500;
          color: var(--text-secondary, #94A3B8);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          white-space: nowrap;
        }

        .data-table th.sortable {
          cursor: pointer;
          user-select: none;
        }

        .data-table th.sortable:hover {
          background: rgba(255, 255, 255, 0.05);
        }

        .header-content {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .sort-icon {
          opacity: 0.4;
          font-size: 0.8em;
        }

        .data-table th.actions-header {
          width: 100px;
          text-align: center;
        }

        .data-table td {
          padding: 12px 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          color: var(--text-primary, #F1F5F9);
        }

        .data-table tr:hover td {
          background: rgba(255, 255, 255, 0.02);
        }

        .actions-cell {
          text-align: center;
          white-space: nowrap;
        }

        .action-btn {
          background: transparent;
          border: none;
          cursor: pointer;
          padding: 4px 8px;
          border-radius: 6px;
          font-size: 1rem;
          opacity: 0.6;
          transition: all 0.2s;
        }

        .action-btn:hover {
          opacity: 1;
          background: rgba(255, 255, 255, 0.1);
        }

        .action-btn.delete:hover {
          background: rgba(239, 68, 68, 0.2);
        }

        .empty-row {
          text-align: center;
          padding: 40px !important;
          color: var(--text-muted, #64748B);
        }

        .table-pagination {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 16px;
          padding: 12px 0;
        }

        .pagination-info {
          color: var(--text-secondary, #94A3B8);
          font-size: 0.85rem;
        }

        .pagination-controls {
          display: flex;
          gap: 4px;
        }

        .pagination-btn {
          min-width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          color: var(--text-primary, #F1F5F9);
          cursor: pointer;
          font-size: 0.85rem;
          transition: all 0.2s;
        }

        .pagination-btn:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 255, 255, 0.2);
        }

        .pagination-btn:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        .pagination-btn.active {
          background: var(--color-primary, #3B82F6);
          border-color: var(--color-primary, #3B82F6);
        }

        .table-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 60px;
          color: var(--text-secondary, #94A3B8);
        }

        .table-loading .spinner {
          margin-bottom: 16px;
        }
      `}</style>
    </div>
  );
}

// ============================================================================
// Hook for data fetching with TanStack Query
// ============================================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface UseDataTableOptions {
  fetchUrl: string;
  pageSize?: number;
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
  filters?: Record<string, string>;
}

export function useDataTable<T extends { id: string }>({
  fetchUrl,
  pageSize = 20,
  sortField,
  sortOrder,
  filters = {},
}: UseDataTableOptions) {
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();

  const queryString = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    ...(sortField && { sortField }),
    ...(sortOrder && { sortOrder }),
    ...filters,
  }).toString();

  const query = useQuery({
    queryKey: ['data-table', fetchUrl, queryString],
    queryFn: async () => {
      const res = await fetch(`${fetchUrl}?${queryString}`);
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${fetchUrl}/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['data-table', fetchUrl] });
    },
  });

  return {
    data: query.data?.data || [],
    totalCount: query.data?.pagination?.total || 0,
    page,
    pageSize,
    isLoading: query.isLoading,
    error: query.error,
    setPage,
    refetch: query.refetch,
    deleteRow: deleteMutation.mutate,
    isDeleting: deleteMutation.isPending,
  };
}

export default DataTable;
