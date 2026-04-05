'use client'

import { useState, useEffect } from 'react'
import { buildEnsName } from '@/lib/ens/subname'
import { Copy, CheckCheck, ExternalLink, Shield, ShieldAlert, RefreshCw, Loader2, Globe, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { fetchAgentStats, verifyPolicy, fetchAgentProfile, reinitializeENS } from '@/actions/ens'
import { saveVault } from '@/lib/store'
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
  const [copied, setCopied] = useState(false)
  const [reinitLoading, setReinitLoading] = useState(false)
  const [debugInfo, setDebugInfo] = useState<string[]>([])

  // Use vault.ens.name if available, otherwise compute from vault ID
  const ensName = vault.ens?.name || buildEnsName(vault.id)

  async function loadENS() {
    if (!vault.id) return

    setLoading(true)
    const debugLines: string[] = []
    debugLines.push(`ensName: ${ensName}`)
    debugLines.push(`vault.id: ${vault.id}`)
    debugLines.push(`vault.name: ${vault.name}`)
    debugLines.push(`vault.mode: ${vault.mode}`)
    debugLines.push(`vault.strategy keys: ${Object.keys(vault.strategy).join(', ')}`)
    if (vault.ens?.txHashes?.length) {
      debugLines.push(`ENS tx hashes: ${vault.ens.txHashes.length} txs`)
      debugLines.push(`  first tx: ${vault.ens.txHashes[0]}`)
    } else {
      debugLines.push(`ENS tx hashes: NONE (vault may not have been initialized)`)
    }
    debugLines.push(`ENS initializedAt: ${vault.ens?.initializedAt ?? 'never'}`)

    try {
      const [statsResult, profileResult, verifyResult] = await Promise.all([
        fetchAgentStats(vault.id),
        fetchAgentProfile(vault.id),
        verifyPolicy(vault.id, vault.strategy, vault.name, vault.mode),
      ])

      if (statsResult.success && statsResult.stats) {
        setEnsData(statsResult.stats)
        debugLines.push(`stats keys: ${Object.keys(statsResult.stats).join(', ') || 'none'}`)
      } else {
        debugLines.push(`stats error: ${statsResult.error ?? 'unknown'}`)
      }

      if (profileResult.success && profileResult.profile) {
        setProfile(profileResult.profile)
        debugLines.push(`profile keys: ${Object.keys(profileResult.profile).join(', ') || 'none'}`)
      } else {
        debugLines.push(`profile error: ${profileResult.error ?? 'unknown'}`)
      }

      if (verifyResult.success) {
        setVerification({
          match: verifyResult.match ?? false,
          localHash: verifyResult.localHash ?? '',
          onChainHash: verifyResult.onChainHash ?? null,
        })
        debugLines.push(`verification.match: ${verifyResult.match}`)
        debugLines.push(`verification.localHash: ${verifyResult.localHash ?? 'none'}`)
        debugLines.push(`verification.onChainHash: ${verifyResult.onChainHash ?? 'null'}`)
      } else {
        debugLines.push(`verify error: ${verifyResult.error ?? 'unknown'}`)
      }
    } catch (err) {
      console.error('ENS read failed:', err)
      debugLines.push(`ERROR: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(false)
      setDebugInfo(debugLines)
    }
  }

  useEffect(() => {
    loadENS()
  }, [ensName, vault.strategy, vault.name, vault.mode])

  if (!ensName) return null

  function copyEnsName() {
    navigator.clipboard.writeText(ensName).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleReinitialize() {
    setReinitLoading(true)
    try {
      const result = await reinitializeENS(vault.id, {
        name: vault.name,
        strategy: vault.strategy,
        mode: vault.mode,
        funding: vault.funding,
        hedera: vault.hedera,
      })
      if (result.success && result.ensContext) {
        // Persist ENS context on vault in localStorage (client-side)
        saveVault({ ...vault, ens: result.ensContext })
        toast.success(`ENS re-initialized: ${result.ensName}`)
        loadENS()
      } else {
        toast.error(`ENS re-init failed: ${result.error}`)
      }
    } catch {
      toast.error('ENS re-init failed')
    } finally {
      setReinitLoading(false)
    }
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
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px] gap-1 text-[#B0BEC5] hover:text-[#00A8B5]"
            onClick={handleReinitialize}
            disabled={reinitLoading}
          >
            {reinitLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
            Re-init
          </Button>
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
              href={`https://sepolia.app.ens.domains/name/${ensName}`}
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

        {/* Policy Verification */}
        {!loading && verification && (
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
        {!loading && Object.keys(ensData).length > 0 && (
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
        {!loading && profile['ai.agent.hcs14-uaid'] && (
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

        {/* Debug diagnostics (visible when mismatch or no data) */}
        {!loading && debugInfo.length > 0 && (!verification?.match || Object.keys(ensData).length === 0) && (
          <details className="rounded-lg border border-[#FF8F00]/30 bg-[#081216]">
            <summary className="px-3 py-2 text-[10px] font-semibold text-[#FF8F00] cursor-pointer select-none">
              [Debug] ENS Diagnostics
            </summary>
            <div className="px-3 pb-3 space-y-0.5">
              {debugInfo.map((line, i) => (
                <p key={i} className="text-[10px] font-mono text-[#B0BEC5] leading-relaxed break-all">{line}</p>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  )
}
