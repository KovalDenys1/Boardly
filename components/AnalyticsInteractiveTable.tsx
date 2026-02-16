'use client'

import { useMemo, useState } from 'react'

type SortDirection = 'asc' | 'desc'
type ColumnType = 'text' | 'number' | 'percent'

export interface AnalyticsTableColumn {
  key: string
  label: string
  type?: ColumnType
  defaultVisible?: boolean
  defaultSortDirection?: SortDirection
}

interface AnalyticsInteractiveTableProps<TRow extends object> {
  title: string
  columns: AnalyticsTableColumn[]
  rows: TRow[]
  rowKey: keyof TRow & string
}

interface SortConfig {
  key: string
  direction: SortDirection
}

function defaultSortDirection(column: AnalyticsTableColumn): SortDirection {
  if (column.defaultSortDirection) return column.defaultSortDirection
  if (column.type === 'number' || column.type === 'percent') return 'desc'
  return 'asc'
}

function formatCell(value: unknown, type: ColumnType): string {
  if (value === null || value === undefined) return '—'

  if (type === 'number') {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return '—'
    return new Intl.NumberFormat('en-US').format(numeric)
  }

  if (type === 'percent') {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return '—'
    return `${numeric.toFixed(1)}%`
  }

  return String(value)
}

function compareValues(left: unknown, right: unknown, type: ColumnType): number {
  if (left === null || left === undefined) return right === null || right === undefined ? 0 : 1
  if (right === null || right === undefined) return -1

  if (type === 'number' || type === 'percent') {
    const leftNumber = Number(left)
    const rightNumber = Number(right)
    if (!Number.isFinite(leftNumber) && !Number.isFinite(rightNumber)) return 0
    if (!Number.isFinite(leftNumber)) return 1
    if (!Number.isFinite(rightNumber)) return -1
    return leftNumber - rightNumber
  }

  return String(left).localeCompare(String(right), 'en-US', { sensitivity: 'base' })
}

export default function AnalyticsInteractiveTable<TRow extends object>({
  title,
  columns,
  rows,
  rowKey,
}: AnalyticsInteractiveTableProps<TRow>) {
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(() => {
    const defaultColumn = columns.find((column) => column.defaultSortDirection)
    if (!defaultColumn || !defaultColumn.defaultSortDirection) return null
    return {
      key: defaultColumn.key,
      direction: defaultColumn.defaultSortDirection,
    }
  })
  const [visibleColumns, setVisibleColumns] = useState<string[]>(
    columns.filter((column) => column.defaultVisible !== false).map((column) => column.key)
  )

  const columnMap = useMemo(() => {
    return new Map(columns.map((column) => [column.key, column]))
  }, [columns])

  const tableColumns = useMemo(() => {
    return columns.filter((column) => visibleColumns.includes(column.key))
  }, [columns, visibleColumns])

  const sortedRows = useMemo(() => {
    if (!sortConfig) return rows

    const sortColumn = columnMap.get(sortConfig.key)
    if (!sortColumn) return rows

    const sortType: ColumnType = sortColumn.type || 'text'
    const sorted = [...rows].sort((left, right) => {
      const leftValue = (left as Record<string, unknown>)[sortConfig.key]
      const rightValue = (right as Record<string, unknown>)[sortConfig.key]
      const result = compareValues(leftValue, rightValue, sortType)
      return sortConfig.direction === 'asc' ? result : -result
    })

    return sorted
  }, [columnMap, rows, sortConfig])

  const handleSort = (column: AnalyticsTableColumn) => {
    setSortConfig((current) => {
      if (!current || current.key !== column.key) {
        return {
          key: column.key,
          direction: defaultSortDirection(column),
        }
      }

      return {
        key: column.key,
        direction: current.direction === 'asc' ? 'desc' : 'asc',
      }
    })
  }

  const toggleColumn = (columnKey: string) => {
    setVisibleColumns((current) => {
      const isVisible = current.includes(columnKey)
      if (isVisible) {
        if (current.length <= 1) return current
        if (sortConfig?.key === columnKey) {
          setSortConfig(null)
        }
        return current.filter((key) => key !== columnKey)
      }
      return [...current, columnKey]
    })
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">{title}</h2>
        <details className="relative">
          <summary className="cursor-pointer rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-sm text-slate-200 hover:bg-white/20">
            Columns ({visibleColumns.length}/{columns.length})
          </summary>
          <div className="absolute right-0 z-20 mt-2 min-w-64 rounded-lg border border-white/15 bg-slate-900 p-3 shadow-xl">
            <p className="mb-2 text-xs uppercase tracking-wider text-slate-400">Toggle columns</p>
            <div className="space-y-2">
              {columns.map((column) => {
                const isVisible = visibleColumns.includes(column.key)
                const disableHide = isVisible && visibleColumns.length <= 1
                return (
                  <label key={column.key} className="flex items-center gap-2 text-sm text-slate-200">
                    <input
                      type="checkbox"
                      checked={isVisible}
                      disabled={disableHide}
                      onChange={() => toggleColumn(column.key)}
                      className="h-4 w-4 rounded border-white/30 bg-slate-800 text-blue-500 focus:ring-blue-500"
                    />
                    <span>{column.label}</span>
                  </label>
                )
              })}
            </div>
          </div>
        </details>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-slate-400">
              {tableColumns.map((column, index) => {
                const isSorted = sortConfig?.key === column.key
                const isTextColumn = (column.type || 'text') === 'text'
                const isLastColumn = index === tableColumns.length - 1
                const sortIndicator = isSorted
                  ? sortConfig?.direction === 'asc'
                    ? '↑'
                    : '↓'
                  : '↕'

                return (
                  <th
                    key={column.key}
                    className={`px-3 py-2 ${isTextColumn ? 'text-left' : 'text-center'} ${
                      isLastColumn ? '' : 'border-r border-white/10'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleSort(column)}
                      className={`inline-flex w-full items-center gap-1.5 font-medium text-slate-300 transition hover:text-white ${
                        isTextColumn ? 'justify-start' : 'justify-center'
                      }`}
                    >
                      <span>{column.label}</span>
                      <span className={`text-xs ${isSorted ? 'text-blue-300' : 'text-slate-500'}`}>
                        {sortIndicator}
                      </span>
                    </button>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-slate-400" colSpan={tableColumns.length || 1}>
                  No data
                </td>
              </tr>
            ) : (
              sortedRows.map((row, index) => (
                <tr
                  key={String((row as Record<string, unknown>)[rowKey] ?? `row-${index}`)}
                  className="border-b border-white/5"
                >
                  {tableColumns.map((column, index) => {
                    const type: ColumnType = column.type || 'text'
                    const value = (row as Record<string, unknown>)[column.key]
                    const alignClass = type === 'text' ? 'text-left' : 'text-center'
                    const isLastColumn = index === tableColumns.length - 1
                    return (
                      <td
                        key={column.key}
                        className={`px-3 py-2 ${alignClass} ${
                          isLastColumn ? '' : 'border-r border-white/5'
                        }`}
                      >
                        {formatCell(value, type)}
                      </td>
                    )
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
