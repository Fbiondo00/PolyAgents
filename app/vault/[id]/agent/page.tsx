'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import { getVaultById, saveVault, addAuditEvent, generateAuditId, updateVaultStats } from '@/lib/store'
import { Vault } from '@/types'
import type { PaymentReceipt } from '@/types'
import { executeAgentPayment, checkHealth } from '@/actions/hedera'
import { ExpiryCountdown } from '@/components/expiry-countdown'
import { CycleButton } from '@/components/cycle-button'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Bot, Pause, Play, Zap, Brain, AlertTriangle, ExternalLink, XCircle, Loader2, Clock, CreditCard } from 'lucide-react'

const AI_REASONING = [
  'Order flow momentum positive. BTC bid/ask spread 0.003. Recommend UP tranche placement.',
  'Volume 18% above 5m average. RSI at 62, not overbought. Placing tranche at mid-1.',
  'Whale wallet detected accumulating. HCS feed shows 3x normal order activity.',
  'Market settling neutral. Spread compressing. Holding — no new entries this cycle.',
  'Realized volatility spike detected. Adjusting tranche size to 8 shares (risk off).',
  'HCS reconciliation confirmed. PnL +0.14 USDC from prior market. Funds reallocated.',
]

interface CycleLog {
  id: string
  timestamp: number
  stages: string[]
  result: string
  pnl: number
  paymentTxId?: string
  paymentHashscan?: string
}

interface HealthData {
  connected: boolean
  balance: string
  accountId: string
}

export default function AgentPage() {
  const params = useParams<{ id: string }>()
  const [vault, setVault] = useState<Vault | null>(null)
  const [running, setRunning] = useState(false)
  const [cycleLogs, setCycleLogs] = useState<CycleLog[]>([])
  const [currentReasoning, setCurrentReasoning] = useState('')
  const [hbarPct, setHbarPct] = useState(84.7)
  const [healthData, setHealthData] = useState<HealthData | null>(null)
  const [paymentLoading, setPaymentLoading] = useState(false)
  const [paymentError, setPaymentError] = useState('')
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    const v = getVaultById(params.id)
    setVault(v)
    if (v) {
      setHbarPct((v.funding.hbar / 1.2) * 100)
      setRunning(v.mode === 'auto')
      setCurrentReasoning(AI_REASONING[0])
      loadHealth()
    }
  }, [params.id])

  async function loadHealth() {
    const result = await checkHealth()
    if (result.success) {
      setHealthData({
        connected: result.connected,
        balance: result.balance,
        accountId: result.accountId,
      })
    }
  }

  async function performCycle(): Promise<{ success: boolean; paymentTxId?: string; paymentHashscan?: string }> {
    if (!vault?.hedera) return { success: false }

    setPaymentLoading(true)
    setPaymentError('')

    const result = await executeAgentPayment({
      vaultId: vault.id,
      topicId: vault.hedera.topicId,
      callContext: 'auto_cycle',
    })

    setPaymentLoading(false)

    if (!result.success || !result.receipt) {
      setPaymentError(result.error ?? 'Payment failed')
      toast.error(`Payment failed: ${result.error}`)
      return { success: false }
    }

    toast.success(`Paid ${result.receipt.amount} for cycle`)
    return {
      success: true,
      paymentTxId: result.receipt.txId,
      paymentHashscan: result.receipt.hashscanUrl,
    }
  }

  useEffect(() => {
    if (!running || !vault) return

    intervalRef.current = setInterval(async () => {
      const reasoning = AI_REASONING[Math.floor(Math.random() * AI_REASONING.length)]
      setCurrentReasoning(reasoning)

      // Real HBAR payment for this cycle
      const paymentResult = await performCycle()

      const filled = Math.random() > 0.5
      const deltaPnl = filled ? Math.round((Math.random() * 0.25 - 0.03) * 1000) / 1000 : 0

      addAuditEvent(vault.id, {
        id: generateAuditId(),
        type: 'ai-analysis',
        timestamp: Date.now(),
        reasoning: paymentResult.success
          ? `${reasoning} [Paid ${paymentResult.paymentTxId?.slice(0, 8)}…]`
          : reasoning,
      })

      if (filled) {
        addAuditEvent(vault.id, {
          id: generateAuditId(),
          type: 'fill',
          timestamp: Date.now(),
          shares: vault.strategy.trancheSize,
          price: vault.strategy.sellPrice,
          pnl: deltaPnl,
        })
        if (deltaPnl > 0) {
          toast.success(`Auto-fill: +${deltaPnl.toFixed(3)} USDC`)
        }
      }

      updateVaultStats(vault.id, deltaPnl)
      setVault(getVaultById(vault.id))

      const stages = [
        paymentResult.success ? 'HBAR payment ✓' : 'HBAR payment ✗',
        `AI: ${reasoning.slice(0, 40)}…`,
        filled ? 'Fill executed' : 'No fill',
      ]

      setCycleLogs(prev => [{
        id: generateAuditId(),
        timestamp: Date.now(),
        stages,
        result: filled ? `+${deltaPnl.toFixed(3)} USDC` : 'No fill',
        pnl: deltaPnl,
        paymentTxId: paymentResult.paymentTxId,
        paymentHashscan: paymentResult.paymentHashscan,
      }, ...prev].slice(0, 20))
    }, 15000)

    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [running, vault])

  function toggleMode() {
    if (!vault) return
    const newMode = vault.mode === 'auto' ? 'advisory' : 'auto'
    const updated = { ...vault, mode: newMode as 'auto' | 'advisory' }
    saveVault(updated)
    setVault(updated)
    setRunning(newMode === 'auto')
    toast.info(`Agent switched to ${newMode} mode`)
  }

  function reload() {
    setVault(getVaultById(params.id))
  }

  if (!vault) return null

  // Vault not deployed on Hedera
  if (!vault.hedera) {
    return (
      <div className="p-4 md:p-6 space-y-5">
        <div>
          <h1 className="font-heading text-xl font-bold text-[#E1F5FE]">Agent Control</h1>
          <p className="text-sm text-[#B0BEC5]">Monitor and control the autonomous trading agent.</p>
        </div>
        <div className="rounded-lg border border-[#EF5350]/40 bg-[#EF5350]/10 p-6 text-center">
          <XCircle className="h-10 w-10 text-[#EF5350] mx-auto mb-3" />
          <p className="text-sm font-semibold text-[#EF5350]">Hedera Not Configured</p>
          <p className="text-xs text-[#B0BEC5] mt-1">This vault was not deployed on Hedera. Agent payments require a Hedera-deployed vault.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-heading text-xl font-bold text-[#E1F5FE]">Agent Control</h1>
          <p className="text-sm text-[#B0BEC5]">Monitor and control the autonomous trading agent.</p>
        </div>
        <div className="flex gap-2">
          <CycleButton vaultId={vault.id} onComplete={reload} className="hidden sm:flex" />
        </div>
      </div>

      {/* Agent Identity — HCS-14 */}
      <div className="rounded-lg border border-[#1A3C50] bg-[#0E1B27] p-4">
        <div className="flex items-center gap-2 mb-3">
          <Bot className="h-4 w-4 text-[#00A8B5]" />
          <p className="text-sm font-semibold text-[#E1F5FE]">HCS-14 Agent Identity</p>
          <Badge className="text-[10px] bg-[#00A8B5]/20 text-[#00A8B5] border-[#00A8B5]/30">On-chain</Badge>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-[#B0BEC5]">UAID</p>
            <p className="font-mono text-[#E1F5FE] mt-0.5 break-all">{vault.hedera.agentUaid}</p>
          </div>
          <div className="flex items-end">
            <a
              href={vault.hedera.agentHashscan}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#00A8B5] hover:text-[#4DD0E1] flex items-center gap-1 text-xs"
            >
              <ExternalLink className="h-3 w-3" />
              View on Hashscan
            </a>
          </div>
        </div>
      </div>

      {/* Agent status */}
      <div className="rounded-lg border border-[#1A3C50] bg-[#0E1B27] p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={cn(
              'flex h-10 w-10 items-center justify-center rounded-full',
              running ? 'bg-[#26A69A]/20 pulse-ring' : 'bg-[#1A3C50]'
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

        {/* Countdown + HBAR gauge */}
        <div className="grid gap-4 sm:grid-cols-2">
          {vault.activeMarket && (
            <div className="rounded-lg border border-[#1A3C50] bg-[#081216] p-3">
              <ExpiryCountdown expiry={vault.activeMarket.expiry} />
              <p className="text-xs text-[#B0BEC5] mt-2">Market: <span className="font-mono text-[#E1F5FE]">{vault.activeMarket.id}</span></p>
            </div>
          )}
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
      </div>

      {/* Payment error */}
      {paymentError && (
        <div className="rounded-lg border border-[#EF5350]/40 bg-[#EF5350]/10 p-4">
          <p className="text-sm font-semibold text-[#EF5350]">Payment Error</p>
          <p className="text-xs text-[#B0BEC5] mt-1">{paymentError}</p>
        </div>
      )}

      {/* AI Panel */}
      <div className="rounded-lg border border-[#1A3C50] bg-[#0E1B27] p-4">
        <div className="flex items-center gap-2 mb-3">
          <Brain className="h-4 w-4 text-[#FF8F00]" />
          <p className="text-sm font-semibold text-[#E1F5FE]">AI Reasoning</p>
          {vault.strategy.aiEnabled ? (
            <Badge className="text-[10px] bg-[#FF8F00]/20 text-[#FF8F00] border-[#FF8F00]/30">Active</Badge>
          ) : (
            <Badge className="text-[10px] bg-[#1A3C50] text-[#B0BEC5] border-[#1A3C50]">Disabled</Badge>
          )}
          {paymentLoading && <Loader2 className="h-3 w-3 animate-spin text-[#00A8B5]" />}
        </div>
        <div className="rounded-lg border border-[#FF8F00]/20 bg-[#081216] p-3">
          <p className="text-sm text-[#E1F5FE] leading-relaxed">
            {vault.strategy.aiEnabled ? currentReasoning : 'AI analysis is disabled. Enable it in Policy settings.'}
          </p>
        </div>
      </div>

      {/* Hedera Integration Status */}
      <div className="rounded-lg border border-[#1A3C50] bg-[#0E1B27] p-4">
        <div className="flex items-center gap-2 mb-3">
          <CreditCard className="h-4 w-4 text-[#00A8B5]" />
          <p className="text-sm font-semibold text-[#E1F5FE]">Autonomous Payments</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="rounded-lg bg-[#081216] border border-[#1A3C50] p-3">
            <p className="text-[#B0BEC5]">Cost per Cycle</p>
            <p className="text-lg font-mono font-bold text-[#E1F5FE]">0.001 ℏ</p>
          </div>
          <div className="rounded-lg bg-[#081216] border border-[#1A3C50] p-3">
            <p className="text-[#B0BEC5]">Total Cycles</p>
            <p className="text-lg font-mono font-bold text-[#E1F5FE]">{vault.stats.cycles}</p>
          </div>
          <div className="rounded-lg bg-[#081216] border border-[#1A3C50] p-3">
            <p className="text-[#B0BEC5]">Account</p>
            <p className="text-sm font-mono text-[#E1F5FE]">{healthData?.accountId ?? '—'}</p>
            <p className="text-[10px] text-[#B0BEC5] mt-0.5">Balance: {healthData?.balance ?? '—'}</p>
          </div>
        </div>
      </div>

      {/* Scheduled Transaction */}
      <div className="rounded-lg border border-[#1A3C50] bg-[#0E1B27] p-4">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="h-4 w-4 text-[#00A8B5]" />
          <p className="text-sm font-semibold text-[#E1F5FE]">Scheduled Transaction</p>
          <Badge className="text-[10px] bg-[#00A8B5]/20 text-[#00A8B5] border-[#00A8B5]/30">Hedera</Badge>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-[#B0BEC5]">Schedule ID</p>
            <p className="font-mono text-[#E1F5FE] mt-0.5">{vault.hedera.scheduleId}</p>
          </div>
          <div className="flex items-end">
            <a
              href={vault.hedera.scheduleHashscan}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#00A8B5] hover:text-[#4DD0E1] flex items-center gap-1 text-xs"
            >
              <ExternalLink className="h-3 w-3" />
              View on Hashscan
            </a>
          </div>
        </div>
      </div>

      {/* Cycle log */}
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
          <div className="divide-y divide-[#1A3C50] max-h-80 overflow-y-auto">
            {cycleLogs.map(log => (
              <div key={log.id} className="px-4 py-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-[#B0BEC5] tabular-nums">
                    {new Date(log.timestamp).toLocaleTimeString([], { hour12: false })}
                  </span>
                  <div className="flex items-center gap-2">
                    {log.paymentHashscan && (
                      <a
                        href={log.paymentHashscan}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-[#00A8B5] hover:text-[#4DD0E1] flex items-center gap-0.5"
                      >
                        <CreditCard className="h-2.5 w-2.5" />
                        tx
                      </a>
                    )}
                    <span className={cn(
                      'text-xs font-mono font-semibold',
                      log.pnl > 0 ? 'text-[#26A69A]' : log.pnl < 0 ? 'text-[#EF5350]' : 'text-[#B0BEC5]'
                    )}>
                      {log.pnl > 0 ? '+' : ''}{log.pnl !== 0 ? log.pnl.toFixed(3) + ' USDC' : log.result}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {log.stages.map((s, i) => (
                    <span key={i} className={cn(
                      'text-[10px] rounded px-1.5 py-0.5',
                      s.includes('✓')
                        ? 'text-[#26A69A] bg-[#26A69A]/10 border border-[#26A69A]/30'
                        : s.includes('✗')
                          ? 'text-[#EF5350] bg-[#EF5350]/10 border border-[#EF5350]/30'
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
