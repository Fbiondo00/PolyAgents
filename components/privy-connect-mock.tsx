'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Wallet, CheckCircle2, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PrivyConnectMockProps {
  onConnected?: (address: string) => void
  className?: string
}

function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

export function PrivyConnectMock({ onConnected, className }: PrivyConnectMockProps) {
  const [state, setState] = useState<'idle' | 'connecting' | 'connected'>('idle')
  const [address, setAddress] = useState('')

  async function connect() {
    setState('connecting')
    await new Promise(r => setTimeout(r, 1500))
    const mockAddr = '0x' + Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
    setAddress(mockAddr)
    setState('connected')
    onConnected?.(mockAddr)
  }

  if (state === 'connected') {
    return (
      <div className={cn(
        'flex items-center gap-3 rounded-lg border border-[#26A69A]/40 bg-[#26A69A]/10 px-4 py-3',
        className
      )}>
        <CheckCircle2 className="h-4 w-4 text-[#26A69A]" />
        <div>
          <p className="text-xs text-[#B0BEC5]">Wallet Connected</p>
          <p className="text-sm font-mono text-[#E1F5FE]">{shortAddr(address)}</p>
        </div>
      </div>
    )
  }

  return (
    <Button
      onClick={connect}
      disabled={state === 'connecting'}
      className={cn(
        'bg-[#00A8B5] hover:bg-[#4DD0E1] text-[#081216] font-semibold gap-2',
        className
      )}
    >
      {state === 'connecting' ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Connecting…
        </>
      ) : (
        <>
          <Wallet className="h-4 w-4" />
          Connect Wallet
        </>
      )}
    </Button>
  )
}
