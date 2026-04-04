'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { RefreshCw, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { getOrCreateEngine } from '@/lib/engine/strategy/engine'
import { getMarketState, getEngineRun, addEngineAuditEvent } from '@/lib/engine/repositories'

interface CycleButtonProps {
  vaultId: string
  onComplete?: () => void
  className?: string
}

const STAGES = [
  { label: 'Discovering market…', duration: 800 },
  { label: 'Checking fills…', duration: 400 },
  { label: 'Placing orders…', duration: 400 },
  { label: 'Updating ledger…', duration: 400 },
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

    // Visual stages with progress
    for (let i = 0; i < STAGES.length; i++) {
      setStage(i)
      await new Promise(r => setTimeout(r, STAGES[i].duration))
    }

    // Execute real engine step
    const engine = getOrCreateEngine(vaultId)
    await engine.step(vaultId)

    const state = getMarketState(vaultId)
    const hasFills = state
      ? (state.sides.YES.filledBuyQty + state.sides.YES.filledSellQty +
         state.sides.NO.filledBuyQty + state.sides.NO.filledSellQty) > 0
      : false

    if (hasFills) {
      const totalPnl = state
        ? state.sides.YES.realizedPnl + state.sides.NO.realizedPnl
        : 0
      toast.success(`Fill processed! PnL: ${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(3)} USDC`, {
        description: `YES: ${state?.sides.YES.unsoldInventory.toFixed(1) ?? '0'} inv | NO: ${state?.sides.NO.unsoldInventory.toFixed(1) ?? '0'} inv`,
      })
    } else {
      toast.info('Cycle complete — no fills this round.')
    }

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
