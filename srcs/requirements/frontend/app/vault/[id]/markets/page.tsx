'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { getVaultById, addAuditEvent, generateAuditId } from '@/lib/store'
import { Vault } from '@/types'
import { OrderBookTable } from '@/components/order-book-table'
import { ExpiryCountdown } from '@/components/expiry-countdown'
import { FillProbabilityRing } from '@/components/fill-probability-ring'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Loader2, TrendingUp, TrendingDown, Zap, RefreshCw } from 'lucide-react'

export default function MarketsPage() {
  const params = useParams<{ id: string }>()
  const [vault, setVault] = useState<Vault | null>(null)
  const [selectedOdds, setSelectedOdds] = useState<{ yesOdds: number; noOdds: number } | null>(null)
  const [betSide, setBetSide] = useState<'YES' | 'NO'>('YES')
  const [betAmount, setBetAmount] = useState('5')

  useEffect(() => {
    async function load() {
      setVault(await getVaultById(params.id))
    }
    load()
  }, [params.id])

  if (!vault) return null

  const yesP = 50

  const yesPct = selectedOdds ? Math.round(selectedOdds.yesOdds / 100) : 50
  const noPct = selectedOdds ? Math.round(selectedOdds.noOdds / 100) : 50

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-heading text-xl font-bold text-[#E1F5FE]">Markets</h1>
          <p className="text-sm text-[#B0BEC5]">Browse prediction markets and place bets.</p>
        </div>
      </div>

      {/* Market detail placeholder */}
      {vault.activeMarket && (
        <div className="rounded-lg border border-[#1A3C50] bg-[#0E1B27] overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-[#1A3C50] flex items-center justify-between">
            <div>
              <p className="font-semibold text-[#E1F5FE] text-sm">BTC 5-Min Binary Market</p>
              <p className="text-xs font-mono text-[#B0BEC5]">
                {vault.activeMarket.id}
              </p>
            </div>
            <Badge className="text-xs bg-[#26A69A]/20 text-[#26A69A] border-[#26A69A]/30">
              OPEN
            </Badge>
          </div>

          {/* Body */}
          <div className="p-4 grid gap-6 md:grid-cols-2">
            {/* Order book */}
            <div className="space-y-2">
              <p className="text-xs text-[#B0BEC5]">Order Book</p>
              <OrderBookTable midPrice={yesP / 100} />
            </div>

            {/* Odds + Bet */}
            <div className="space-y-4">
              {/* Live odds */}
              <div className="flex flex-col items-center gap-2 rounded-lg border border-[#1A3C50] bg-[#081216] p-4">
                <FillProbabilityRing probability={yesP / 100} />
                <div className="flex gap-4 text-center">
                  <div>
                    <p className="text-lg font-bold text-[#26A69A]">{yesPct}%</p>
                    <p className="text-[10px] text-[#B0BEC5]">YES</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-[#EF5350]">{noPct}%</p>
                    <p className="text-[10px] text-[#B0BEC5]">NO</p>
                  </div>
                </div>
              </div>

              {/* Side selector */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setBetSide('YES')}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border p-3 text-sm font-semibold transition-all',
                    betSide === 'YES'
                      ? 'border-[#26A69A] bg-[#26A69A]/15 text-[#26A69A]'
                      : 'border-[#1A3C50] text-[#B0BEC5] hover:border-[#26A69A]/40'
                  )}
                >
                  <TrendingUp className="h-4 w-4" />
                  YES
                </button>
                <button
                  onClick={() => setBetSide('NO')}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border p-3 text-sm font-semibold transition-all',
                    betSide === 'NO'
                      ? 'border-[#EF5350] bg-[#EF5350]/15 text-[#EF5350]'
                      : 'border-[#1A3C50] text-[#B0BEC5] hover:border-[#EF5350]/40'
                  )}
                >
                  <TrendingDown className="h-4 w-4" />
                  NO
                </button>
              </div>

              {/* Amount */}
              <div className="rounded-lg border border-[#1A3C50] bg-[#081216] p-3 space-y-2">
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={betAmount}
                    onChange={e => setBetAmount(e.target.value)}
                    min="1"
                    step="1"
                    className="flex-1 rounded px-3 py-2 text-sm bg-[#081216] border border-[#1A3C50] text-[#E1F5FE]"
                  />
                  <span className="text-xs text-[#B0BEC5] self-center">USDC</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
