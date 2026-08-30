import { cn } from '@/lib/utils/cn'

/**
 * Tabellenbausteine fuer den Admin.
 * Die Tabelle scrollt in einem eigenen Container horizontal, damit die Seite
 * selbst auf schmalen Geraeten nie seitlich verrutscht.
 */

export function TableWrap({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'scroll-area overflow-x-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)]',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn('w-full min-w-[44rem] border-collapse text-sm', className)} {...props} />
}

export function Thead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('bg-paper-sunken/70', className)} {...props} />
}

export function Th({
  className,
  align = 'left',
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & { align?: 'left' | 'right' | 'center' }) {
  return (
    <th
      scope="col"
      className={cn(
        'border-b border-[var(--border-subtle)] px-4 py-3 text-2xs font-semibold tracking-wider text-ink-muted uppercase',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        align === 'left' && 'text-left',
        className,
      )}
      {...props}
    />
  )
}

export function Tbody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('divide-y divide-[var(--border-subtle)]', className)} {...props} />
}

export function Tr({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('transition-colors hover:bg-paper-sunken/50', className)} {...props} />
}

export function Td({
  className,
  align = 'left',
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & { align?: 'left' | 'right' | 'center' }) {
  return (
    <td
      className={cn(
        'px-4 py-3 align-middle text-ink-soft',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
      {...props}
    />
  )
}

/** Sortierbarer Spaltenkopf als Link (funktioniert ohne JavaScript). */
export function SortableTh({
  label,
  href,
  active,
  direction,
  align = 'left',
}: {
  label: string
  href: string
  active: boolean
  direction: 'asc' | 'desc'
  align?: 'left' | 'right' | 'center'
}) {
  return (
    <Th align={align} aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <a
        href={href}
        className={cn(
          'inline-flex items-center gap-1 rounded-xs transition-colors hover:text-ink',
          active && 'text-ink',
        )}
      >
        {label}
        <span aria-hidden="true" className={cn('text-[0.6rem]', !active && 'opacity-30')}>
          {active && direction === 'desc' ? '▼' : '▲'}
        </span>
      </a>
    </Th>
  )
}
