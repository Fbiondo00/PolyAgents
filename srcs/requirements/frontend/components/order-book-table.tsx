'use client'

import { useMemo } from 'react'

interface OrderLevel {
  price: number
  size: number
  total: number
}

interface OrderBookTableProps {
  midPrice: number
}

function generateLevels(mid: number, side: 'ask' | 'bid', count = 5): OrderLevel[] {
  const levels: OrderLevel[] = []
  let running = 0
  for (let i = 0; i < count; i++) {
    const offset = (i + 1) * 0.003
    const price = side === 'ask' ? mid + offset : mid - offset
    const size = Math.round(Math.random() * 80 + 20)
    running += size
    levels.push({ price: Math.max(0.001, Math.min(0.999, price)), size, total: running })
  }
  return levels
}

export function OrderBookTable({ midPrice }: OrderBookTableProps) {
  const asks = useMemo(() => generateLevels(midPrice, 'ask'), [midPrice])
  const bids = useMemo(() => generateLevels(midPrice, 'bid'), [midPrice])
  const maxTotal = Math.max(...asks.map(a => a.total), ...bids.map(b => b.total))

  return (
    <div className="rounded-lg border border-[#1A3C50] bg-[#0E1B27] overflow-hidden">
      <div className="grid grid-cols-3 px-4 py-2 text-xs text-[#B0BEC5] border-b border-[#1A3C50]">
        <span>Price</span>
        <span className="text-center">Size</span>
        <span className="text-right">Total</span>
      </div>

      {/* Asks */}
      <div className="flex flex-col-reverse">
        {asks.map((level, i) => (
          <div key={i} className="relative grid grid-cols-3 px-4 py-1.5 text-xs hover:bg-[#1A3C50]/30">
            <div
              className="absolute inset-y-0 right-0 bg-[#EF5350]/10"
              style={{ width: `${(level.total / maxTotal) * 100}%` }}
            />
            <span className="relative font-mono text-[#EF5350]">{level.price.toFixed(3)}</span>
            <span className="relative font-mono text-[#E1F5FE] text-center">{level.size}</span>
            <span className="relative font-mono text-[#B0BEC5] text-right">{level.total}</span>
          </div>
        ))}
      </div>

      {/* Spread */}
      <div className="grid grid-cols-3 px-4 py-2 border-y border-[#1A3C50] bg-[#081216]">
        <span className="col-span-3 text-center text-sm font-mono font-bold text-[#00A8B5]">
          {midPrice.toFixed(3)}
          <span className="ml-2 text-xs text-[#B0BEC5] font-normal">Mid</span>
        </span>
      </div>

      {/* Bids */}
      <div className="flex flex-col">
        {bids.map((level, i) => (
          <div key={i} className="relative grid grid-cols-3 px-4 py-1.5 text-xs hover:bg-[#1A3C50]/30">
            <div
              className="absolute inset-y-0 right-0 bg-[#26A69A]/10"
              style={{ width: `${(level.total / maxTotal) * 100}%` }}
            />
            <span className="relative font-mono text-[#26A69A]">{level.price.toFixed(3)}</span>
            <span className="relative font-mono text-[#E1F5FE] text-center">{level.size}</span>
            <span className="relative font-mono text-[#B0BEC5] text-right">{level.total}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
