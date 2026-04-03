'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { StatusRail } from '@/components/status-rail'
import { MobileNav } from '@/components/mobile-nav'
import { getVaultById } from '@/lib/store'
import { Vault } from '@/lib/types'

export default function VaultLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ id: string }>()
  const [vault, setVault] = useState<Vault | null>(null)

  useEffect(() => {
    setVault(getVaultById(params.id))
    // Re-read on focus to pick up any changes
    const onFocus = () => setVault(getVaultById(params.id))
    window.addEventListener('focus', onFocus)
    // Poll every 5s so sidebar stats stay fresh after cycles
    const poll = setInterval(() => setVault(getVaultById(params.id)), 5000)
    return () => {
      window.removeEventListener('focus', onFocus)
      clearInterval(poll)
    }
  }, [params.id])

  if (!vault) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#081216]">
        <div className="space-y-2 text-center">
          <div className="h-10 w-10 rounded-full border-2 border-[#00A8B5] border-t-transparent animate-spin mx-auto" />
          <p className="text-sm text-[#B0BEC5]">Loading vault…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-[#081216]">
      <StatusRail vault={vault} />
      <main className="flex-1 pb-20 md:pb-0 overflow-auto">
        {children}
      </main>
      <MobileNav vaultId={vault.id} />
    </div>
  )
}
