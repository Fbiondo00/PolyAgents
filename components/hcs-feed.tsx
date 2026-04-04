'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { cn } from '@/lib/utils'
import type { Vault } from '@/types/vault'
import { RefreshCw, Wifi, WifiOff, Loader2 } from 'lucide-react'

// ── Types ──

interface FeedMessage {
  id: string
  timestamp: string
  type: string
  payload: string
  sequenceNumber: number
}

const TYPE_COLORS: Record<string, string> = {
  VAULT_INITIALIZED: '#FF8F00',
  TOKEN_CREATED: '#00A8B5',
  TOKEN_MINTED: '#4DD0E1',
  SHARES_TRANSFERRED: '#80DEEA',
  AUDIT_LOG: '#B0BEC5',
  PAYMENT_MADE: '#26A69A',
  SCHEDULE_CREATED: '#CE93D8',
  AGENT_REGISTERED: '#00A8B5',
  ERROR: '#EF5350',
  order: '#00A8B5',
  fill: '#26A69A',
  settle: '#4DD0E1',
  bid_placed: '#00A8B5',
  ai_analysis: '#FF8F00',
}

// ── Props ──

interface HCSFeedProps {
  vault: Vault
}

// ── Mirror Node direct fetch (client-side) ──

const MIRROR_NODE_BASE = 'https://testnet.mirrornode.hedera.com/api/v1'

async function fetchHCSMessages(topicId: string, limit = 30): Promise<FeedMessage[]> {
  const res = await fetch(
    `${MIRROR_NODE_BASE}/topics/${topicId}/messages?limit=${limit}&order=desc`
  )
  if (!res.ok) throw new Error(`Mirror Node ${res.status}`)

  const data = await res.json()
  const raw = data.messages ?? []

  return raw.map((msg: { sequence_number: number; consensus_timestamp: string; message: string }) => {
    let type = 'AUDIT_LOG'
    let payload = ''

    try {
      const decoded = atob(msg.message)
      const parsed = JSON.parse(decoded)
      type = parsed.event || 'AUDIT_LOG'
      // Build a human-readable payload from the parsed fields
      const parts: string[] = []
      if (parsed.vault_id) parts.push(`vault:${String(parsed.vault_id).slice(0, 8)}`)
      if (parsed.token_id) parts.push(`token:${parsed.token_id.slice(0, 8)}...`)
      if (parsed.shares) parts.push(`${parsed.shares} shares`)
      if (parsed.reasoning) parts.push(parsed.reasoning)
      if (parsed.pnl !== undefined) parts.push(`pnl:${parsed.pnl >= 0 ? '+' : ''}${parsed.pnl}`)
      if (parsed.amount) parts.push(`${parsed.amount} HBAR`)
      if (parsed.memo) parts.push(parsed.memo)
      payload = parts.join(' | ') || decoded.slice(0, 80)
    } catch {
      try {
        payload = atob(msg.message).slice(0, 80)
      } catch {
        payload = '(binary message)'
      }
    }

    return {
      id: `${topicId}-${msg.sequence_number}`,
      timestamp: msg.consensus_timestamp,
      type,
      payload,
      sequenceNumber: msg.sequence_number,
    }
  })
}

// ── Component ──

export function HCSFeed({ vault }: HCSFeedProps) {
  const topicId = vault.hedera?.topicId
  const [messages, setMessages] = useState<FeedMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastFetch, setLastFetch] = useState<number>(0)
  const [connected, setConnected] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval>>(null)

  const loadMessages = useCallback(async () => {
    if (!topicId) return

    try {
      setLoading(true)
      setError('')
      const msgs = await fetchHCSMessages(topicId)
      setMessages(msgs)
      setConnected(true)
      setLastFetch(Date.now())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch')
      setConnected(false)
    } finally {
      setLoading(false)
    }
  }, [topicId])

  useEffect(() => {
    if (!topicId) return

    // Initial fetch
    loadMessages()

    // Poll every 8 seconds for new messages
    intervalRef.current = setInterval(loadMessages, 8000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [topicId, loadMessages])

  // ── No Hedera context (demo vault without real deploy) ──

  if (!topicId) {
    return (
      <div className="rounded-lg border border-[#1A3C50] bg-[#0E1B27] overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-[#1A3C50]">
          <WifiOff className="h-3 w-3 text-[#B0BEC5]" />
          <span className="text-xs text-[#B0BEC5]">HCS Live Feed</span>
          <span className="text-[10px] text-[#B0BEC5] ml-auto">No topic — deploy a vault to enable</span>
        </div>
        <div className="px-4 py-6 text-center text-xs text-[#B0BEC5]">
          HCS audit feed will appear here after vault deployment on Hedera.
        </div>
      </div>
    )
  }

  function formatTimestamp(ts: string): string {
    try {
      // Mirror Node timestamps: "2026-04-05T12:34:56.123456789Z"
      const d = new Date(ts)
      if (isNaN(d.getTime())) return ts
      return d.toLocaleTimeString([], { hour12: false })
    } catch {
      return ts
    }
  }

  return (
    <div className="rounded-lg border border-[#1A3C50] bg-[#0E1B27] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[#1A3C50]">
        {connected ? (
          <span className="h-2 w-2 rounded-full bg-[#26A69A] animate-pulse" />
        ) : (
          <WifiOff className="h-3 w-3 text-[#EF5350]" />
        )}
        <span className="text-xs text-[#B0BEC5]">HCS Live Feed</span>
        {topicId && (
          <a
            href={`https://hashscan.io/testnet/topic/${topicId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-mono text-[#00A8B5] hover:text-[#4DD0E1] truncate ml-1"
          >
            {topicId}
          </a>
        )}
        <button
          onClick={loadMessages}
          disabled={loading}
          className="ml-auto text-[#B0BEC5] hover:text-[#00A8B5] transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-2 text-[10px] text-[#EF5350] border-b border-[#1A3C50]">
          {error}
        </div>
      )}

      {/* Messages */}
      <div className="divide-y divide-[#1A3C50] max-h-48 overflow-y-auto">
        {loading && messages.length === 0 ? (
          <div className="flex items-center justify-center gap-2 px-4 py-6 text-xs text-[#B0BEC5]">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading from Hedera Mirror Node…
          </div>
        ) : messages.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-[#B0BEC5]">
            No messages yet on this HCS topic.
          </div>
        ) : (
          messages.map(msg => {
            const color = TYPE_COLORS[msg.type] || '#B0BEC5'
            return (
              <div key={msg.id} className="flex items-center gap-3 px-4 py-2">
                <span
                  className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-mono uppercase font-semibold"
                  style={{ color, border: `1px solid ${color}33`, background: `${color}11` }}
                >
                  {msg.type.replace(/_/g, ' ')}
                </span>
                <span className="flex-1 text-xs font-mono text-[#E1F5FE] truncate" title={msg.payload}>
                  {msg.payload}
                </span>
                <span className="text-[10px] text-[#B0BEC5] tabular-nums shrink-0">
                  {formatTimestamp(msg.timestamp)}
                </span>
              </div>
            )
          })
        )}
      </div>

      {/* Footer */}
      {lastFetch > 0 && (
        <div className="px-4 py-1 border-t border-[#1A3C50] text-[10px] text-[#B0BEC5]">
          {messages.length} messages · polling every 8s
        </div>
      )}
    </div>
  )
}
