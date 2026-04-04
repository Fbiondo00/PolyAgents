'use client'

import { usePrivy, useWallets } from '@privy-io/react-auth'
import { Button } from '@/components/ui/button'
import { Wallet, Loader2, LogOut } from 'lucide-react'

function shortAddr(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function PrivyLoginButton() {
  const { ready, authenticated, login, logout } = usePrivy()
  const { wallets } = useWallets()

  if (!ready) {
    return (
      <Button size="sm" disabled className="gap-1.5 border border-[#1A3C50] bg-[#0E1B27] text-[#B0BEC5]">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading
      </Button>
    )
  }

  if (authenticated && wallets.length > 0) {
    const address = wallets[0].address
    return (
      <div className="flex items-center gap-2">
        <div className="hidden sm:flex items-center gap-1.5 rounded-md border border-[#26A69A]/40 bg-[#26A69A]/10 px-2.5 py-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-[#26A69A]" />
          <span className="text-xs font-mono text-[#E1F5FE]">{shortAddr(address)}</span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => logout()}
          className="text-[#B0BEC5] hover:text-[#EF5350] gap-1 h-8 w-8 p-0"
        >
          <LogOut className="h-3.5 w-3.5" />
        </Button>
      </div>
    )
  }

  return (
    <Button
      size="sm"
      onClick={login}
      className="border border-[#1A3C50] bg-[#0E1B27] text-[#E1F5FE] hover:bg-[#1A3C50] hover:text-[#4DD0E1] font-semibold gap-1.5"
    >
      <Wallet className="h-3.5 w-3.5" />
      Login
    </Button>
  )
}
