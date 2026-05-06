'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { RefreshCw, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { runSingleCycle } from '@/actions/engine'

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

    // Execute real engine step via server action
    const result = await runSingleCycle(vaultId)

    if (result.success) {
      if (result.fills > 0) {
        toast.success(`Fill processed! PnL: ${result.pnl >= 0 ? '+' : ''}${result.pnl.toFixed(3)} USDC`, {
          description: `${result.fills} fill(s) processed`,
        })
      } else {
        toast.info('Cycle complete — no fills this round.')
      }
    } else {
      toast.error(result.error ?? 'Cycle failed')
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
