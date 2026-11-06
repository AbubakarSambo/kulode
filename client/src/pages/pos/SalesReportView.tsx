import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDownRight, ArrowUpRight, ChevronRight, Info } from 'lucide-react'
import { Card, CardContent } from '@/components/ui'
import type { SalesReport, SalesDepartment } from '@/api'
import { formatCurrency, formatPaymentMethod, cn } from '@/lib/utils'

const COLLAPSE_KEY = 'tari1.salesReport.expandedDepartments'

function readExpanded(): string[] {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

function writeExpanded(keys: string[]) {
  try {
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify(keys))
  } catch {
    // storage unavailable: the choice just isn't remembered
  }
}

const qty = (n: number) => (Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 2 }))
const pctText = (n: number) => `${n.toFixed(1)}%`
/** Averages read better in whole naira; totals keep their kobo. */
const wholeMoney = (n: number) => formatCurrency(Math.round(n))

function SectionTitle({ title, note }: { title: string; note?: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-3">
      <h2 className="text-sm font-bold text-foreground">{title}</h2>
      {note && <p className="text-[11px] text-muted-foreground">{note}</p>}
    </div>
  )
}

function Tile({ label, value, sub, accent }: { label: string; value: ReactNode; sub?: ReactNode; accent?: string }) {
  return (
    // min-w-0: a grid item won't shrink below its content by default, so a long amount stretched the
    // column past the screen on mobile and got clipped. The value is also a size smaller there so
    // a seven-figure total with kobo (₦14,079,800.50) fits a half-width tile; break-words is the
    // last resort for anything longer.
    <Card className="break-inside-avoid min-w-0">
      <CardContent className="p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={cn('mt-1 text-base sm:text-xl font-semibold tabular-nums text-foreground break-words', accent)}>{value}</p>
        {sub && <p className="mt-1 text-[11px] text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  )
}

/** A thin share bar for table rows. */
function ShareBar({ percent }: { percent: number }) {
  return (
    <div className="h-1.5 w-full min-w-[60px] rounded-full bg-muted overflow-hidden">
      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
    </div>
  )
}

const th = 'py-2.5 px-2 text-[10px] font-bold uppercase tracking-wider text-background'
const td = 'py-2 px-2 tabular-nums'

function Table({ children }: { children: ReactNode }) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">{children}</table>
      </div>
    </Card>
  )
}

function Headline({ report }: { report: SalesReport }) {
  const { headline: h, comparison: c } = report
  const change = c.changePercent
  return (
    <section>
      <SectionTitle title="Headline numbers" />
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5 print:grid-cols-5">
        <Tile
          label="Total sales"
          value={formatCurrency(h.grossSales)}
          sub={h.discounts > 0 ? `Net ${formatCurrency(h.netSales)} after discounts` : 'Before discounts, excl. tax'}
        />
        <Tile label="Orders" value={h.orders.toLocaleString()} sub="Closed and paid" />
        <Tile label="Avg check" value={wholeMoney(h.avgCheck)} sub="Sales ÷ orders" />
        <Tile label="Items / order" value={h.itemsPerOrder.toFixed(1)} sub={`${qty(h.itemsSold)} items sold`} />
        <Tile
          label="Vs comparison"
          value={
            change === null ? (
              '—'
            ) : (
              <span className="inline-flex items-center gap-1">
                {change >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                {Math.abs(change).toFixed(1)}%
              </span>
            )
          }
          accent={change === null ? undefined : change >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}
          sub={change === null ? `No sales on ${c.label}` : `Sales vs ${c.label} (${formatCurrency(c.grossSales)})`}
        />
      </div>
    </section>
  )
}

function Departments({ report }: { report: SalesReport }) {
  return (
    <section>
      <SectionTitle title="Sales by department" note={report.departments.map((d) => d.name).join(' · ')} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-3">
        {report.departments.map((d) => (
          <Card key={d.key} className="break-inside-avoid">
            <CardContent className="p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{d.name}</p>
              <div className="mt-1 flex items-baseline justify-between gap-2">
                <p className="text-xl font-semibold tabular-nums text-foreground">{formatCurrency(d.revenue)}</p>
                <p className="text-sm font-bold tabular-nums text-primary">{pctText(d.revenuePercent)}</p>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {qty(d.quantity)} units · avg price {wholeMoney(d.avgPrice)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  )
}

function CategoryBreakdown({ report }: { report: SalesReport }) {
  const [expanded, setExpanded] = useState<string[]>(readExpanded)
  const toggle = (key: string) => {
    const next = expanded.includes(key) ? expanded.filter((k) => k !== key) : [...expanded, key]
    setExpanded(next)
    writeExpanded(next)
  }

  return (
    <section>
      <SectionTitle title="Breakdown by category" note="Tap a department to see its categories. Printing shows them all." />
      <Table>
        <thead className="bg-foreground [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">
          <tr>
            <th className={th}>Category</th>
            <th className={cn(th, 'text-right')}>Qty</th>
            <th className={cn(th, 'text-right')}>% Qty</th>
            <th className={cn(th, 'text-right')}>Revenue</th>
            <th className={cn(th, 'text-right')}>% Rev</th>
            <th className={cn(th, 'text-right')}>Avg price</th>
            <th className={cn(th, 'w-32 hidden sm:table-cell')} />
          </tr>
        </thead>
        {report.departments.map((d) => {
          const open = expanded.includes(d.key)
          return (
            <tbody key={d.key} className="border-t border-border/60">
              <tr className="bg-primary/10 font-bold cursor-pointer hover:bg-primary/15" onClick={() => toggle(d.key)}>
                <td className={cn(td, 'font-bold')}>
                  <span className="inline-flex items-center gap-1">
                    <ChevronRight className={cn('h-3.5 w-3.5 transition-transform print:rotate-90', open && 'rotate-90')} />
                    {d.name}
                  </span>
                </td>
                <BreakdownCells row={d} />
              </tr>
              {d.categories.map((c) => (
                <tr key={c.name} className={cn('border-t border-border/40', open ? 'table-row' : 'hidden print:table-row')}>
                  <td className={cn(td, 'pl-8 font-medium')}>{c.name}</td>
                  <BreakdownCells row={c} />
                </tr>
              ))}
            </tbody>
          )
        })}
        <tfoot>
          <tr className="border-t-2 border-border font-bold">
            <td className={td}>Total</td>
            <td className={cn(td, 'text-right')}>{qty(report.totals.quantity)}</td>
            <td className={cn(td, 'text-right')}>100.0%</td>
            <td className={cn(td, 'text-right')}>{formatCurrency(report.totals.revenue)}</td>
            <td className={cn(td, 'text-right')}>100.0%</td>
            <td className={cn(td, 'text-right')}>{wholeMoney(report.totals.avgPrice)}</td>
            <td className="hidden sm:table-cell" />
          </tr>
        </tfoot>
      </Table>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Departments come from each category's type (food, drink or other). An item filed under several categories counts once,
        under its most specific one.
      </p>
    </section>
  )
}

function BreakdownCells({ row }: { row: SalesDepartment | SalesReport['departments'][number]['categories'][number] }) {
  return (
    <>
      <td className={cn(td, 'text-right')}>{qty(row.quantity)}</td>
      <td className={cn(td, 'text-right text-muted-foreground')}>{pctText(row.quantityPercent)}</td>
      <td className={cn(td, 'text-right')}>{formatCurrency(row.revenue)}</td>
      <td className={cn(td, 'text-right text-muted-foreground')}>{pctText(row.revenuePercent)}</td>
      <td className={cn(td, 'text-right')}>{wholeMoney(row.avgPrice)}</td>
      <td className={cn(td, 'hidden sm:table-cell')}>
        <ShareBar percent={row.revenuePercent} />
      </td>
    </>
  )
}

function ItemList({ title, tone, items }: { title: string; tone: 'top' | 'bottom'; items: SalesDepartment['topItems'] }) {
  return (
    <div className="break-inside-avoid">
      <p className={cn('text-[10px] font-bold uppercase tracking-wider mb-1.5', tone === 'top' ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
        {title}
      </p>
      <Table>
        <thead className="bg-foreground [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">
          <tr>
            <th className={cn(th, 'w-8')}>#</th>
            <th className={th}>Item</th>
            <th className={cn(th, 'text-right')}>Qty</th>
            <th className={cn(th, 'text-right')}>Revenue</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {items.map((item, i) => (
            <tr key={item.name}>
              <td className={cn(td, 'text-muted-foreground')}>{i + 1}</td>
              <td className={cn(td, 'font-medium')}>{item.name}</td>
              <td className={cn(td, 'text-right')}>{qty(item.quantity)}</td>
              <td className={cn(td, 'text-right')}>{formatCurrency(item.revenue)}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  )
}

function Performers({ report }: { report: SalesReport }) {
  const zero = report.departments.filter((d) => d.zeroSalesCount > 0)
  return (
    <section className="print:break-before-page">
      <SectionTitle title="Top and bottom items by department" note="Bottom 5 = lowest revenue among items sold at least once" />
      <div className="space-y-5">
        {report.departments.map((d) => (
          <div key={d.key} className="grid gap-4 md:grid-cols-2 print:grid-cols-2">
            <ItemList title={`${d.name} · top 5`} tone="top" items={d.topItems} />
            {d.bottomItems.length > 0 ? (
              <ItemList title={`${d.name} · bottom 5`} tone="bottom" items={d.bottomItems} />
            ) : (
              <p className="text-[11px] text-muted-foreground self-center">
                {d.name} sold {d.topItems.length} item{d.topItems.length === 1 ? '' : 's'}, so there is no separate bottom 5.
              </p>
            )}
          </div>
        ))}
      </div>
      {zero.length > 0 && (
        <div className="mt-4 rounded-xl bg-muted/50 px-4 py-3 text-xs">
          <span className="font-bold">Items on the menu with no sales in this period: </span>
          {zero.map((d) => `${d.name} ${d.zeroSalesCount}`).join(' · ')}
        </div>
      )}
    </section>
  )
}

function Dayparts({ report }: { report: SalesReport }) {
  const totalOrders = report.dayparts.reduce((s, d) => s + d.orders, 0)
  return (
    <section>
      <SectionTitle title="Sales by daypart" note="By when the order was placed. Shows where to put your strongest staff and when a promo would help." />
      <Table>
        <thead className="bg-foreground [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">
          <tr>
            <th className={th}>Daypart</th>
            <th className={cn(th, 'text-right')}>Orders</th>
            <th className={cn(th, 'text-right')}>Sales</th>
            <th className={cn(th, 'text-right')}>% Sales</th>
            <th className={cn(th, 'text-right')}>Avg check</th>
            <th className={cn(th, 'w-32 hidden sm:table-cell')} />
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {report.dayparts.map((d) => (
            <tr key={d.name}>
              <td className={cn(td, 'font-medium')}>
                {d.name} <span className="text-muted-foreground font-normal">{d.start}–{d.end}</span>
              </td>
              <td className={cn(td, 'text-right')}>{d.orders.toLocaleString()}</td>
              <td className={cn(td, 'text-right')}>{formatCurrency(d.sales)}</td>
              <td className={cn(td, 'text-right text-muted-foreground')}>{pctText(d.salesPercent)}</td>
              <td className={cn(td, 'text-right')}>{wholeMoney(d.avgCheck)}</td>
              <td className={cn(td, 'hidden sm:table-cell')}>
                <ShareBar percent={d.salesPercent} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border font-bold">
            <td className={td}>Total</td>
            <td className={cn(td, 'text-right')}>{totalOrders.toLocaleString()}</td>
            <td className={cn(td, 'text-right')}>{formatCurrency(report.headline.grossSales)}</td>
            <td className={cn(td, 'text-right')}>100.0%</td>
            <td className={cn(td, 'text-right')}>{wholeMoney(report.headline.avgCheck)}</td>
            <td className="hidden sm:table-cell" />
          </tr>
        </tfoot>
      </Table>
    </section>
  )
}

function OrderTypesAndPayments({ report }: { report: SalesReport }) {
  return (
    <section className="print:break-before-page">
      <SectionTitle title="Order type and payment method" />
      <div className="grid gap-4 lg:grid-cols-2 print:grid-cols-2 items-start">
        <Table>
          <thead className="bg-foreground [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">
            <tr>
              <th className={th}>Order type</th>
              <th className={cn(th, 'text-right')}>Orders</th>
              <th className={cn(th, 'text-right')}>Sales</th>
              <th className={cn(th, 'text-right')}>%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {report.orderTypes.map((t) => (
              <tr key={t.name}>
                <td className={cn(td, 'font-medium')}>{t.name}</td>
                <td className={cn(td, 'text-right')}>{t.orders.toLocaleString()}</td>
                <td className={cn(td, 'text-right')}>{formatCurrency(t.sales)}</td>
                <td className={cn(td, 'text-right text-muted-foreground')}>{pctText(t.salesPercent)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border font-bold">
              <td className={td}>Total</td>
              <td className={cn(td, 'text-right')}>{report.headline.orders.toLocaleString()}</td>
              <td className={cn(td, 'text-right')}>{formatCurrency(report.headline.grossSales)}</td>
              <td className={cn(td, 'text-right')}>100.0%</td>
            </tr>
          </tfoot>
        </Table>
        <div>
          <Table>
            <thead className="bg-foreground [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">
              <tr>
                <th className={th}>Payment</th>
                <th className={cn(th, 'text-right')}>Collected</th>
                <th className={cn(th, 'text-right')}>%</th>
                <th className={cn(th, 'w-24 hidden sm:table-cell')} />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {report.payments.methods.map((m) => (
                <tr key={m.method}>
                  <td className={cn(td, 'font-medium')}>{formatPaymentMethod(m.method)}</td>
                  <td className={cn(td, 'text-right')}>{formatCurrency(m.amount)}</td>
                  <td className={cn(td, 'text-right text-muted-foreground')}>{pctText(m.percent)}</td>
                  <td className={cn(td, 'hidden sm:table-cell')}>
                    <ShareBar percent={m.percent} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border font-bold">
                <td className={td}>Total</td>
                <td className={cn(td, 'text-right')}>{formatCurrency(report.payments.total)}</td>
                <td className={cn(td, 'text-right')}>100.0%</td>
                <td className="hidden sm:table-cell" />
              </tr>
            </tfoot>
          </Table>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Money taken on these orders, including tax and service charge and after discounts, so it won't match total sales.
          </p>
        </div>
      </div>
    </section>
  )
}

function Staff({ report }: { report: SalesReport }) {
  if (report.staff.length === 0) return null
  return (
    <section>
      <SectionTitle title="Staff performance" note="Orders are credited to the waiter, or to whoever opened them" />
      <Table>
        <thead className="bg-foreground [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">
          <tr>
            <th className={th}>Staff</th>
            <th className={cn(th, 'text-right')}>Orders</th>
            <th className={cn(th, 'text-right')}>Sales</th>
            <th className={cn(th, 'text-right')}>Avg check</th>
            <th className={cn(th, 'text-right')}>Voids</th>
            <th className={cn(th, 'text-right')}>Discounts</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {report.staff.map((s) => (
            <tr key={s.id ?? 'unassigned'}>
              <td className={cn(td, 'font-medium')}>{s.name}</td>
              <td className={cn(td, 'text-right')}>{s.orders.toLocaleString()}</td>
              <td className={cn(td, 'text-right')}>{formatCurrency(s.sales)}</td>
              <td className={cn(td, 'text-right')}>{s.orders > 0 ? wholeMoney(s.avgCheck) : '–'}</td>
              <td className={cn(td, 'text-right')}>{s.voids > 0 ? s.voids : '–'}</td>
              <td className={cn(td, 'text-right')}>{s.discounts > 0 ? formatCurrency(s.discounts) : '–'}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border font-bold">
            <td className={td}>Total</td>
            <td className={cn(td, 'text-right')}>{report.headline.orders.toLocaleString()}</td>
            <td className={cn(td, 'text-right')}>{formatCurrency(report.headline.grossSales)}</td>
            <td className={cn(td, 'text-right')}>{wholeMoney(report.headline.avgCheck)}</td>
            <td className={cn(td, 'text-right')}>{report.controls.voids.count || '–'}</td>
            <td className={cn(td, 'text-right')}>{report.controls.discounts.amount > 0 ? formatCurrency(report.controls.discounts.amount) : '–'}</td>
          </tr>
        </tfoot>
      </Table>
    </section>
  )
}

function Controls({ report }: { report: SalesReport }) {
  const { voids, discounts } = report.controls
  const voidsHigh = voids.percentOfSales > 1
  return (
    <section>
      <SectionTitle title="Controls" note="Always shown, whatever the period" />
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 print:grid-cols-4">
        <Tile
          label="Voids"
          value={formatCurrency(voids.amount)}
          accent={voidsHigh ? 'text-rose-600 dark:text-rose-400' : undefined}
          sub={
            <>
              {voids.count} cancelled order{voids.count === 1 ? '' : 's'} · {pctText(voids.percentOfSales)} of sales
              {voidsHigh && <span className="block font-semibold text-rose-600 dark:text-rose-400">Above 1% of sales</span>}
            </>
          }
        />
        <Tile
          label="Discounts"
          value={formatCurrency(discounts.amount)}
          sub={`${discounts.count} discounted order${discounts.count === 1 ? '' : 's'}`}
        />
      </div>
    </section>
  )
}

function SetupHints({ hints }: { hints: string[] }) {
  if (hints.length === 0) return null
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200 print:hidden">
      <div className="flex gap-2">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <div className="space-y-1.5">
          {hints.map((hint) => (
            <p key={hint}>{hint}</p>
          ))}
          <p className="flex gap-3 font-semibold">
            <Link to="/pos/categories" className="underline underline-offset-2">Menu Categories</Link>
            <Link to="/pos/menu" className="underline underline-offset-2">Menu Management</Link>
          </p>
        </div>
      </div>
    </div>
  )
}

export function SalesReportView({ report }: { report: SalesReport }) {
  return (
    <div className="space-y-8 max-w-5xl mx-auto print:max-w-none print:space-y-6">
      <SetupHints hints={report.setupHints} />
      <Headline report={report} />
      <Departments report={report} />
      <CategoryBreakdown report={report} />
      <Performers report={report} />
      <Dayparts report={report} />
      <OrderTypesAndPayments report={report} />
      <Staff report={report} />
      <Controls report={report} />
    </div>
  )
}
