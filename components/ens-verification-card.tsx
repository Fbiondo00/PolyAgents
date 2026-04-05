'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { readAgentStats } from '@/lib/ens/agent-stats'
import { verifyPolicyIntegrity } from '@/lib/ens/policy-commitment'
import { resolveAgentProfile } from '@/lib/ens/agent-identity'
import { buildEnsName } from '@/lib/ens/subname'
import { Copy, CheckCheck, ExternalLink, Shield, ShieldAlert, RefreshCw, Loader2, Globe } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Vault } from '@/types/vault'

interface ENSVerificationCardProps {
  vault: Vault
  className?: string
}

export function ENSVerificationCard({ vault, className }: ENSVerificationCardProps) {
  const [ensData, setEnsData] = useState<Record<string, string>>({})
  const [profile, setProfile] = useState<Record<string, string>>({})
  const [verification, setVerification] = useState<{
    match: boolean
    localHash: string
    onChainHash: string | null
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const loadingRef = useRef(false)

  // Use vault.ens.name if available, otherwise compute from vault ID
  const ensName = vault.ens?.name || buildEnsName(vault.id)

  const loadENS = useCallback(() => {
    if (!ensName || loadingRef.current) return

    loadingRef.current = true
    setLoading(true)
    setError(null)

    Promise.all([
      readAgentStats(ensName),
      resolveAgentProfile(ensName),
      verifyPolicyIntegrity(
        ensName,
        vault.strategy,
        vault.name,
        vault.mode
      ),
    ])
      .then(([stats, prof, verify]) => {
        setEnsData(stats)
        setProfile(prof)
        setVerification(verify)
        setError(null)
      })
      .catch((err) => {
        console.error('ENS read failed:', err)
        setEnsData({})
        setProfile({})
        setVerification(null)
        setError(err instanceof Error ? err.message : 'Failed to resolve ENS records')
      })
      .finally(() => {
        setLoading(false)
        loadingRef.current = false
      })
  }, [ensName, vault.strategy, vault.name, vault.mode])

  // Only trigger on mount + ensName change (not on object reference changes)
  useEffect(() => {
    loadENS()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ensName])

  if (!ensName) return null

  function copyEnsName() {
    navigator.clipboard.writeText(ensName).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={cn(
      'rounded-lg border border-[#1A3C50] bg-[#0E1B27] overflow-hidden',
      className
    )}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1A3C50]">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-[#00A8B5]" />
          <p className="text-xs font-semibold text-[#E1F5FE]">ENS Identity</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-[#B0BEC5] hover:text-[#00A8B5]"
          onClick={loadENS}
          disabled={loading}
        >
          <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
        </Button>
      </div>

      <div className="p-4 space-y-4">
        {/* ENS Name */}
        <div className="flex items-center justify-between">
          <span className="font-mono text-sm text-[#00A8B5]">{ensName}</span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-[#B0BEC5] hover:text-[#00A8B5]"
              onClick={copyEnsName}
            >
              {copied ? <CheckCheck className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            </Button>
            <a
              href={`https://sepolia.app.ens.domains/${ensName}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#B0BEC5] hover:text-[#00A8B5] transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex items-center gap-2 text-xs text-[#B0BEC5]">
            <Loader2 className="h-3 w-3 animate-spin" />
            Resolving from ENS...
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div className="rounded-lg border border-[#EF5350]/30 bg-[#EF5350]/5 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-[#EF5350]" />
              <p className="text-xs text-[#EF5350] font-semibold">ENS Resolution Failed</p>
            </div>
            <p className="text-xs text-[#B0BEC5]">{error}</p>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-[#00A8B5] hover:text-[#4DD0E1] gap-1 h-7 px-2"
              onClick={loadENS}
            >
              <RefreshCw className="h-3 w-3" />
              Retry
            </Button>
          </div>
        )}

        {/* Empty state — subname not yet initialized on-chain */}
        {!loading && !error && Object.keys(ensData).length === 0 && !verification && (
          <div className="rounded-lg border border-[#1A3C50] bg-[#081216] p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-[#B0BEC5]" />
              <p className="text-xs text-[#B0BEC5] font-semibold">No ENS Records Found</p>
            </div>
            <p className="text-xs text-[#B0BEC5]">
              This vault's ENS subname has not been initialized yet. Records will appear after the first deployment.
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-[#00A8B5] hover:text-[#4DD0E1] gap-1 h-7 px-2"
              onClick={loadENS}
            >
              <RefreshCw className="h-3 w-3" />
              Retry
            </Button>
          </div>
        )}

        {/* Policy Verification */}
        {!loading && !error && verification && (
          <div className="rounded-lg border border-[#1A3C50] bg-[#081216] p-3 space-y-2">
            <div className="flex items-center gap-2">
              {verification.match ? (
                <Shield className="h-4 w-4 text-[#26A69A]" />
              ) : (
                <ShieldAlert className="h-4 w-4 text-[#EF5350]" />
              )}
              <Badge className={cn(
                'text-[10px] font-semibold',
                verification.match
                  ? 'bg-[#26A69A]/20 text-[#26A69A] border-[#26A69A]/30'
                  : 'bg-[#EF5350]/20 text-[#EF5350] border-[#EF5350]/30'
              )}>
                {verification.match ? 'POLICY VERIFIED' : 'POLICY MISMATCH'}
              </Badge>
            </div>
            <div className="space-y-1 text-xs text-[#B0BEC5]">
              <div className="flex items-center gap-2">
                <span className="shrink-0 w-14">On-chain</span>
                <code className="text-[#4DD0E1] truncate">
                  {verification.onChainHash
                    ? `${verification.onChainHash.slice(0, 16)}...${verification.onChainHash.slice(-6)}`
                    : 'not found'}
                </code>
              </div>
              <div className="flex items-center gap-2">
                <span className="shrink-0 w-14">Local</span>
                <code className="text-[#4DD0E1] truncate">
                  {verification.localHash.slice(0, 16)}...{verification.localHash.slice(-6)}
                </code>
              </div>
            </div>
          </div>
        )}

        {/* Live Agent Stats */}
        {!loading && !error && Object.keys(ensData).length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-[#B0BEC5] font-semibold">Live Stats (on-chain)</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              {ensData['agent.flips'] !== undefined && (
                <div className="flex justify-between">
                  <span className="text-[#B0BEC5]">Flips</span>
                  <span className="font-mono text-[#E1F5FE]">{ensData['agent.flips']}</span>
                </div>
              )}
              {ensData['agent.pnl'] !== undefined && (
                <div className="flex justify-between">
                  <span className="text-[#B0BEC5]">PnL</span>
                  <span className={cn(
                    'font-mono',
                    Number(ensData['agent.pnl']) >= 0 ? 'text-[#26A69A]' : 'text-[#EF5350]'
                  )}>
                    {Number(ensData['agent.pnl']) >= 0 ? '+' : ''}{ensData['agent.pnl']} USDC
                  </span>
                </div>
              )}
              {ensData['agent.inventory'] !== undefined && (
                <div className="flex justify-between">
                  <span className="text-[#B0BEC5]">Inventory</span>
                  <span className="font-mono text-[#E1F5FE]">
                    UP {ensData['agent.inventory'].split('/')[0]} / DOWN {ensData['agent.inventory'].split('/')[1]}
                  </span>
                </div>
              )}
              {ensData['agent.cycles'] !== undefined && (
                <div className="flex justify-between">
                  <span className="text-[#B0BEC5]">Cycles</span>
                  <span className="font-mono text-[#E1F5FE]">{ensData['agent.cycles']}</span>
                </div>
              )}
              {ensData['agent.mode'] !== undefined && (
                <div className="flex justify-between">
                  <span className="text-[#B0BEC5]">Mode</span>
                  <span className="font-mono text-[#E1F5FE] uppercase">{ensData['agent.mode']}</span>
                </div>
              )}
              {ensData['agent.engineState'] !== undefined && (
                <div className="flex justify-between">
                  <span className="text-[#B0BEC5]">Engine</span>
                  <Badge className="text-[10px] bg-[#00A8B5]/20 text-[#00A8B5] border-[#00A8B5]/30">
                    {ensData['agent.engineState']}
                  </Badge>
                </div>
              )}
              {ensData['agent.lastTrade'] !== undefined && (
                <div className="flex justify-between col-span-2">
                  <span className="text-[#B0BEC5]">Last Trade</span>
                  <span className="font-mono text-[#E1F5FE]">
                    {new Date(ensData['agent.lastTrade']).toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Agent Profile (ENSIP-25) */}
        {!loading && !error && profile['ai.agent.hcs14-uaid'] && (
          <div className="rounded-lg border border-[#1A3C50] bg-[#081216] p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Shield className="h-3 w-3 text-[#00A8B5]" />
              <p className="text-xs text-[#B0BEC5] font-semibold">Agent Identity (ENSIP-25)</p>
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-[#B0BEC5] shrink-0">UAID</span>
                <code className="text-[#4DD0E1] break-all">{profile['ai.agent.hcs14-uaid']}</code>
              </div>
              {profile['ai.agent.capabilities'] && (
                <div className="flex items-start gap-2">
                  <span className="text-[#B0BEC5] shrink-0 pt-0.5">Skills</span>
                  <div className="flex flex-wrap gap-1">
                    {profile['ai.agent.capabilities'].split(',').map((cap) => (
                      <Badge
                        key={cap}
                        className="text-[10px] bg-[#00A8B5]/10 text-[#00A8B5] border-[#00A8B5]/20"
                      >
                        {cap.trim()}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {profile['ai.agent.network'] && (
                <div className="flex items-center gap-2">
                  <span className="text-[#B0BEC5] shrink-0">Network</span>
                  <span className="font-mono text-[#E1F5FE]">{profile['ai.agent.network']}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
