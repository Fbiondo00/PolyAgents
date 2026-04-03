'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface HCSMessage {
  id: string
  timestamp: number
  type: 'order' | 'fill' | 'settle'
  payload: string
}

function mockMessage(): HCSMessage {
  const types: HCSMessage['type'][] = ['order', 'fill', 'settle']
  const type = types[Math.floor(Math.random() * types.length)]
  const payloads = {
    order: `BID 0.0${Math.floor(Math.random() * 9)}1 × ${Math.floor(Math.random() * 50 + 5)}`,
    fill: `FILL @0.0${Math.floor(Math.random() * 9)}2 pnl+${(Math.random() * 0.2).toFixed(3)}`,
    settle: `SETTLE mkt-${Math.floor(Math.random() * 100)} resolved`,
  }
  return {
    id: Math.random().toString(36).slice(2),
    timestamp: Date.now(),
    type,
    payload: payloads[type],
  }
}

const typeColors: Record<HCSMessage['type'], string> = {
  order: '#00A8B5',
  fill: '#26A69A',
  settle: '#4DD0E1',
}

export function HCSFeed() {
  const [messages, setMessages] = useState<HCSMessage[]>([])

  useEffect(() => {
    // Seed initial
    setMessages(Array.from({ length: 5 }, mockMessage))
    const iv = setInterval(() => {
      setMessages(prev => [mockMessage(), ...prev].slice(0, 20))
    }, 2000 + Math.random() * 3000)
    return () => clearInterval(iv)
  }, [])

  return (
    <div className="rounded-lg border border-[#1A3C50] bg-[#0E1B27] overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[#1A3C50]">
        <span className="h-2 w-2 rounded-full bg-[#26A69A] animate-pulse" />
        <span className="text-xs text-[#B0BEC5]">HCS Live Feed</span>
      </div>
      <div className="divide-y divide-[#1A3C50] max-h-48 overflow-y-auto">
        {messages.map(msg => (
          <div key={msg.id} className="flex items-center gap-3 px-4 py-2">
            <span
              className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-mono uppercase font-semibold"
              style={{ color: typeColors[msg.type], border: `1px solid ${typeColors[msg.type]}33`, background: `${typeColors[msg.type]}11` }}
            >
              {msg.type}
            </span>
            <span className="flex-1 text-xs font-mono text-[#E1F5FE] truncate">{msg.payload}</span>
            <span className="text-[10px] text-[#B0BEC5] tabular-nums">
              {new Date(msg.timestamp).toLocaleTimeString([], { hour12: false })}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
