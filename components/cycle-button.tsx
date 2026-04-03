'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { RefreshCw, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { addAuditEvent, generateAuditId, updateVaultStats } from '@/lib/store'

interface CycleButtonProps {
  vaultId: string
  onComplete?: () => void
  className?: string
}

const STAGES = [
  { label: 'Fetching token gate…', duration: 2000 },
  { label: 'Checking HBAR balance…', duration: 1000 },
  { label: 'Running AI analysis…', duration: 1000 },
  { label: 'Placing CLOB orders…', duration: 1000 },
]

export function CycleButton({ vaultId, onComplete, className }: CycleButtonProps) {
  const [running, setRunning] = useState(false)
  const [stage, setStage] = useState(0)
  const [done, setDone] = useState(false)

  async function runCycle() {
    if (running) return
    setRunning(true)
    setDone(false)
    setStage(0)

    for (let i = 0; i < STAGES.length; i++) {
      setStage(i)
      await new Promise(r => setTimeout(r, STAGES[i].duration))
    }

    // Mock fill probability
    const filled = Math.random() > 0.4
    const deltaPnl = filled ? Math.round((Math.random() * 0.3 - 0.05) * 100) / 100 : 0

    addAuditEvent(vaultId, {
      id: generateAuditId(),
      type: 'ai-analysis',
      timestamp: Date.now(),
      marketId: `btc-5m-${Math.floor(Math.random() * 99)}`,
      reasoning: 'Automated cycle: RSI divergence detected. Placed UP tranche at spread.',
    })

    addAuditEvent(vaultId, {
      id: generateAuditId(),
      type: 'bid-placed',
      timestamp: Date.now(),
      marketId: `btc-5m-${Math.floor(Math.random() * 99)}`,
      shares: 15,
      price: 0.01,
    })

    if (filled) {
      addAuditEvent(vaultId, {
        id: generateAuditId(),
        type: 'fill',
        timestamp: Date.now(),
        shares: 15,
        price: 0.02,
        pnl: deltaPnl,
      })
      toast.success(`Fill! +${deltaPnl.toFixed(2)} USDC`, {
        description: 'Bid filled and sell order placed.',
      })
    } else {
      toast.info('Cycle complete — no fills this round.')
    }

    updateVaultStats(vaultId, deltaPnl)
    setDone(true)
    setRunning(false)
    onComplete?.()

    setTimeout(() => setDone(false), 3000)
  }

  return (
    <Button
      onClick={runCycle}
      disabled={running}
      className={cn(
        'relative gap-2 transition-all',
        done
          ? 'bg-[#26A69A] hover:bg-[#26A69A] text-[#081216]'
          : 'bg-[#00A8B5] hover:bg-[#4DD0E1] text-[#081216]',
        className
      )}
    >
      {running ? (
        <>
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span className="text-sm">{STAGES[stage]?.label}</span>
        </>
      ) : done ? (
        <>
          <CheckCircle2 className="h-4 w-4" />
          Cycle Done
        </>
      ) : (
        <>
          <RefreshCw className="h-4 w-4" />
          Run Cycle
        </>
      )}
    </Button>
  )
}
