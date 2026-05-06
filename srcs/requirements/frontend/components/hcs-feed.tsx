'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { fetchAuditLogs } from '@/actions/hedera'
import { RefreshCw } from 'lucide-react'

interface LogEntry {
  id: string
  timestamp: string
  event: string
  message: string
  sequenceNumber: string
}

const EVENT_COLORS: Record<string, string> = {
  TOKEN_CREATED: '#00A8B5',
  TOKEN_MINTED: '#4DD0E1',
  VAULT_INITIALIZED: '#26A69A',
  AGENT_REGISTERED: '#FF8F00',
  SCHEDULE_CREATED: '#B0BEC5',
  PAYMENT_MADE: '#00A8B5',
  AUDIT_LOG: '#26A69A',
  TRADE_EXECUTED: '#4DD0E1',
  TRADE_ANALYZED: '#FF8F00',
  ERROR: '#EF5350',
}

function getEventColor(event: string): string {
  return EVENT_COLORS[event] ?? '#B0BEC5'
}

function formatPayload(log: LogEntry): string {
  try {
    const parsed = JSON.parse(log.message)
    // Build a human-readable summary from the HCS payload
    const parts: string[] = []
    if (parsed.vault_id) parts.push(parsed.vault_id)
    if (parsed.amount_hbar) parts.push(`${parsed.amount_hbar} ℏ`)
    if (parsed.token_id) parts.push(parsed.token_id.slice(0, 12) + '…')
    if (parsed.shares) parts.push(`${parsed.shares} shares`)
    if (parsed.trade_side) parts.push(parsed.trade_side)
    if (parsed.trade_pnl !== undefined) parts.push(`pnl ${parsed.trade_pnl >= 0 ? '+' : ''}${parsed.trade_pnl}`)
    if (parsed.total_pnl !== undefined) parts.push(`PnL ${parsed.total_pnl >= 0 ? '+' : ''}${parsed.total_pnl}`)
    if (parsed.tx_id) parts.push(parsed.tx_id.slice(0, 10) + '…')
    if (parsed.error_message) parts.push(parsed.error_message.slice(0, 40))
    if (parsed.action) parts.push(parsed.action)
    return parts.length > 0 ? parts.join(' · ') : JSON.stringify(parsed).slice(0, 80)
  } catch {
    return log.message.slice(0, 80)
  }
}

export function HCSFeed({ topicId }: { topicId?: string }) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const load = useCallback(async () => {
    if (!topicId) return
    setLoading(true)
    setError('')
    try {
      const result = await fetchAuditLogs(topicId, 20)
      if (!result.success) {
        setError(result.error ?? 'Failed to fetch')
        return
      }
      const entries: LogEntry[] = result.logs.map((msg) => ({
        id: msg.consensus_timestamp ?? String(msg.sequence_number ?? Math.random()),
        timestamp: msg.consensus_timestamp ?? new Date().toISOString(),
        event: String(msg.parsed?.event ?? 'UNKNOWN'),
        message: msg.parsed ? JSON.stringify(msg.parsed) : msg.message,
        sequenceNumber: String(msg.sequence_number ?? ''),
      }))
      setLogs(entries)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fetch failed')
    } finally {
      setLoading(false)
    }
  }, [topicId])

  useEffect(() => {
    load()
    // Poll every 10s for new messages
    intervalRef.current = setInterval(load, 10_000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [load])

  // No topic configured
  if (!topicId) {
    return (
      <div className="rounded-lg border border-[#1A3C50] bg-[#0E1B27] overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-[#1A3C50]">
          <span className="h-2 w-2 rounded-full bg-[#B0BEC5]" />
          <span className="text-xs text-[#B0BEC5]">HCS Audit Feed</span>
        </div>
        <div className="px-4 py-6 text-center">
          <p className="text-xs text-[#B0BEC5]">No HCS topic configured for this vault.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-[#1A3C50] bg-[#0E1B27] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#1A3C50]">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#26A69A] animate-pulse" />
          <span className="text-xs text-[#B0BEC5]">HCS Audit Feed</span>
          {logs.length > 0 && (
            <span className="text-[10px] text-[#B0BEC5]">({logs.length} messages)</span>
          )}
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="text-[#B0BEC5] hover:text-[#E1F5FE] transition-colors"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="px-4 py-2 text-[10px] text-[#EF5350] border-b border-[#1A3C50]">
          {error}
        </div>
      )}

      <div className="divide-y divide-[#1A3C50] max-h-48 overflow-y-auto">
        {logs.length === 0 && !loading && !error && (
          <div className="px-4 py-6 text-center">
            <p className="text-xs text-[#B0BEC5]">No messages yet.</p>
          </div>
        )}
        {logs.map((log) => {
          const color = getEventColor(log.event)
          return (
            <div key={log.id} className="flex items-start gap-3 px-4 py-2">
              <span
                className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-mono uppercase font-semibold"
                style={{ color, border: `1px solid ${color}33`, background: `${color}11` }}
              >
                {log.event.replace(/_/g, ' ')}
              </span>
              <span className="flex-1 text-xs font-mono text-[#E1F5FE] truncate">
                {formatPayload(log)}
              </span>
              <span className="text-[10px] text-[#B0BEC5] tabular-nums shrink-0">
                {new Date(log.timestamp).toLocaleTimeString([], { hour12: false })}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
