'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { getVaultById, saveVault, updateVaultStats } from '@/lib/store'
import { Vault } from '@/types'
import { startEngine, stopEngine, getEngineStatus, runSingleCycle, fetchActiveMarket } from '@/actions/engine'
import type { EngineStatus } from '@/actions/engine'
import type { ActiveMarketData } from '@/types/workflow'
import { CycleButton } from '@/components/cycle-button'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Bot, Pause, Play, Zap, Brain, AlertTriangle,
  Loader2, BookOpen, Radio, Timer, ArrowUpDown,
} from 'lucide-react'

// ── Types ──

interface CycleLog {
  id: string
  timestamp: number
  stages: string[]
  result: string
  pnl: number
  market?: string
}

// ── Helpers ──

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return 'EXPIRED'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatBook(book: { bestBid: number | null; bestAsk: number | null }): { bid: string; ask: string; spread: string } {
  const bid = book.bestBid !== null ? `$${book.bestBid.toFixed(2)}` : '—'
  const ask = book.bestAsk !== null ? `$${book.bestAsk.toFixed(2)}` : '—'
  const spread = book.bestBid !== null && book.bestAsk !== null
    ? `$${((book.bestAsk - book.bestBid) * 100).toFixed(1)}¢`
    : '—'
  return { bid, ask, spread }
}

// ── Component ──

export default function AgentPage() {
  const params = useParams<{ id: string }>()
  const [vault, setVault] = useState<Vault | null>(null)
  const [running, setRunning] = useState(false)
  const [cycleLogs, setCycleLogs] = useState<CycleLog[]>([])
  const [currentReasoning, setCurrentReasoning] = useState('')
  const [hbarPct, setHbarPct] = useState(84.7)
  const [engineStatus, setEngineStatus] = useState<EngineStatus | null>(null)
  const [activeMarket, setActiveMarket] = useState<ActiveMarketData | null>(null)
  const [marketLoading, setMarketLoading] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const countdownRef = useRef<NodeJS.Timeout | null>(null)

  // ── Initial load ──

  useEffect(() => {
    const v = getVaultById(params.id)
    setVault(v)
    if (v) {
      setHbarPct(Math.round((v.funding.hbar / 1.2) * 100))
      setRunning(v.mode === 'auto')
      getEngineStatus(params.id).then(setEngineStatus)
      loadMarket()
    }
  }, [params.id])

  // ── Countdown timer ──

  useEffect(() => {
    countdownRef.current = setInterval(() => {
      if (activeMarket) {
        const toExpiry = activeMarket.endTs - Math.floor(Date.now() / 1000)
        setCountdown(toExpiry)
      }
    }, 1000)
    return () => { if (countdownRef.current) clearInterval(countdownRef.current) }
  }, [activeMarket])

  // ── Market polling ──

  const loadMarket = useCallback(async () => {
    if (!params.id) return
    setMarketLoading(true)
    try {
      const data = await fetchActiveMarket(params.id)
      setActiveMarket(data)
    } catch {
      // market fetch failed silently
    }
    setMarketLoading(false)
  }, [params.id])

  useEffect(() => {
    if (!running) return
    const poll = setInterval(loadMarket, 5000)
    return () => clearInterval(poll)
  }, [running, loadMarket])

  // ── Auto cycle loop (10s interval) ──

  useEffect(() => {
    if (!running || !vault) return

    intervalRef.current = setInterval(async () => {
      const cycleResult = await runSingleCycle(vault.id)

      // Update reasoning from AI decision
      if (cycleResult.reasoning) {
        setCurrentReasoning(cycleResult.reasoning)
      }

      // Update active market from cycle result
      if (cycleResult.activeMarket) {
        setActiveMarket(cycleResult.activeMarket)
      }

      // Update engine status
      const status = await getEngineStatus(vault.id)
      setEngineStatus(status)

      const filled = cycleResult.fills > 0
      const deltaPnl = cycleResult.pnl ?? 0

      if (filled && deltaPnl > 0) {
        toast.success(`Auto-fill: +${deltaPnl.toFixed(3)} USDC`)
      }

      // Sync vault stats
      updateVaultStats(vault.id, deltaPnl)
      setVault(getVaultById(vault.id))

      // Build cycle log
      const marketQ = cycleResult.activeMarket?.question?.slice(0, 35) ?? 'Unknown'
      const isLive = cycleResult.activeMarket?.isLive ?? false
      const stages = [
        `Discover ✓`,
        cycleResult.decision ? 'AI ✓' : 'AI —',
        filled ? `${cycleResult.fills} fill(s)` : 'No fill',
        isLive ? 'LIVE' : 'SIM',
      ]

      setCycleLogs(prev => [{
        id: `cl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: Date.now(),
        stages,
        result: filled ? `+${deltaPnl.toFixed(3)} USDC` : 'No fill',
        pnl: deltaPnl,
        market: marketQ,
      }, ...prev].slice(0, 30))
    }, 10000)

    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [running, vault])

  // ── Toggle mode ──

  function toggleMode() {
    if (!vault) return
    const newMode = vault.mode === 'auto' ? 'advisory' : 'auto'
    const updated = { ...vault, mode: newMode as 'auto' | 'advisory' }
    saveVault(updated)
    setVault(updated)
    setRunning(newMode === 'auto')
    toast.info(`Agent switched to ${newMode} mode`)

    if (newMode === 'auto') {
      startEngine(vault.id)
    } else {
      stopEngine(vault.id)
    }
  }

  function reload() {
    setVault(getVaultById(params.id))
  }

  if (!vault) return null

  // ── Compute book data ──

  const yesBook = activeMarket ? formatBook(activeMarket.yesBook) : null
  const noBook = activeMarket ? formatBook(activeMarket.noBook) : null

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-heading text-xl font-bold text-[#E1F5FE]">Agent Control</h1>
          <p className="text-sm text-[#B0BEC5]">Autonomous 5-min BTC passive market-making on Polymarket.</p>
        </div>
        <div className="flex gap-2">
          <CycleButton vaultId={vault.id} onComplete={reload} className="hidden sm:flex" />
        </div>
      </div>

      {/* ── Live Polymarket Market Card ── */}
      <div className="rounded-lg border border-[#1A3C50] bg-[#0E1B27] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1A3C50]">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-[#00A8B5]" />
            <p className="text-sm font-semibold text-[#E1F5FE]">Polymarket Market</p>
            {activeMarket && (
              activeMarket.isLive
                ? <Badge className="text-[10px] bg-[#26A69A]/20 text-[#26A69A] border-[#26A69A]/30">LIVE</Badge>
                : <Badge className="text-[10px] bg-[#FF8F00]/20 text-[#FF8F00] border-[#FF8F00]/30">SIMULATED</Badge>
            )}
            {marketLoading && <Loader2 className="h-3 w-3 animate-spin text-[#00A8B5]" />}
          </div>
          {activeMarket && (
            <div className="flex items-center gap-1.5">
              <Timer className="h-3.5 w-3.5 text-[#B0BEC5]" />
              <span className={cn(
                'font-mono text-sm font-bold tabular-nums',
                countdown > 60 ? 'text-[#E1F5FE]' : countdown > 10 ? 'text-[#FF8F00]' : 'text-[#EF5350]'
              )}>
                {formatCountdown(countdown)}
              </span>
            </div>
          )}
        </div>

        {activeMarket ? (
          <div className="p-4 space-y-3">
            {/* Market question */}
            <p className="text-sm text-[#E1F5FE] leading-relaxed">{activeMarket.question}</p>

            {/* Order books side by side */}
            <div className="grid grid-cols-2 gap-3">
              {/* YES side */}
              <div className="rounded-lg border border-[#26A69A]/30 bg-[#081216] p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <ArrowUpDown className="h-3.5 w-3.5 text-[#26A69A]" />
                  <span className="text-xs font-semibold text-[#26A69A]">YES</span>
                </div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-[#B0BEC5]">Best Bid</span>
                    <span className="font-mono text-[#E1F5FE]">{yesBook?.bid ?? '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#B0BEC5]">Best Ask</span>
                    <span className="font-mono text-[#E1F5FE]">{yesBook?.ask ?? '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#B0BEC5]">Spread</span>
                    <span className="font-mono text-[#B0BEC5]">{yesBook?.spread ?? '—'}</span>
                  </div>
                </div>
              </div>

              {/* NO side */}
              <div className="rounded-lg border border-[#EF5350]/30 bg-[#081216] p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <ArrowUpDown className="h-3.5 w-3.5 text-[#EF5350]" />
                  <span className="text-xs font-semibold text-[#EF5350]">NO</span>
                </div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-[#B0BEC5]">Best Bid</span>
                    <span className="font-mono text-[#E1F5FE]">{noBook?.bid ?? '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#B0BEC5]">Best Ask</span>
                    <span className="font-mono text-[#E1F5FE]">{noBook?.ask ?? '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#B0BEC5]">Spread</span>
                    <span className="font-mono text-[#B0BEC5]">{noBook?.spread ?? '—'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Strategy indicator */}
            <div className="flex items-center gap-4 text-[10px] text-[#B0BEC5]">
              <div className="flex items-center gap-1">
                <BookOpen className="h-3 w-3" />
                <span>Entry $0.01 / Exit $0.02</span>
              </div>
              <div className="flex items-center gap-1">
                <BookOpen className="h-3 w-3" />
                <span>100% spread capture</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-8 text-[#B0BEC5]">
            <Radio className="h-8 w-8 opacity-40" />
            <p className="text-sm">Searching for active 5-min BTC market...</p>
            {marketLoading && <Loader2 className="h-4 w-4 animate-spin text-[#00A8B5]" />}
          </div>
        )}
      </div>

      {/* ── Agent Status ── */}
      <div className="rounded-lg border border-[#1A3C50] bg-[#0E1B27] p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={cn(
              'flex h-10 w-10 items-center justify-center rounded-full',
              running ? 'bg-[#26A69A]/20' : 'bg-[#1A3C50]'
            )}>
              <Bot className={cn('h-5 w-5', running ? 'text-[#26A69A]' : 'text-[#B0BEC5]')} />
            </div>
            <div>
              <p className="font-semibold text-[#E1F5FE]">Agent Status</p>
              <div className="flex items-center gap-2">
                <span className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  running ? 'bg-[#26A69A] animate-pulse' : 'bg-[#B0BEC5]'
                )} />
                <span className="text-xs text-[#B0BEC5]">
                  {running ? 'Running autonomously' : 'Advisory mode (paused)'}
                </span>
              </div>
            </div>
          </div>
          <Button
            onClick={toggleMode}
            variant="outline"
            size="sm"
            className={cn(
              'gap-2 border transition-all',
              running
                ? 'border-[#FF8F00]/40 text-[#FF8F00] hover:bg-[#FF8F00]/10'
                : 'border-[#26A69A]/40 text-[#26A69A] hover:bg-[#26A69A]/10'
            )}
          >
            {running ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {running ? 'Pause' : 'Activate'}
          </Button>
        </div>

        {/* HBAR gauge */}
        <div className="rounded-lg border border-[#1A3C50] bg-[#081216] p-3 space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-[#B0BEC5]">HBAR Reserve</span>
            <span className="font-mono text-[#E1F5FE]">{vault.funding.hbar.toFixed(3)} HBAR</span>
          </div>
          <div className="h-2 rounded-full bg-[#1A3C50] overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all duration-700', hbarPct > 50 ? 'bg-[#00A8B5]' : hbarPct > 20 ? 'bg-[#FF8F00]' : 'bg-[#EF5350]')}
              style={{ width: `${hbarPct}%` }}
            />
          </div>
          {hbarPct < 30 && (
            <div className="flex items-center gap-1 text-xs text-[#FF8F00]">
              <AlertTriangle className="h-3 w-3" />
              Low HBAR — cycles may be skipped
            </div>
          )}
        </div>
      </div>

      {/* ── Strategy Specification ── */}
      <div className="rounded-lg border border-[#1A3C50] bg-[#0E1B27] p-4">
        <div className="flex items-center gap-2 mb-3">
          <BookOpen className="h-4 w-4 text-[#00A8B5]" />
          <p className="text-sm font-semibold text-[#E1F5FE]">Strategy</p>
          <Badge className="text-[10px] bg-[#00A8B5]/20 text-[#00A8B5] border-[#00A8B5]/30">Locked</Badge>
        </div>
        <p className="text-xs text-[#B0BEC5] mb-2">This agent implements a single strategy:</p>
        <div className="rounded-lg border border-[#00A8B5]/20 bg-[#081216] p-3 space-y-1.5 text-xs">
          <p className="text-[#E1F5FE] font-semibold">5-Minute BTC Binary Market-Making</p>
          <p className="text-[#B0BEC5]">Passive market-making on Polymarket &quot;Up or Down&quot; markets.</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[10px] text-[#B0BEC5]">
            <span>Entry: <span className="text-[#E1F5FE] font-mono">$0.01</span></span>
            <span>Exit: <span className="text-[#E1F5FE] font-mono">$0.02</span></span>
            <span>Sides: <span className="text-[#E1F5FE]">YES + NO</span></span>
            <span>Spread: <span className="text-[#26A69A]">100%</span></span>
          </div>
        </div>
      </div>

      {/* ── Engine Status ── */}
      {engineStatus && (
        <div className="rounded-lg border border-[#1A3C50] bg-[#0E1B27] p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-[#E1F5FE]">Engine Status</p>
            <span className={cn('font-mono text-sm', engineStatus.state ? 'text-[#00A8B5]' : 'text-[#B0BEC5]')}>
              {engineStatus.state ?? 'IDLE'}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div>
              <span className="text-[#B0BEC5]">Cycles</span>
              <p className="font-mono text-[#E1F5FE]">{engineStatus.cycleCount}</p>
            </div>
            <div>
              <span className="text-[#B0BEC5]">State</span>
              <p className="font-mono text-[#E1F5FE]">{engineStatus.state ?? 'IDLE'}</p>
            </div>
            <div>
              <span className="text-[#B0BEC5]">Market</span>
              <p className="font-mono text-[#E1F5FE] truncate">{engineStatus.activeMarketId ?? '—'}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── AI Reasoning Panel ── */}
      <div className="rounded-lg border border-[#1A3C50] bg-[#0E1B27] p-4">
        <div className="flex items-center gap-2 mb-3">
          <Brain className="h-4 w-4 text-[#FF8F00]" />
          <p className="text-sm font-semibold text-[#E1F5FE]">AI Reasoning</p>
          {vault.strategy.aiEnabled ? (
            <Badge className="text-[10px] bg-[#FF8F00]/20 text-[#FF8F00] border-[#FF8F00]/30">Active</Badge>
          ) : (
            <Badge className="text-[10px] bg-[#1A3C50] text-[#B0BEC5] border-[#1A3C50]">Disabled</Badge>
          )}
        </div>
        <div className="rounded-lg border border-[#FF8F00]/20 bg-[#081216] p-3">
          <p className="text-sm text-[#E1F5FE] leading-relaxed">
            {vault.strategy.aiEnabled ? currentReasoning : 'AI analysis is disabled. Enable it in Policy settings.'}
          </p>
        </div>
      </div>

      {/* ── Cycle Log ── */}
      <div className="rounded-lg border border-[#1A3C50] bg-[#0E1B27] overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[#1A3C50]">
          <Zap className="h-4 w-4 text-[#00A8B5]" />
          <p className="text-sm font-semibold text-[#E1F5FE]">Cycle Log</p>
          <span className="text-xs text-[#B0BEC5] ml-1">({cycleLogs.length} runs)</span>
        </div>
        {cycleLogs.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-[#B0BEC5]">
            <Bot className="h-8 w-8 opacity-40" />
            <p className="text-sm">No cycles run yet. Activate the agent or run a manual cycle.</p>
          </div>
        ) : (
          <div className="divide-y divide-[#1A3C50] max-h-[420px] overflow-y-auto">
            {cycleLogs.map(log => (
              <div key={log.id} className="px-4 py-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-[#B0BEC5] tabular-nums">
                    {new Date(log.timestamp).toLocaleTimeString([], { hour12: false })}
                  </span>
                  <span className={cn(
                    'text-xs font-mono font-semibold',
                    log.pnl > 0 ? 'text-[#26A69A]' : log.pnl < 0 ? 'text-[#EF5350]' : 'text-[#B0BEC5]'
                  )}>
                    {log.pnl > 0 ? '+' : ''}{log.pnl !== 0 ? log.pnl.toFixed(3) + ' USDC' : log.result}
                  </span>
                </div>
                {/* Market name */}
                {log.market && (
                  <p className="text-[10px] text-[#B0BEC5] mb-1 truncate">{log.market}...</p>
                )}
                {/* Stage badges */}
                <div className="flex flex-wrap gap-1">
                  {log.stages.map((s, i) => (
                    <span key={i} className={cn(
                      'text-[10px] rounded px-1.5 py-0.5',
                      s.includes('✓')
                        ? 'text-[#26A69A] bg-[#26A69A]/10 border border-[#26A69A]/30'
                        : s.includes('✗')
                          ? 'text-[#EF5350] bg-[#EF5350]/10 border border-[#EF5350]/30'
                          : s === 'LIVE'
                            ? 'text-[#00A8B5] bg-[#00A8B5]/10 border border-[#00A8B5]/30'
                            : s === 'SIM'
                              ? 'text-[#FF8F00] bg-[#FF8F00]/10 border border-[#FF8F00]/30'
                              : 'text-[#B0BEC5] bg-[#081216] border border-[#1A3C50]'
                    )}>
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
