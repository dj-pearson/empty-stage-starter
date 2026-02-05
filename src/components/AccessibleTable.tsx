import * as React from 'react';
import { cn } from '@/lib/utils';
import { useScreenReaderAnnounce } from '@/contexts/AccessibilityContext';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

/**
 * Accessible Table Component
 *
 * Features:
 * - Proper semantic table structure
 * - Scope attributes for header associations
 * - ARIA attributes for sortable columns
 * - Keyboard navigation support
 * - Screen reader announcements for sorting
 * - Responsive design with horizontal scroll
 */

export interface Column<T> {
  id: string;
  header: string;
  accessor: keyof T | ((row: T) => React.ReactNode);
  sortable?: boolean;
  width?: string;
  align?: 'left' | 'center' | 'right';
  headerClassName?: string;
  cellClassName?: string;
}

export type SortDirection = 'asc' | 'desc' | null;

interface AccessibleTableProps<T> {
  /** Table caption for accessibility */
  caption: string;
  /** Whether to visually hide the caption */
  hideCaption?: boolean;
  /** Table summary for complex tables */
  summary?: string;
  /** Column definitions */
  columns: Column<T>[];
  /** Table data */
  data: T[];
  /** Key extractor for rows */
  getRowKey: (row: T, index: number) => string;
  /** Currently sorted column */
  sortColumn?: string;
  /** Current sort direction */
  sortDirection?: SortDirection;
  /** Callback when sort changes */
  onSort?: (columnId: string, direction: SortDirection) => void;
  /** Loading state */
  isLoading?: boolean;
  /** Empty state message */
  emptyMessage?: string;
  /** Additional className for the table wrapper */
  className?: string;
  /** Additional className for the table */
  tableClassName?: string;
  /** Enable row selection */
  selectable?: boolean;
  /** Selected row keys */
  selectedKeys?: Set<string>;
  /** Callback when selection changes */
  onSelectionChange?: (selectedKeys: Set<string>) => void;
  /** Callback when row is clicked */
  onRowClick?: (row: T, index: number) => void;
  /** Enable striped rows */
  striped?: boolean;
  /** Enable hover effect */
  hoverable?: boolean;
  /** Compact mode */
  compact?: boolean;
}

export function AccessibleTable<T>({
  caption,
  hideCaption = false,
  summary,
  columns,
  data,
  getRowKey,
  sortColumn,
  sortDirection,
  onSort,
  isLoading = false,
  emptyMessage = 'No data available',
  className,
  tableClassName,
  selectable = false,
  selectedKeys = new Set(),
  onSelectionChange,
  onRowClick,
  striped = false,
  hoverable = true,
  compact = false,
}: AccessibleTableProps<T>) {
  const announce = useScreenReaderAnnounce();
  const tableRef = React.useRef<HTMLTableElement>(null);

  const handleSort = (columnId: string) => {
    if (!onSort) return;

    let newDirection: SortDirection;
    if (sortColumn === columnId) {
      // Cycle through: asc -> desc -> null
      if (sortDirection === 'asc') {
        newDirection = 'desc';
      } else if (sortDirection === 'desc') {
        newDirection = null;
      } else {
        newDirection = 'asc';
      }
    } else {
      newDirection = 'asc';
    }

    onSort(columnId, newDirection);

    // Announce sort change
    const column = columns.find((c) => c.id === columnId);
    if (column) {
      if (newDirection === 'asc') {
        announce(`Table sorted by ${column.header}, ascending`, 'polite');
      } else if (newDirection === 'desc') {
        announce(`Table sorted by ${column.header}, descending`, 'polite');
      } else {
        announce(`Table sort cleared`, 'polite');
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, columnId: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleSort(columnId);
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (!onSelectionChange) return;

    if (checked) {
      const allKeys = new Set(data.map((row, index) => getRowKey(row, index)));
      onSelectionChange(allKeys);
      announce(`All ${data.length} rows selected`, 'polite');
    } else {
      onSelectionChange(new Set());
      announce('All rows deselected', 'polite');
    }
  };

  const handleSelectRow = (key: string, checked: boolean) => {
    if (!onSelectionChange) return;

    const newSelectedKeys = new Set(selectedKeys);
    if (checked) {
      newSelectedKeys.add(key);
    } else {
      newSelectedKeys.delete(key);
    }
    onSelectionChange(newSelectedKeys);
  };

  const getCellValue = (row: T, accessor: Column<T>['accessor']): React.ReactNode => {
    if (typeof accessor === 'function') {
      return accessor(row);
    }
    return row[accessor] as React.ReactNode;
  };

  const getSortIcon = (columnId: string) => {
    if (sortColumn !== columnId) {
      return <ChevronsUpDown className="h-4 w-4 opacity-50" />;
    }
    if (sortDirection === 'asc') {
      return <ChevronUp className="h-4 w-4" />;
    }
    if (sortDirection === 'desc') {
      return <ChevronDown className="h-4 w-4" />;
    }
    return <ChevronsUpDown className="h-4 w-4 opacity-50" />;
  };

  const allSelected = data.length > 0 && data.every((row, index) =>
    selectedKeys.has(getRowKey(row, index))
  );

  const someSelected = data.some((row, index) =>
    selectedKeys.has(getRowKey(row, index))
  );

  return (
    <div
      className={cn('relative overflow-x-auto', className)}
      role="region"
      aria-label={caption}
    >
      <table
        ref={tableRef}
        className={cn(
          'w-full border-collapse',
          tableClassName
        )}
        aria-busy={isLoading}
      >
        <caption className={cn(hideCaption && 'sr-only')}>
          {caption}
          {summary && (
            <span className="block text-sm text-muted-foreground mt-1">
              {summary}
            </span>
          )}
        </caption>

        <thead>
          <tr className="border-b bg-muted/50">
            {selectable && (
              <th
                scope="col"
                className={cn(
                  'px-4 py-3 text-left',
                  compact && 'px-2 py-2'
                )}
              >
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) {
                      el.indeterminate = someSelected && !allSelected;
                    }
                  }}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                  aria-label={allSelected ? 'Deselect all rows' : 'Select all rows'}
                  className="h-4 w-4 rounded border-input"
                />
              </th>
            )}
            {columns.map((column) => (
              <th
                key={column.id}
                scope="col"
                className={cn(
                  'px-4 py-3 text-left font-semibold',
                  compact && 'px-2 py-2',
                  column.align === 'center' && 'text-center',
                  column.align === 'right' && 'text-right',
                  column.headerClassName
                )}
                style={{ width: column.width }}
                aria-sort={
                  sortColumn === column.id
                    ? sortDirection === 'asc'
                      ? 'ascending'
                      : sortDirection === 'desc'
                        ? 'descending'
                        : 'none'
                    : undefined
                }
              >
                {column.sortable ? (
                  <button
                    type="button"
                    className={cn(
                      'inline-flex items-center gap-1 hover:text-primary',
                      'focus-visible:outline-none focus-visible:ring-2',
                      'focus-visible:ring-ring focus-visible:ring-offset-2',
                      'rounded px-1 -ml-1'
                    )}
                    onClick={() => handleSort(column.id)}
                    onKeyDown={(e) => handleKeyDown(e, column.id)}
                    aria-label={`Sort by ${column.header}`}
                  >
                    {column.header}
                    <span aria-hidden="true">{getSortIcon(column.id)}</span>
                  </button>
                ) : (
                  column.header
                )}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {isLoading ? (
            <tr>
              <td
                colSpan={columns.length + (selectable ? 1 : 0)}
                className="px-4 py-8 text-center text-muted-foreground"
              >
                <span role="status">Loading data...</span>
              </td>
            </tr>
          ) : data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length + (selectable ? 1 : 0)}
                className="px-4 py-8 text-center text-muted-foreground"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, rowIndex) => {
              const rowKey = getRowKey(row, rowIndex);
              const isSelected = selectedKeys.has(rowKey);

              return (
                <tr
                  key={rowKey}
                  className={cn(
                    'border-b transition-colors',
                    striped && rowIndex % 2 === 1 && 'bg-muted/30',
                    hoverable && 'hover:bg-muted/50',
                    isSelected && 'bg-primary/10',
                    onRowClick && 'cursor-pointer'
                  )}
                  onClick={
                    onRowClick
                      ? () => onRowClick(row, rowIndex)
                      : undefined
                  }
                  aria-selected={selectable ? isSelected : undefined}
                >
                  {selectable && (
                    <td
                      className={cn(
                        'px-4 py-3',
                        compact && 'px-2 py-2'
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleSelectRow(rowKey, e.target.checked);
                        }}
                        aria-label={`Select row ${rowIndex + 1}`}
                        className="h-4 w-4 rounded border-input"
                      />
                    </td>
                  )}
                  {columns.map((column, colIndex) => (
                    <td
                      key={column.id}
                      className={cn(
                        'px-4 py-3',
                        compact && 'px-2 py-2',
                        column.align === 'center' && 'text-center',
                        column.align === 'right' && 'text-right',
                        column.cellClassName
                      )}
                      // First column in each row is a header for that row
                      {...(colIndex === 0 && { scope: 'row' })}
                    >
                      {getCellValue(row, column.accessor)}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>

      {/* Selection count announcement */}
      {selectable && selectedKeys.size > 0 && (
        <div className="sr-only" role="status" aria-live="polite">
          {selectedKeys.size} row{selectedKeys.size === 1 ? '' : 's'} selected
        </div>
      )}
    </div>
  );
}

/**
 * Simple table wrapper for basic tables with proper semantics
 */
interface SimpleTableProps {
  caption: string;
  hideCaption?: boolean;
  headers: string[];
  children: React.ReactNode;
  className?: string;
}

export function SimpleTable({
  caption,
  hideCaption = false,
  headers,
  children,
  className,
}: SimpleTableProps) {
  return (
    <table className={cn('w-full border-collapse', className)}>
      <caption className={cn(hideCaption && 'sr-only')}>{caption}</caption>
      <thead>
        <tr className="border-b bg-muted/50">
          {headers.map((header, index) => (
            <th
              key={index}
              scope="col"
              className="px-4 py-3 text-left font-semibold"
            >
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

export default AccessibleTable;
