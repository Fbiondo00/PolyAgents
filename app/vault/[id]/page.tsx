'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { getVaultById } from '@/lib/store'
import { Vault } from '@/types'
import { CycleButton } from '@/components/cycle-button'
import { ExpiryCountdown } from '@/components/expiry-countdown'
import { InventoryCard } from '@/components/inventory-card'
import { PnLSparkline } from '@/components/pnl-sparkline'
import { HCSFeed } from '@/components/hcs-feed'
import { ENSVerificationCard } from '@/components/ens-verification-card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { buildEnsName } from '@/lib/ens/subname'
import { ENS_BASE_DOMAIN } from '@/lib/ens/client'
import { TrendingUp, ChevronRight, Globe } from 'lucide-react'

function KpiCard({ label, value, sub, positive }: { label: string; value: string; sub?: string; positive?: boolean }) {
  return (
    <div className="rounded-lg border border-[#1A3C50] bg-[#0E1B27] p-4">
      <p className="text-xs text-[#B0BEC5] mb-1">{label}</p>
      <p className={cn(
        'text-2xl font-mono font-bold',
        positive === true ? 'text-[#26A69A]' :
        positive === false ? 'text-[#EF5350]' :
        'text-[#E1F5FE]'
      )}>{value}</p>
      {sub && <p className="text-xs text-[#B0BEC5] mt-0.5">{sub}</p>}
    </div>
  )
}

function Skeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="skeleton h-24 rounded-lg" />
      ))}
    </div>
  )
}

export default function VaultDashboardPage() {
  const params = useParams<{ id: string }>()
  const [vault, setVault] = useState<Vault | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(() => {
    const v = getVaultById(params.id)
    setVault(v)
    setLoading(false)
  }, [params.id])

  useEffect(() => {
    reload()
  }, [reload])

  if (loading) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <Skeleton />
      </div>
    )
  }

  if (!vault) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-[#B0BEC5]">Vault not found.</p>
        <Link href="/" className="text-[#00A8B5] underline text-sm">Back to home</Link>
      </div>
    )
  }

  const pnlPositive = vault.stats.pnl >= 0

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-heading text-xl font-bold text-[#E1F5FE]">{vault.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <a
              href={`https://app.ens.domains/name/${buildEnsName(vault.id)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-[#00A8B5] hover:text-[#4DD0E1] transition-colors"
            >
              <Globe className="h-3 w-3" />
              <span className="font-mono">{buildEnsName(vault.id)}</span>
            </a>
            <Badge className={cn(
              'text-[10px]',
              vault.mode === 'auto'
                ? 'bg-[#26A69A]/20 text-[#26A69A] border-[#26A69A]/30'
                : 'bg-[#FF8F00]/20 text-[#FF8F00] border-[#FF8F00]/30'
            )}>
              {vault.mode.toUpperCase()}
            </Badge>
            <span className="text-xs text-[#B0BEC5]">
              {vault.strategy.aiEnabled ? 'AI Enabled' : 'Manual'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <CycleButton vaultId={vault.id} onComplete={reload} />
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          label="PnL"
          value={`${pnlPositive ? '+' : ''}${vault.stats.pnl.toFixed(2)} USDC`}
          sub="All-time"
          positive={pnlPositive}
        />
        <KpiCard
          label="Flips"
          value={vault.stats.flips.toString()}
          sub="Completed fills"
        />
        <KpiCard
          label="Cycles"
          value={vault.stats.cycles.toString()}
          sub="Total runs"
        />
        <KpiCard
          label="USDC Balance"
          value={`$${vault.funding.usdc.toFixed(2)}`}
          sub={`${vault.funding.hbar.toFixed(3)} HBAR`}
        />
      </div>

      {/* Middle row */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Sparkline */}
        <div className="rounded-lg border border-[#1A3C50] bg-[#0E1B27] p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-[#B0BEC5]">PnL History</p>
            <TrendingUp className={cn('h-4 w-4', pnlPositive ? 'text-[#26A69A]' : 'text-[#EF5350]')} />
          </div>
          <PnLSparkline
            data={vault.sparkline && vault.sparkline.length > 1 ? vault.sparkline : [0, vault.stats.pnl]}
            height={80}
            showTooltip
          />
        </div>

        {/* Inventory */}
        <InventoryCard vault={vault} />
      </div>

      {/* Active Market */}
      {vault.activeMarket && (
        <div className="rounded-lg border border-[#1A3C50] bg-[#0E1B27] p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-[#B0BEC5]">Active Market</p>
            <Link href={`/vault/${vault.id}/markets`}>
              <button className="flex items-center gap-1 text-xs text-[#00A8B5] hover:text-[#4DD0E1]">
                View <ChevronRight className="h-3 w-3" />
              </button>
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-[#B0BEC5]">Market ID</p>
              <p className="font-mono text-sm text-[#E1F5FE]">{vault.activeMarket.id}</p>
            </div>
            <div>
              <p className="text-xs text-[#B0BEC5]">Mid Price</p>
              <p className="font-mono text-sm text-[#E1F5FE]">{vault.activeMarket.midPrice.toFixed(3)}</p>
            </div>
            <div>
              <ExpiryCountdown expiry={vault.activeMarket.expiry} />
            </div>
          </div>
        </div>
      )}

      {/* HCS Feed */}
      <HCSFeed vault={vault} />

      {/* ENS Verification */}
      <ENSVerificationCard vault={vault} />

      {/* Recent Activity */}
      <div className="rounded-lg border border-[#1A3C50] bg-[#0E1B27] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1A3C50]">
          <p className="text-xs font-semibold text-[#E1F5FE]">Recent Activity</p>
          <Link href={`/vault/${vault.id}/audit`}>
            <button className="text-xs text-[#00A8B5] hover:text-[#4DD0E1]">View all</button>
          </Link>
        </div>
        <div className="divide-y divide-[#1A3C50]">
          {vault.audit.slice(0, 5).map(evt => {
            const colors: Record<string, string> = {
              'bid-placed': '#00A8B5',
              fill: '#26A69A',
              'sell-placed': '#4DD0E1',
              rollover: '#B0BEC5',
              reconcile: '#80DEEA',
              'ai-analysis': '#FF8F00',
            }
            return (
              <div key={evt.id} className="flex items-start gap-3 px-4 py-3">
                <span
                  className="mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-mono uppercase font-semibold"
                  style={{ color: colors[evt.type], border: `1px solid ${colors[evt.type]}33`, background: `${colors[evt.type]}11` }}
                >
                  {evt.type.replace('-', ' ')}
                </span>
                <div className="flex-1 min-w-0">
                  {evt.reasoning && (
                    <p className="text-xs text-[#B0BEC5] truncate">{evt.reasoning}</p>
                  )}
                  {evt.shares && (
                    <p className="text-xs text-[#E1F5FE]">
                      {evt.shares} shares @ ${evt.price?.toFixed(3)}
                      {evt.pnl !== undefined && (
                        <span className={cn('ml-2', evt.pnl >= 0 ? 'text-[#26A69A]' : 'text-[#EF5350]')}>
                          {evt.pnl >= 0 ? '+' : ''}{evt.pnl.toFixed(3)} USDC
                        </span>
                      )}
                    </p>
                  )}
                </div>
                <span className="text-[10px] text-[#B0BEC5] shrink-0 tabular-nums">
                  {new Date(evt.timestamp).toLocaleTimeString([], { hour12: false })}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
