'use client'

import { useEffect, useState } from 'react'
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
import { Loader2, TrendingUp, TrendingDown, Zap } from 'lucide-react'

const MOCK_MARKETS = [
  { id: 'btc-5m-42', label: 'Will BTC close UP in the next 5m?', midPrice: 0.523, expiry: Date.now() + 167000, fillProb: 0.72 },
  { id: 'eth-5m-18', label: 'Will ETH close UP in the next 5m?', midPrice: 0.481, expiry: Date.now() + 240000, fillProb: 0.54 },
  { id: 'sol-5m-07', label: 'Will SOL close DOWN in the next 5m?', midPrice: 0.612, expiry: Date.now() + 90000, fillProb: 0.41 },
  { id: 'hbar-5m-03', label: 'Will HBAR close UP in the next 5m?', midPrice: 0.388, expiry: Date.now() + 180000, fillProb: 0.67 },
]

export default function MarketsPage() {
  const params = useParams<{ id: string }>()
  const [vault, setVault] = useState<Vault | null>(null)
  const [selectedMarket, setSelectedMarket] = useState(MOCK_MARKETS[0])
  const [bidding, setBidding] = useState(false)
  const [bidSide, setBidSide] = useState<'up' | 'down'>('up')

  useEffect(() => {
    setVault(getVaultById(params.id))
  }, [params.id])

  async function placeBid() {
    if (!vault) return
    setBidding(true)
    await new Promise(r => setTimeout(r, 1500))
    addAuditEvent(vault.id, {
      id: generateAuditId(),
      type: 'bid-placed',
      timestamp: Date.now(),
      marketId: selectedMarket.id,
      shares: vault.strategy.trancheSize,
      price: vault.strategy.bidPrice,
    })
    toast.success(`Bid placed on ${selectedMarket.id}`, {
      description: `${vault.strategy.trancheSize} shares @ $${vault.strategy.bidPrice} (${bidSide.toUpperCase()})`,
    })
    setBidding(false)
  }

  if (!vault) return null

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div>
        <h1 className="font-heading text-xl font-bold text-[#E1F5FE]">Markets</h1>
        <p className="text-sm text-[#B0BEC5]">Live CLOB markets. Select a market to place a bid.</p>
      </div>

      {/* Market list */}
      <div className="grid gap-2">
        {MOCK_MARKETS.map(market => (
          <button
            key={market.id}
            onClick={() => setSelectedMarket(market)}
            className={cn(
              'w-full rounded-lg border p-4 text-left transition-all',
              selectedMarket.id === market.id
                ? 'border-[#00A8B5] bg-[#00A8B5]/10'
                : 'border-[#1A3C50] bg-[#0E1B27] hover:border-[#00A8B5]/40'
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#E1F5FE] truncate">{market.label}</p>
                <p className="text-xs text-[#B0BEC5] font-mono mt-0.5">{market.id}</p>
              </div>
              <div className="flex items-center gap-3 ml-4">
                <div className="text-right">
                  <p className="text-xs text-[#B0BEC5]">Mid</p>
                  <p className="font-mono text-sm text-[#E1F5FE]">{market.midPrice.toFixed(3)}</p>
                </div>
                <Badge className={cn(
                  'text-[10px]',
                  market.fillProb >= 0.65
                    ? 'bg-[#26A69A]/20 text-[#26A69A] border-[#26A69A]/30'
                    : market.fillProb >= 0.4
                    ? 'bg-[#FF8F00]/20 text-[#FF8F00] border-[#FF8F00]/30'
                    : 'bg-[#EF5350]/20 text-[#EF5350] border-[#EF5350]/30'
                )}>
                  {Math.round(market.fillProb * 100)}%
                </Badge>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Market detail */}
      <div className="rounded-lg border border-[#1A3C50] bg-[#0E1B27] overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#1A3C50] flex items-center justify-between">
          <div>
            <p className="font-semibold text-[#E1F5FE] text-sm">{selectedMarket.label}</p>
            <p className="text-xs font-mono text-[#B0BEC5]">{selectedMarket.id}</p>
          </div>
          <ExpiryCountdown expiry={selectedMarket.expiry} className="w-40" />
        </div>

        {/* Body */}
        <div className="p-4 grid gap-6 md:grid-cols-2">
          {/* Order book */}
          <div className="space-y-2">
            <p className="text-xs text-[#B0BEC5]">Order Book</p>
            <OrderBookTable midPrice={selectedMarket.midPrice} />
          </div>

          {/* AI + Bid */}
          <div className="space-y-4">
            {/* AI Probability */}
            <div className="flex flex-col items-center gap-2 rounded-lg border border-[#1A3C50] bg-[#081216] p-4">
              <FillProbabilityRing probability={selectedMarket.fillProb} />
              <div className="text-center">
                <p className="text-xs text-[#B0BEC5]">
                  {selectedMarket.fillProb >= 0.65
                    ? 'Strong signal — AI recommends entry'
                    : selectedMarket.fillProb >= 0.4
                    ? 'Moderate signal — consider sizing down'
                    : 'Weak signal — stand aside'}
                </p>
              </div>
            </div>

            {/* Side selector */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setBidSide('up')}
                className={cn(
                  'flex items-center gap-2 rounded-lg border p-3 text-sm font-semibold transition-all',
                  bidSide === 'up'
                    ? 'border-[#26A69A] bg-[#26A69A]/15 text-[#26A69A]'
                    : 'border-[#1A3C50] text-[#B0BEC5] hover:border-[#26A69A]/40'
                )}
              >
                <TrendingUp className="h-4 w-4" />
                UP
              </button>
              <button
                onClick={() => setBidSide('down')}
                className={cn(
                  'flex items-center gap-2 rounded-lg border p-3 text-sm font-semibold transition-all',
                  bidSide === 'down'
                    ? 'border-[#EF5350] bg-[#EF5350]/15 text-[#EF5350]'
                    : 'border-[#1A3C50] text-[#B0BEC5] hover:border-[#EF5350]/40'
                )}
              >
                <TrendingDown className="h-4 w-4" />
                DOWN
              </button>
            </div>

            {/* Bid summary */}
            <div className="rounded-lg border border-[#1A3C50] bg-[#081216] p-3 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-[#B0BEC5]">Side</span>
                <span className={bidSide === 'up' ? 'text-[#26A69A]' : 'text-[#EF5350]'}>
                  {bidSide.toUpperCase()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#B0BEC5]">Price</span>
                <span className="font-mono text-[#E1F5FE]">${vault.strategy.bidPrice}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#B0BEC5]">Shares</span>
                <span className="font-mono text-[#E1F5FE]">{vault.strategy.trancheSize}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#B0BEC5]">Cost</span>
                <span className="font-mono text-[#00A8B5]">
                  ${(vault.strategy.bidPrice * vault.strategy.trancheSize).toFixed(2)}
                </span>
              </div>
            </div>

            <Button
              onClick={placeBid}
              disabled={bidding}
              className="w-full bg-[#00A8B5] hover:bg-[#4DD0E1] text-[#081216] font-bold gap-2"
            >
              {bidding ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Placing bid…
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4" />
                  Place Bid
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
