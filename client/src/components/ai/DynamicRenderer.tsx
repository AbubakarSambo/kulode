import { useState } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import { ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface ComponentConfig {
  component: string
  props: Record<string, any>
}

// 1. KPI Card Component
function KPICard({ title, value, trend, sentiment }: { title: string; value: string; trend?: string; sentiment?: 'positive' | 'warning' | 'neutral' }) {
  const isPositive = sentiment === 'positive'
  const isWarning = sentiment === 'warning'

  return (
    <Card className="border border-slate-100 bg-white min-w-[130px] flex-1 shadow-sm overflow-hidden">
      <CardContent className="p-4 sm:p-5">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">{title}</p>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-slate-900 tracking-tight">{value}</span>
          {trend && (
            <span
              className={cn(
                'flex items-center text-xs font-medium px-2 py-0.5 rounded-full shrink-0',
                isPositive && 'bg-emerald-50 text-emerald-700',
                isWarning && 'bg-amber-50 text-amber-700',
                !isPositive && !isWarning && 'bg-slate-100 text-slate-600'
              )}
            >
              {isPositive ? (
                <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />
              ) : (
                <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" />
              )}
              {trend}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// 2. Line Chart Component
function CustomLineChart({ data }: { data: { label: string; value: number }[] }) {
  const formatYAxis = (tickItem: number) => {
    if (tickItem >= 1_000_000) return `₦${(tickItem / 1_000_000).toFixed(1)}M`
    if (tickItem >= 1_000) return `₦${(tickItem / 1_000).toFixed(0)}k`
    return `₦${tickItem}`
  }

  return (
    <div className="w-full h-64 mt-4">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis
            dataKey="label"
            stroke="#94a3b8"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            dy={10}
          />
          <YAxis
            stroke="#94a3b8"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatYAxis}
            dx={-10}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#ffffff',
              border: 'none',
              borderRadius: '12px',
              boxShadow: '0px 12px 32px rgba(0, 55, 176, 0.08)',
              fontSize: '12px',
            }}
            formatter={(value: any) => [`₦${Number(value).toLocaleString()}`, 'Value']}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#0037b0"
            strokeWidth={3}
            dot={{ r: 4, fill: '#0037b0', strokeWidth: 0 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// 3. Bar Chart Component
function CustomBarChart({ data }: { data: { label: string; value: number }[] }) {
  const formatYAxis = (tickItem: number) => {
    if (tickItem >= 1_000_000) return `₦${(tickItem / 1_000_000).toFixed(1)}M`
    if (tickItem >= 1_000) return `₦${(tickItem / 1_000).toFixed(0)}k`
    return `₦${tickItem}`
  }

  return (
    <div className="w-full h-64 mt-4">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis
            dataKey="label"
            stroke="#94a3b8"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            dy={10}
          />
          <YAxis
            stroke="#94a3b8"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatYAxis}
            dx={-10}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#ffffff',
              border: 'none',
              borderRadius: '12px',
              boxShadow: '0px 12px 32px rgba(0, 55, 176, 0.08)',
              fontSize: '12px',
            }}
            formatter={(value: any) => [`₦${Number(value).toLocaleString()}`, 'Value']}
          />
          <Bar
            dataKey="value"
            fill="#0037b0"
            radius={[6, 6, 0, 0]}
            maxBarSize={45}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// 4. Interactive Table Component
function InteractiveTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto w-full my-4 rounded-[20px] bg-slate-50/50 p-1">
      <table className="w-full text-left border-collapse text-xs">
        <thead>
          <tr className="bg-slate-100/70">
            {headers.map((h, i) => (
              <th key={i} className="px-4 py-3 font-semibold text-slate-600 first:rounded-l-xl last:rounded-r-xl border-b border-transparent">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y-0">
          {rows.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              className={cn(
                'hover:bg-slate-50 transition-colors',
                rowIndex % 2 === 1 && 'bg-slate-100/20'
              )}
            >
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-4 py-3 text-slate-700">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}


// 5. Tabs Component
function TabsComponent({ tabs }: { tabs: { label: string; content: ComponentConfig }[] }) {
  const [activeTab, setActiveTab] = useState(0)

  return (
    <div className="w-full mt-4 flex flex-col gap-4">
      <div className="flex gap-1.5 p-1 bg-slate-100 rounded-xl max-w-max">
        {tabs.map((tab, idx) => (
          <button
            key={idx}
            onClick={() => setActiveTab(idx)}
            className={cn(
              'px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer min-h-[38px] flex items-center justify-center',
              activeTab === idx
                ? 'bg-gradient-to-br from-[#0037b0] to-[#1d4ed8] text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-800'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="w-full">
        <DynamicComponentRenderer
          component={tabs[activeTab].content.component}
          props={tabs[activeTab].content.props}
        />
      </div>
    </div>
  )
}

// Main Dynamic Component Router Switcher
export function DynamicComponentRenderer({ component, props }: ComponentConfig) {
  switch (component) {
    case 'KPICard':
      return <KPICard title={props.title} value={props.value} trend={props.trend} sentiment={props.sentiment} />
    case 'LineChart':
      return <CustomLineChart data={props.data} />
    case 'BarChart':
      return <CustomBarChart data={props.data} />
    case 'InteractiveTable':
      return <InteractiveTable headers={props.headers} rows={props.rows} />
    case 'Tabs':
      return <TabsComponent tabs={props.tabs} />
    default:
      return null
  }
}

export function DynamicLayoutRenderer({ layout }: { layout: ComponentConfig[] }) {
  if (!layout || !Array.isArray(layout)) return null

  // Group KPI Cards together to render in a grid
  const kpis = layout.filter((item) => item.component === 'KPICard')
  const others = layout.filter((item) => item.component !== 'KPICard')

  return (
    <div className="flex flex-col gap-4 w-full">
      {kpis.length > 0 && (
        <div className="flex flex-wrap gap-3 w-full">
          {kpis.map((kpi, idx) => (
            <DynamicComponentRenderer key={idx} component={kpi.component} props={kpi.props} />
          ))}
        </div>
      )}
      {others.map((item, idx) => (
        <DynamicComponentRenderer key={idx} component={item.component} props={item.props} />
      ))}
    </div>
  )
}
