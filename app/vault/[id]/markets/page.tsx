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
import {
  fetchAllMarkets,
  fetchMarketCount,
  fetchOdds,
  placeBetOnMarket,
  createPredictionMarket,
  resolvePredictionMarket,
} from '@/actions/arc/markets'

interface ArcMarket {
  marketId: number
  question: string
  category: string
  resolutionTime: string
  totalYes: string
  totalNo: string
  outcome: number
  resolved: boolean
}

export default function MarketsPage() {
  const params = useParams<{ id: string }>()
  const [vault, setVault] = useState<Vault | null>(null)
  const [markets, setMarkets] = useState<ArcMarket[]>([])
  const [selectedMarketId, setSelectedMarketId] = useState<number | null>(null)
  const [selectedOdds, setSelectedOdds] = useState<{ yesOdds: number; noOdds: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [bidding, setBidding] = useState(false)
  const [betSide, setBetSide] = useState<'YES' | 'NO'>('YES')
  const [betAmount, setBetAmount] = useState('5')
  const [newQuestion, setNewQuestion] = useState('')
  const [creating, setCreating] = useState(false)

  const loadMarkets = useCallback(async () => {
    setLoading(true)
    try {
      const count = await fetchMarketCount()
      if (count === 0) {
        setMarkets([])
        setSelectedMarketId(null)
        return
      }
      const data = await fetchAllMarkets()
      if (!Array.isArray(data)) { setMarkets([]); return }
      setMarkets(data as unknown as ArcMarket[])
      if (data.length > 0 && !selectedMarketId) {
        setSelectedMarketId(Number((data as unknown as ArcMarket[])[0].marketId))
      }
    } catch {
      // silently fail — server actions may fail if Anvil is down
    } finally {
      setLoading(false)
    }
  }, [selectedMarketId])

  useEffect(() => {
    setVault(getVaultById(params.id))
  }, [params.id])

  useEffect(() => {
    loadMarkets()
  }, [])

  // Fetch odds when market selection changes
  useEffect(() => {
    if (selectedMarketId == null) return
    fetchOdds(selectedMarketId).then(odds => { if ('yesOdds' in odds) setSelectedOdds(odds); else setSelectedOdds(null) }).catch(() => setSelectedOdds(null))
  }, [selectedMarketId])

  const selectedMarket = markets.find(m => Number(m.marketId) === selectedMarketId) ?? null
  const yesP = selectedMarket
    ? selectedMarket.totalYes === '0' && selectedMarket.totalNo === '0' ? 50
      : Math.round((Number(selectedMarket.totalYes) / (Number(selectedMarket.totalYes) + Number(selectedMarket.totalNo))) * 100)
    : 50

  async function handleCreateMarket() {
    if (!vault || !newQuestion.trim()) return
    setCreating(true)
    try {
      const res = await createPredictionMarket({
        question: newQuestion,
        category: 'crypto',
        resolutionTime: new Date(Date.now() + 7 * 86400000),
        hederaTopicId: '0.0.pending',
        policyHash: '0x' + '00'.repeat(32),
      })
      if (!res.success) throw new Error(res.error ?? 'Failed to create market')
      toast.success(`Market #${res.marketId} created`)
      setNewQuestion('')
      await loadMarkets()
    } catch (err) {
      toast.error(`Failed: ${(err as Error).message}`)
    } finally {
      setCreating(false)
    }
  }

  async function handlePlaceBet() {
    if (!vault || selectedMarketId == null) return
    setBidding(true)
    try {
      const res = await placeBetOnMarket({
        marketId: selectedMarketId,
        isYes: betSide === 'YES',
        amountUsdc: Number(betAmount),
      })
      if (!res.success) throw new Error(res.error ?? 'Failed to place bet')
      addAuditEvent(vault.id, {
        id: generateAuditId(),
        type: 'bid-placed',
        timestamp: Date.now(),
        marketId: String(selectedMarketId),
        shares: Number(betAmount),
        price: vault.strategy.bidPrice,
        txHash: res.txHash,
      })
      toast.success(`${betSide} ${betAmount} USDC on #${selectedMarketId}`, {
        description: `tx: ${res.txHash.slice(0, 18)}...`,
      })
      await loadMarkets()
      if (selectedMarketId != null) {
        const odds = await fetchOdds(selectedMarketId)
        if ('yesOdds' in odds) setSelectedOdds(odds)
      }
    } catch (err) {
      toast.error(`Failed: ${(err as Error).message}`)
    } finally {
      setBidding(false)
    }
  }

  if (!vault) return null

  const outcomeLabel = (o: number) =>
    o === 1 ? 'YES' : o === 2 ? 'NO' : o === 3 ? 'VOIDED' : 'OPEN'

  const yesPct = selectedOdds ? Math.round(selectedOdds.yesOdds / 100) : 50
  const noPct = selectedOdds ? Math.round(selectedOdds.noOdds / 100) : 50

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-heading text-xl font-bold text-[#E1F5FE]">Markets</h1>
          <p className="text-sm text-[#B0BEC5]">Arc prediction markets. Select a market to place a bet.</p>
        </div>
        <button
          onClick={loadMarkets}
          disabled={loading}
          className="p-2 rounded-lg border border-[#1A3C50] bg-[#0E1B27] text-[#B0BEC5] hover:text-[#4DD0E1] hover:border-[#4DD0E1]/40 transition-all"
        >
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
        </button>
      </div>

      {/* Create market */}
      <div className="flex gap-2">
        <input
          value={newQuestion}
          onChange={e => setNewQuestion(e.target.value)}
          placeholder="New market question..."
          className="flex-1 rounded-lg px-3 py-2 text-sm bg-[#081216] border border-[#1A3C50] text-[#E1F5FE] placeholder:text-[#B0BEC5]/50"
        />
        <Button
          onClick={handleCreateMarket}
          disabled={creating || !newQuestion.trim()}
          className="bg-[#00A8B5] hover:bg-[#4DD0E1] text-[#081216] font-semibold gap-2 shrink-0"
        >
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
          Create
        </Button>
      </div>

      {/* Market list */}
      {loading ? (
        <div className="flex items-center justify-center py-10 text-[#B0BEC5]">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading markets...
        </div>
      ) : markets.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-[#B0BEC5]">
          <p className="text-sm">No markets yet. Create one above.</p>
        </div>
      ) : (
        <div className="grid gap-2">
          {markets.map(market => {
            const id = Number(market.marketId)
            const yesP = market.totalYes === '0' && market.totalNo === '0' ? 50
              : Math.round((Number(market.totalYes) / (Number(market.totalYes) + Number(market.totalNo))) * 100)
            return (
              <button
                key={String(id)}
                onClick={() => setSelectedMarketId(id)}
                className={cn(
                  'w-full rounded-lg border p-4 text-left transition-all',
                  selectedMarketId === id
                    ? 'border-[#00A8B5] bg-[#00A8B5]/10'
                    : 'border-[#1A3C50] bg-[#0E1B27] hover:border-[#00A8B5]/40'
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#E1F5FE] truncate">{market.question}</p>
                    <p className="text-xs text-[#B0BEC5] font-mono mt-0.5">
                      #{id} · {market.category}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 ml-4">
                    <div className="text-right text-xs">
                      <span className="text-[#26A69A]">{market.totalYes}</span>
                      <span className="text-[#B0BEC5]"> / </span>
                      <span className="text-[#EF5350]">{market.totalNo}</span>
                      <p className="text-[#B0BEC5]">USDC</p>
                    </div>
                    <Badge className={cn(
                      'text-[10px]',
                      market.resolved
                        ? market.outcome === 1
                          ? 'bg-[#26A69A]/20 text-[#26A69A] border-[#26A69A]/30'
                          : 'bg-[#EF5350]/20 text-[#EF5350] border-[#EF5350]/30'
                        : yesP >= 65
                          ? 'bg-[#26A69A]/20 text-[#26A69A] border-[#26A69A]/30'
                          : yesP >= 40
                          ? 'bg-[#FF8F00]/20 text-[#FF8F00] border-[#FF8F00]/30'
                          : 'bg-[#EF5350]/20 text-[#EF5350] border-[#EF5350]/30'
                    )}>
                      {market.resolved ? outcomeLabel(market.outcome) : `${yesP}/${100 - yesP}`}
                    </Badge>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Market detail */}
      {selectedMarket && (
        <div className="rounded-lg border border-[#1A3C50] bg-[#0E1B27] overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-[#1A3C50] flex items-center justify-between">
            <div>
              <p className="font-semibold text-[#E1F5FE] text-sm">{selectedMarket.question}</p>
              <p className="text-xs font-mono text-[#B0BEC5]">
                #{selectedMarket.marketId} · {selectedMarket.category}
                {selectedMarket.resolutionTime && (
                  <span> · Resolves: {new Date(selectedMarket.resolutionTime).toLocaleDateString()}</span>
                )}
              </p>
            </div>
            <Badge className={cn(
              'text-xs',
              selectedMarket.resolved
                ? 'bg-[#FF8F00]/20 text-[#FF8F00] border-[#FF8F00]/30'
                : 'bg-[#26A69A]/20 text-[#26A69A] border-[#26A69A]/30'
            )}>
              {selectedMarket.resolved ? outcomeLabel(selectedMarket.outcome) : 'OPEN'}
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
                <p className="text-xs text-[#B0BEC5]">
                  {yesP >= 65
                    ? 'Market leans YES — stronger UP entry'
                    : yesP >= 40
                    ? 'Balanced — consider sizing down'
                    : 'Market leans NO — stronger DOWN entry'}
                </p>
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

              {/* Amount + summary */}
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
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-[#B0BEC5]">Side</span>
                    <span className={betSide === 'YES' ? 'text-[#26A69A]' : 'text-[#EF5350]'}>
                      {betSide}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#B0BEC5]">Amount</span>
                    <span className="font-mono text-[#E1F5FE]">{betAmount} USDC</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#B0BEC5]">Pool</span>
                    <span className="font-mono text-[#E1F5FE]">
                      {selectedMarket.totalYes} / {selectedMarket.totalNo} USDC
                    </span>
                  </div>
                </div>
              </div>

              <Button
                onClick={handlePlaceBet}
                disabled={bidding || selectedMarket.resolved}
                className="w-full bg-[#00A8B5] hover:bg-[#4DD0E1] text-[#081216] font-bold gap-2"
              >
                {bidding ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Placing bet…
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4" />
                    Place Bet
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
