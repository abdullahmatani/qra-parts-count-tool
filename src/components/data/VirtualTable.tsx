import { flexRender, type Row, type Table } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, ArrowDownUp, ArrowUp } from 'lucide-react';
import { useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface VirtualTableProps<T> {
  table: Table<T>;
  /** Estimated row height in px (compact density: 28–36 px). */
  rowHeight?: number;
  className?: string;
  testId?: string;
  empty?: ReactNode;
  rowAttributes?: (row: Row<T>) => Record<string, string | undefined>;
  onRowClick?: (row: Row<T>) => void;
}

/**
 * A TanStack Table rendered with TanStack Virtual: only visible rows are in the
 * DOM, so registers and item lists stay smooth with tens of thousands of rows
 * (FDS section 9.2, NFR-04). Mount it when its container is visible.
 */
export function VirtualTable<T>({
  table,
  rowHeight = 32,
  className,
  testId,
  empty,
  rowAttributes,
  onRowClick,
}: VirtualTableProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rows = table.getRowModel().rows;
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
    initialRect: { width: 1000, height: 800 },
  });
  const virtualRows = virtualizer.getVirtualItems();
  const padTop = virtualRows[0]?.start ?? 0;
  const padBottom = virtualizer.getTotalSize() - (virtualRows.at(-1)?.end ?? 0);
  const columnCount = table.getVisibleLeafColumns().length;

  return (
    <div ref={scrollRef} className={cn('min-h-0 overflow-auto rounded-md border', className)}>
      <table className="w-full table-fixed border-collapse text-sm" data-testid={testId}>
        <thead className="sticky top-0 z-10 bg-muted">
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers.map((header) => {
                const sorted = header.column.getIsSorted();
                const SortIcon =
                  sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ArrowDownUp;
                return (
                  <th
                    key={header.id}
                    style={{ width: header.getSize() }}
                    className="h-8 px-2 text-start text-xs font-medium text-muted-foreground"
                    aria-sort={
                      sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined
                    }
                  >
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <button
                        type="button"
                        className="flex items-center gap-1 hover:text-foreground"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        <SortIcon className={cn('size-3', !sorted && 'opacity-30')} />
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {padTop > 0 && (
            <tr aria-hidden="true">
              <td style={{ height: padTop }} colSpan={columnCount} />
            </tr>
          )}
          {virtualRows.map((virtualRow) => {
            const row = rows[virtualRow.index]!;
            return (
              <tr
                key={row.id}
                className={cn('h-row border-t hover:bg-accent/40', onRowClick && 'cursor-pointer')}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                {...rowAttributes?.(row)}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="truncate px-1 py-0.5">
                    {cell.column.columnDef.cell
                      ? flexRender(cell.column.columnDef.cell, cell.getContext())
                      : String(cell.getValue() ?? '')}
                  </td>
                ))}
              </tr>
            );
          })}
          {padBottom > 0 && (
            <tr aria-hidden="true">
              <td style={{ height: padBottom }} colSpan={columnCount} />
            </tr>
          )}
        </tbody>
      </table>
      {rows.length === 0 && empty}
    </div>
  );
}
