'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface ExpiryCountdownProps {
  expiry: number
  className?: string
}

function formatMs(ms: number): string {
  if (ms <= 0) return '00:00'
  const totalSec = Math.floor(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

export function ExpiryCountdown({ expiry, className }: ExpiryCountdownProps) {
  const [remaining, setRemaining] = useState(expiry - Date.now())

  useEffect(() => {
    const iv = setInterval(() => {
      setRemaining(expiry - Date.now())
    }, 1000)
    return () => clearInterval(iv)
  }, [expiry])

  const pct = Math.max(0, Math.min(100, (remaining / 300000) * 100))
  const urgent = remaining < 30000

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex items-center justify-between text-xs">
        <span className="text-[#B0BEC5]">Expiry</span>
        <span className={cn(
          'font-mono font-semibold tabular-nums',
          urgent ? 'text-[#FF8F00]' : 'text-[#E1F5FE]',
          urgent && 'animate-pulse'
        )}>
          {remaining <= 0 ? 'EXPIRED' : formatMs(remaining)}
        </span>
      </div>
      <div className="h-1 w-full rounded-full bg-[#1A3C50] overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-1000',
            urgent ? 'bg-[#FF8F00]' : 'bg-[#00A8B5]'
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
