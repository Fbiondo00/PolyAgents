'use client'

import { Vault } from '@/lib/types'
import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown } from 'lucide-react'

interface InventoryCardProps {
  vault: Vault
  className?: string
}

export function InventoryCard({ vault, className }: InventoryCardProps) {
  const { upShares, downShares } = vault.inventory
  const total = upShares + downShares
  const upPct = total > 0 ? (upShares / total) * 100 : 50

  return (
    <div className={cn('rounded-lg border border-[#1A3C50] bg-[#0E1B27] p-4', className)}>
      <p className="text-xs text-[#B0BEC5] mb-3">Inventory</p>

      {/* Bar */}
      <div className="flex h-2 rounded-full overflow-hidden mb-3">
        <div
          className="bg-[#26A69A] transition-all duration-500"
          style={{ width: `${upPct}%` }}
        />
        <div
          className="bg-[#EF5350] flex-1 transition-all duration-500"
        />
      </div>

      <div className="flex justify-between gap-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-[#26A69A]" />
          <div>
            <p className="text-xs text-[#B0BEC5]">UP</p>
            <p className="text-lg font-mono font-bold text-[#26A69A]">{upShares}</p>
          </div>
        </div>
        <div className="text-center">
          <p className="text-xs text-[#B0BEC5]">Total</p>
          <p className="text-lg font-mono font-bold text-[#E1F5FE]">{total}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <p className="text-xs text-[#B0BEC5]">DOWN</p>
            <p className="text-lg font-mono font-bold text-[#EF5350]">{downShares}</p>
          </div>
          <TrendingDown className="h-4 w-4 text-[#EF5350]" />
        </div>
      </div>
    </div>
  )
}
