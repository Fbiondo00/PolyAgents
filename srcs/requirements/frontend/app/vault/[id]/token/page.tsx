'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { getVaultById } from '@/lib/store'
import { Vault } from '@/types'
import type { TokenInfo } from '@/types'
import { fetchTokenInfo, checkHealth } from '@/actions/hedera'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { CheckCircle2, XCircle, Loader2, Shield, Coins, RefreshCw, ExternalLink, Wifi, WifiOff } from 'lucide-react'

interface HealthStatus {
  connected: boolean
  balance: string
  accountId: string
}

export default function TokenPage() {
  const params = useParams<{ id: string }>()
  const [vault, setVault] = useState<Vault | null>(null)
  const [checking, setChecking] = useState(false)
  const [gateStatus, setGateStatus] = useState<'active' | 'inactive' | null>(null)
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null)

  useEffect(() => {
    const v = getVaultById(params.id)
    setVault(v)
    if (v?.hedera) {
      setGateStatus('active')
      loadTokenInfo(v.hedera.tokenId)
      loadHealth()
    } else if (v) {
      setGateStatus('inactive')
    }
  }, [params.id])

  async function loadTokenInfo(tokenId: string) {
    setLoading(true)
    setError('')
    const result = await fetchTokenInfo(tokenId)
    if (!result.success) {
      setError(result.error ?? 'Failed to fetch token info')
    } else if (result.token) {
      setTokenInfo(result.token)
      setGateStatus(Number(result.token.total_supply) > 0 ? 'active' : 'inactive')
    }
    setLoading(false)
  }

  async function loadHealth() {
    const result = await checkHealth()
    if (result.success) {
      setHealthStatus({
        connected: result.connected,
        balance: result.balance,
        accountId: result.accountId,
      })
    }
  }

  async function recheck() {
    if (!vault?.hedera) return
    setChecking(true)
    setGateStatus(null)
    await loadTokenInfo(vault.hedera.tokenId)
    await loadHealth()
    setChecking(false)
  }

  if (!vault) return null

  // Vault not deployed on Hedera
  if (!vault.hedera) {
    return (
      <div className="p-4 md:p-6 space-y-5 max-w-2xl">
        <div>
          <h1 className="font-heading text-xl font-bold text-[#E1F5FE]">Token & Access</h1>
          <p className="text-sm text-[#B0BEC5]">HTS token gate status and NFT holdings.</p>
        </div>
        <div className="rounded-lg border border-[#EF5350]/40 bg-[#EF5350]/10 p-6 text-center">
          <XCircle className="h-10 w-10 text-[#EF5350] mx-auto mb-3" />
          <p className="text-sm font-semibold text-[#EF5350]">Hedera Not Configured</p>
          <p className="text-xs text-[#B0BEC5] mt-1">This vault was not deployed on Hedera. Create a new vault to get started.</p>
        </div>
      </div>
    )
  }

  // Error fetching token data
  if (error) {
    return (
      <div className="p-4 md:p-6 space-y-5 max-w-2xl">
        <div>
          <h1 className="font-heading text-xl font-bold text-[#E1F5FE]">Token & Access</h1>
          <p className="text-sm text-[#B0BEC5]">HTS token gate status and NFT holdings.</p>
        </div>
        <div className="rounded-lg border border-[#EF5350]/40 bg-[#EF5350]/10 p-6 text-center">
          <XCircle className="h-10 w-10 text-[#EF5350] mx-auto mb-3" />
          <p className="text-sm font-semibold text-[#EF5350]">Unable to Connect to Hedera</p>
          <p className="text-xs text-[#B0BEC5] mt-1">{error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={recheck}
            disabled={checking}
            className="mt-4 border-[#1A3C50] text-[#B0BEC5] hover:text-[#E1F5FE] hover:bg-[#1A3C50] gap-1.5 text-xs"
          >
            {checking ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Retry
          </Button>
        </div>
      </div>
    )
  }

  const supplyDisplay = tokenInfo
    ? (Number(tokenInfo.total_supply) / Math.pow(10, tokenInfo.decimals)).toFixed(2)
    : '—'

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-2xl">
      <div>
        <h1 className="font-heading text-xl font-bold text-[#E1F5FE]">Token & Access</h1>
        <p className="text-sm text-[#B0BEC5]">HTS token gate status and NFT holdings.</p>
      </div>

      {/* Hedera Connection Status */}
      {healthStatus && (
        <div className="rounded-lg border border-[#1A3C50] bg-[#0E1B27] p-4">
          <div className="flex items-center gap-2 mb-3">
            {healthStatus.connected ? (
              <Wifi className="h-4 w-4 text-[#26A69A]" />
            ) : (
              <WifiOff className="h-4 w-4 text-[#EF5350]" />
            )}
            <p className="text-sm font-semibold text-[#E1F5FE]">Hedera Connection Status</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-xs text-[#B0BEC5]">Status</p>
              <p className={cn('text-sm font-semibold', healthStatus.connected ? 'text-[#26A69A]' : 'text-[#EF5350]')}>
                {healthStatus.connected ? 'Connected' : 'Disconnected'}
              </p>
            </div>
            <div>
              <p className="text-xs text-[#B0BEC5]">Account</p>
              <p className="text-sm font-mono text-[#E1F5FE]">{healthStatus.accountId}</p>
            </div>
            <div>
              <p className="text-xs text-[#B0BEC5]">HBAR Balance</p>
              <p className="text-sm font-mono text-[#E1F5FE]">{healthStatus.balance}</p>
            </div>
          </div>
        </div>
      )}

      {/* Token Card */}
      <div className="rounded-xl border border-[#1A3C50] bg-gradient-to-br from-[#0E1B27] to-[#081216] p-6 relative overflow-hidden">
        {/* Decorative */}
        <div className="absolute top-0 right-0 h-32 w-32 rounded-full bg-[#00A8B5]/5 blur-2xl" />
        <div className="absolute bottom-0 left-0 h-24 w-24 rounded-full bg-[#26A69A]/5 blur-2xl" />

        <div className="relative flex items-start justify-between mb-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#00A8B5]/20">
            <Coins className="h-6 w-6 text-[#00A8B5]" />
          </div>
          <Badge className={cn(
            'text-xs',
            gateStatus === 'active'
              ? 'bg-[#26A69A]/20 text-[#26A69A] border-[#26A69A]/30'
              : 'bg-[#EF5350]/20 text-[#EF5350] border-[#EF5350]/30'
          )}>
            {gateStatus === 'active' ? 'Gated' : 'No Token'}
          </Badge>
        </div>

        <p className="relative text-lg font-heading font-bold text-[#E1F5FE]">
          {tokenInfo?.name ?? vault.hedera.tokenName}
        </p>
        <div className="relative flex items-center gap-2 mb-4">
          <p className="text-sm text-[#B0BEC5]">
            HTS Token ID: {vault.hedera.tokenId}
          </p>
          <a
            href={vault.hedera.tokenHashscan}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#00A8B5] hover:text-[#4DD0E1]"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        <div className="relative grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-[#081216] border border-[#1A3C50] p-3">
            <p className="text-xs text-[#B0BEC5]">Balance</p>
            <p className="text-xl font-mono font-bold text-[#E1F5FE]">
              {loading ? <Loader2 className="h-5 w-5 animate-spin text-[#00A8B5]" /> : supplyDisplay}
            </p>
          </div>
          <div className="rounded-lg bg-[#081216] border border-[#1A3C50] p-3">
            <p className="text-xs text-[#B0BEC5]">NFTs</p>
            <p className="text-xl font-mono font-bold text-[#E1F5FE]">
              <span className="text-sm text-[#B0BEC5]">Coming soon</span>
            </p>
          </div>
          <div className="rounded-lg bg-[#081216] border border-[#1A3C50] p-3">
            <p className="text-xs text-[#B0BEC5]">Network</p>
            <p className="text-sm font-mono font-bold text-[#00A8B5]">Testnet</p>
          </div>
        </div>
      </div>

      {/* Gate Status */}
      <div className="rounded-lg border border-[#1A3C50] bg-[#0E1B27] p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-[#00A8B5]" />
            <p className="text-sm font-semibold text-[#E1F5FE]">Gate Status</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={recheck}
            disabled={checking}
            className="border-[#1A3C50] text-[#B0BEC5] hover:text-[#E1F5FE] hover:bg-[#1A3C50] gap-1.5 text-xs"
          >
            {checking ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Recheck
          </Button>
        </div>

        {checking && (
          <div className="flex items-center gap-2 text-sm text-[#B0BEC5]">
            <Loader2 className="h-4 w-4 animate-spin text-[#00A8B5]" />
            Verifying token ownership on Hedera…
          </div>
        )}

        {gateStatus === 'active' && !checking && (
          <div className="flex items-center gap-3 rounded-lg border border-[#26A69A]/30 bg-[#26A69A]/10 p-3">
            <CheckCircle2 className="h-5 w-5 text-[#26A69A] shrink-0" />
            <div>
              <p className="text-sm font-semibold text-[#26A69A]">Gate Active</p>
              <p className="text-xs text-[#B0BEC5]">Vault cycles are authorized. Token verified on HTS.</p>
            </div>
          </div>
        )}

        {gateStatus === 'inactive' && !checking && (
          <div className="flex items-center gap-3 rounded-lg border border-[#EF5350]/30 bg-[#EF5350]/10 p-3">
            <XCircle className="h-5 w-5 text-[#EF5350] shrink-0" />
            <div>
              <p className="text-sm font-semibold text-[#EF5350]">Gate Inactive</p>
              <p className="text-xs text-[#B0BEC5]">Acquire a PolyAgent token to enable cycle execution.</p>
            </div>
          </div>
        )}
      </div>

      {/* NFT Holdings - Coming Soon */}
      <div className="space-y-2">
        <p className="text-sm font-semibold text-[#E1F5FE]">NFT Holdings</p>
        <div className="rounded-lg border border-[#1A3C50] bg-[#0E1B27] p-6 text-center">
          <p className="text-sm text-[#B0BEC5]">NFT holdings will be displayed here once the feature is available.</p>
        </div>
      </div>
    </div>
  )
}
