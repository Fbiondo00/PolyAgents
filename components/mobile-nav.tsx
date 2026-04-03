'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Plus, TrendingUp, Bot, Shield, FileText, Coins } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MobileNavProps {
  vaultId?: string
}

export function MobileNav({ vaultId }: MobileNavProps) {
  const pathname = usePathname()

  const items = vaultId
    ? [
        { href: `/vault/${vaultId}`, icon: Home, label: 'Dash' },
        { href: `/vault/${vaultId}/markets`, icon: TrendingUp, label: 'Markets' },
        { href: `/vault/${vaultId}/agent`, icon: Bot, label: 'Agent' },
        { href: `/vault/${vaultId}/audit`, icon: FileText, label: 'Audit' },
        { href: `/vault/${vaultId}/policy`, icon: Shield, label: 'Policy' },
        { href: `/vault/${vaultId}/token`, icon: Coins, label: 'Token' },
      ]
    : [
        { href: '/', icon: Home, label: 'Home' },
        { href: '/vault/create', icon: Plus, label: 'Create' },
      ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-center justify-around border-t border-[#1A3C50] bg-[#0E1B27] md:hidden safe-area-inset-bottom">
      {items.map(({ href, icon: Icon, label }) => {
        const active = pathname === href
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex flex-col items-center gap-1 px-3 py-2 text-xs transition-colors min-w-[56px]',
              active ? 'text-[#00A8B5]' : 'text-[#B0BEC5] hover:text-[#E1F5FE]'
            )}
          >
            <Icon className={cn('h-5 w-5 transition-all', active && 'scale-110')} />
            <span className="font-medium">{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
