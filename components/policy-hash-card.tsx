'use client'

import { useState } from 'react'
import { Copy, CheckCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface PolicyHashCardProps {
  hash: string
  className?: string
}

export function PolicyHashCard({ hash, className }: PolicyHashCardProps) {
  const [copied, setCopied] = useState(false)

  function copyHash() {
    navigator.clipboard.writeText(hash).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={cn(
      'rounded-lg border border-[#1A3C50] bg-[#081216] p-4',
      className
    )}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-[#B0BEC5]">Policy Hash</p>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-[#B0BEC5] hover:text-[#00A8B5]"
          onClick={copyHash}
        >
          {copied ? <CheckCheck className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </Button>
      </div>
      <p className="font-mono text-xs text-[#00A8B5] break-all leading-relaxed">{hash}</p>
    </div>
  )
}
