'use client'

import { cn } from '@/lib/utils'
import { Vault } from '@/lib/types'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  TrendingUp,
  Shield,
  FileText,
  Bot,
  Coins,
  ChevronLeft,
} from 'lucide-react'

interface StatusRailProps {
  vault: Vault
}

export function StatusRail({ vault }: StatusRailProps) {
  const pathname = usePathname()

  const navItems = [
    { href: `/vault/${vault.id}`, icon: LayoutDashboard, label: 'Dashboard' },
    { href: `/vault/${vault.id}/markets`, icon: TrendingUp, label: 'Markets' },
    { href: `/vault/${vault.id}/policy`, icon: Shield, label: 'Policy' },
    { href: `/vault/${vault.id}/audit`, icon: FileText, label: 'Audit' },
    { href: `/vault/${vault.id}/agent`, icon: Bot, label: 'Agent' },
    { href: `/vault/${vault.id}/token`, icon: Coins, label: 'Token' },
  ]

  return (
    <aside className="hidden md:flex flex-col w-56 min-h-screen border-r border-[#1A3C50] bg-[#0E1B27] sticky top-0">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-[#1A3C50]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-VlVMoEHHdkmyfUe5dLKTvdGHkcEXao.png"
          alt="PolyAgents"
          className="h-8 w-8 object-contain"
        />
        <span className="font-heading font-bold text-[#E1F5FE] text-sm leading-tight">
          PolyAgents
        </span>
      </div>

      {/* Vault info */}
      <div className="px-4 py-3 border-b border-[#1A3C50]">
        <Link href="/" className="flex items-center gap-1 text-xs text-[#B0BEC5] hover:text-[#00A8B5] mb-2 transition-colors">
          <ChevronLeft className="h-3 w-3" />
          All Vaults
        </Link>
        <p className="text-xs text-[#B0BEC5]">Active Vault</p>
        <p className="text-sm font-semibold text-[#E1F5FE] truncate">{vault.name}</p>
        <div className="mt-1 flex items-center gap-2">
          <span className={cn(
            'inline-flex h-1.5 w-1.5 rounded-full',
            vault.mode === 'auto' ? 'bg-[#26A69A]' : 'bg-[#FF8F00]'
          )} />
          <span className="text-xs text-[#B0BEC5] capitalize">{vault.mode}</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5 p-2 flex-1">
        {navItems.map(({ href, icon: Icon, label }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-all',
                active
                  ? 'bg-[#00A8B5]/15 text-[#00A8B5] glow-teal-sm'
                  : 'text-[#B0BEC5] hover:bg-[#1A3C50] hover:text-[#E1F5FE]'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Stats footer */}
      <div className="p-4 border-t border-[#1A3C50]">
        <div className="flex justify-between text-xs">
          <span className="text-[#B0BEC5]">PnL</span>
          <span className={cn(
            'font-mono font-semibold',
            vault.stats.pnl >= 0 ? 'text-[#26A69A]' : 'text-[#EF5350]'
          )}>
            {vault.stats.pnl >= 0 ? '+' : ''}{vault.stats.pnl.toFixed(2)} USDC
          </span>
        </div>
        <div className="flex justify-between text-xs mt-1">
          <span className="text-[#B0BEC5]">Cycles</span>
          <span className="font-mono text-[#E1F5FE]">{vault.stats.cycles}</span>
        </div>
      </div>
    </aside>
  )
}
