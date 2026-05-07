'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { getVaultById } from '@/lib/store'
import { AuditEvent, Vault } from '@/types'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Download, Activity } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'

const TYPE_COLORS: Record<AuditEvent['type'], string> = {
  'bid-placed': '#00A8B5',
  fill: '#26A69A',
  'sell-placed': '#4DD0E1',
  rollover: '#B0BEC5',
  reconcile: '#80DEEA',
  'ai-analysis': '#FF8F00',
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour12: false })
}

function buildChartData(events: AuditEvent[]) {
  const byHour: Record<string, { hour: string; fills: number; bids: number; pnl: number }> = {}
  events.forEach(e => {
    const d = new Date(e.timestamp)
    const key = `${d.getHours().toString().padStart(2, '0')}:00`
    if (!byHour[key]) byHour[key] = { hour: key, fills: 0, bids: 0, pnl: 0 }
    if (e.type === 'fill') { byHour[key].fills++; byHour[key].pnl += e.pnl ?? 0 }
    if (e.type === 'bid-placed') byHour[key].bids++
  })
  return Object.values(byHour).sort((a, b) => a.hour.localeCompare(b.hour))
}

export default function AuditPage() {
  const params = useParams<{ id: string }>()
  const [vault, setVault] = useState<Vault | null>(null)
  const [filter, setFilter] = useState<AuditEvent['type'] | 'all'>('all')

  useEffect(() => {
    async function load() {
      setVault(await getVaultById(params.id))
    }
    load()
  }, [params.id])

  function exportCSV() {
    if (!vault) return
    const rows = vault.audit.map(e =>
      [e.timestamp, e.type, e.marketId ?? '', e.shares ?? '', e.price ?? '', e.pnl ?? '', e.reasoning ?? ''].join(',')
    )
    const csv = ['timestamp,type,marketId,shares,price,pnl,reasoning', ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `audit-${vault.id}.csv`
    a.click()
  }

  if (!vault) return null

  const filtered = filter === 'all' ? vault.audit : vault.audit.filter(e => e.type === filter)
  const chartData = buildChartData(vault.audit)

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-heading text-xl font-bold text-[#E1F5FE]">Audit Trail</h1>
          <p className="text-sm text-[#B0BEC5]">{vault.audit.length} events logged</p>
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="rounded-lg border border-[#1A3C50] bg-[#0E1B27] p-4">
          <p className="text-xs text-[#B0BEC5] mb-3">Activity by Hour</p>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={chartData} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1A3C50" />
              <XAxis dataKey="hour" tick={{ fill: '#B0BEC5', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip
                contentStyle={{ background: '#0E1B27', border: '1px solid #1A3C50', borderRadius: '6px', fontSize: '11px', color: '#E1F5FE' }}
              />
              <Bar dataKey="bids" fill="#00A8B5" radius={[2, 2, 0, 0]} name="Bids" />
              <Bar dataKey="fills" fill="#26A69A" radius={[2, 2, 0, 0]} name="Fills" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Filter tabs */}
      <Tabs value={filter} onValueChange={v => setFilter(v as typeof filter)}>
        <TabsList className="bg-[#0E1B27] border border-[#1A3C50] h-auto flex-wrap gap-1 p-1">
          {(['all', 'bid-placed', 'fill', 'sell-placed', 'rollover', 'ai-analysis'] as const).map(t => (
            <TabsTrigger
              key={t}
              value={t}
              className="text-xs data-[state=active]:bg-[#00A8B5]/20 data-[state=active]:text-[#00A8B5] text-[#B0BEC5]"
            >
              {t === 'all' ? 'All' : t.replace('-', ' ')}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={filter} className="mt-4">
          <div className="rounded-lg border border-[#1A3C50] bg-[#0E1B27] overflow-hidden">
            {/* Table header */}
            <div className="hidden md:grid grid-cols-[120px_1fr_80px_80px_80px_90px] px-4 py-2 text-xs text-[#B0BEC5] border-b border-[#1A3C50]">
              <span>Time</span>
              <span>Event</span>
              <span>Market</span>
              <span>Shares</span>
              <span>Price</span>
              <span className="text-right">PnL</span>
            </div>
            <div className="divide-y divide-[#1A3C50] max-h-[500px] overflow-y-auto">
              {filtered.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-10 text-[#B0BEC5]">
                  <Activity className="h-8 w-8 opacity-40" />
                  <p className="text-sm">No events</p>
                </div>
              )}
              {filtered.map(evt => (
                <div key={evt.id} className="px-4 py-3">
                  {/* Mobile */}
                  <div className="flex items-start gap-3 md:hidden">
                    <span
                      className="mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-mono uppercase font-semibold"
                      style={{ color: TYPE_COLORS[evt.type], border: `1px solid ${TYPE_COLORS[evt.type]}33`, background: `${TYPE_COLORS[evt.type]}11` }}
                    >
                      {evt.type.replace('-', ' ')}
                    </span>
                    <div className="flex-1">
                      {evt.reasoning && <p className="text-xs text-[#B0BEC5]">{evt.reasoning}</p>}
                      {evt.shares && <p className="text-xs text-[#E1F5FE]">{evt.shares} @ ${evt.price?.toFixed(3)}</p>}
                    </div>
                    <span className="text-[10px] text-[#B0BEC5] tabular-nums">{formatTime(evt.timestamp)}</span>
                  </div>
                  {/* Desktop */}
                  <div className="hidden md:grid grid-cols-[120px_1fr_80px_80px_80px_90px] items-center text-xs">
                    <span className="text-[#B0BEC5] tabular-nums">{formatTime(evt.timestamp)}</span>
                    <div className="min-w-0">
                      <Badge
                        className="text-[10px] mb-0.5"
                        style={{ color: TYPE_COLORS[evt.type], borderColor: `${TYPE_COLORS[evt.type]}33`, background: `${TYPE_COLORS[evt.type]}11` }}
                      >
                        {evt.type.replace('-', ' ')}
                      </Badge>
                      {evt.reasoning && <p className="text-[#B0BEC5] truncate">{evt.reasoning}</p>}
                    </div>
                    <span className="font-mono text-[#E1F5FE] truncate">{evt.marketId ?? '—'}</span>
                    <span className="font-mono text-[#E1F5FE]">{evt.shares ?? '—'}</span>
                    <span className="font-mono text-[#E1F5FE]">{evt.price != null ? `$${evt.price.toFixed(3)}` : '—'}</span>
                    <span className={cn(
                      'text-right font-mono font-semibold',
                      evt.pnl == null ? 'text-[#B0BEC5]' :
                      evt.pnl >= 0 ? 'text-[#26A69A]' : 'text-[#EF5350]'
                    )}>
                      {evt.pnl != null ? `${evt.pnl >= 0 ? '+' : ''}${evt.pnl.toFixed(3)}` : '—'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* CSV Export */}
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={exportCSV}
          className="border-[#1A3C50] text-[#B0BEC5] hover:text-[#E1F5FE] hover:bg-[#1A3C50] gap-1.5"
        >
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </Button>
      </div>
    </div>
  )
}
