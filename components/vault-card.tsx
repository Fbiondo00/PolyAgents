'use client'

import Link from 'next/link'
import { Vault } from '@/types'
import { PnLSparkline } from '@/components/pnl-sparkline'
import { ChevronRight } from 'lucide-react'

interface VaultCardProps {
  vault: Vault
}

export function VaultCard({ vault }: VaultCardProps) {
  return (
    <Link href={`/vault/${vault.id}`}>
      <div className="group rounded-lg border border-[#1A3C50] bg-[#0E1B27] p-4 hover:border-[#00A8B5]/50 hover:bg-[#0E1B27] transition-all cursor-pointer">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="font-semibold text-[#E1F5FE] group-hover:text-[#00A8B5] transition-colors">
              {vault.name}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span className={`h-1.5 w-1.5 rounded-full ${vault.mode === 'auto' ? 'bg-[#26A69A]' : 'bg-[#FF8F00]'}`} />
              <span className="text-xs text-[#B0BEC5] capitalize">{vault.mode}</span>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-[#B0BEC5] group-hover:text-[#00A8B5] transition-colors" />
        </div>
        <div className="h-12 mb-3">
          <PnLSparkline data={vault.sparkline ?? [vault.stats.pnl]} />
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <p className="text-[#B0BEC5]">PnL</p>
            <p className={`font-mono font-semibold ${vault.stats.pnl >= 0 ? 'text-[#26A69A]' : 'text-[#EF5350]'}`}>
              {vault.stats.pnl >= 0 ? '+' : ''}{vault.stats.pnl.toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-[#B0BEC5]">Flips</p>
            <p className="font-mono font-semibold text-[#E1F5FE]">{vault.stats.flips}</p>
          </div>
          <div>
            <p className="text-[#B0BEC5]">Cycles</p>
            <p className="font-mono font-semibold text-[#E1F5FE]">{vault.stats.cycles}</p>
          </div>
        </div>
      </div>
    </Link>
  )
}
