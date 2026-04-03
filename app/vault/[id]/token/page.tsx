'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { getVaultById } from '@/lib/store'
import { Vault } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { CheckCircle2, XCircle, Loader2, Shield, Coins, RefreshCw } from 'lucide-react'

interface NFT {
  id: string
  serial: number
  name: string
  metadata: string
  mintedAt: number
}

const MOCK_NFTS: NFT[] = [
  { id: '0.0.4837291', serial: 1, name: 'PolyAgent Access #1', metadata: 'IPFS://QmXab…', mintedAt: Date.now() - 86400000 * 3 },
  { id: '0.0.4837292', serial: 2, name: 'PolyAgent Premium #2', metadata: 'IPFS://QmYcd…', mintedAt: Date.now() - 86400000 },
]

export default function TokenPage() {
  const params = useParams<{ id: string }>()
  const [vault, setVault] = useState<Vault | null>(null)
  const [checking, setChecking] = useState(false)
  const [gateStatus, setGateStatus] = useState<'active' | 'inactive' | null>(null)

  useEffect(() => {
    const v = getVaultById(params.id)
    setVault(v)
    if (v) {
      setGateStatus(v.tokenBalance > 0 ? 'active' : 'inactive')
    }
  }, [params.id])

  async function recheck() {
    setChecking(true)
    setGateStatus(null)
    await new Promise(r => setTimeout(r, 2000))
    setGateStatus(vault?.tokenBalance && vault.tokenBalance > 0 ? 'active' : 'inactive')
    setChecking(false)
  }

  if (!vault) return null

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-2xl">
      <div>
        <h1 className="font-heading text-xl font-bold text-[#E1F5FE]">Token & Access</h1>
        <p className="text-sm text-[#B0BEC5]">HTS token gate status and NFT holdings.</p>
      </div>

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
            vault.tokenBalance > 0
              ? 'bg-[#26A69A]/20 text-[#26A69A] border-[#26A69A]/30'
              : 'bg-[#EF5350]/20 text-[#EF5350] border-[#EF5350]/30'
          )}>
            {vault.tokenBalance > 0 ? 'Gated' : 'No Token'}
          </Badge>
        </div>

        <p className="relative text-lg font-heading font-bold text-[#E1F5FE]">PolyAgent Access Token</p>
        <p className="relative text-sm text-[#B0BEC5] mb-4">HTS Token ID: 0.0.482931</p>

        <div className="relative grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-[#081216] border border-[#1A3C50] p-3">
            <p className="text-xs text-[#B0BEC5]">Balance</p>
            <p className="text-xl font-mono font-bold text-[#E1F5FE]">{vault.tokenBalance}</p>
          </div>
          <div className="rounded-lg bg-[#081216] border border-[#1A3C50] p-3">
            <p className="text-xs text-[#B0BEC5]">NFTs</p>
            <p className="text-xl font-mono font-bold text-[#E1F5FE]">{MOCK_NFTS.length}</p>
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

      {/* NFT List */}
      <div className="space-y-2">
        <p className="text-sm font-semibold text-[#E1F5FE]">NFT Holdings</p>
        {MOCK_NFTS.map(nft => (
          <div key={nft.id} className="rounded-lg border border-[#1A3C50] bg-[#0E1B27] p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="font-semibold text-sm text-[#E1F5FE]">{nft.name}</p>
              <Badge className="text-[10px] bg-[#00A8B5]/20 text-[#00A8B5] border-[#00A8B5]/30">
                #{nft.serial}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-[#B0BEC5]">Token ID</p>
                <p className="font-mono text-[#E1F5FE]">{nft.id}</p>
              </div>
              <div>
                <p className="text-[#B0BEC5]">Minted</p>
                <p className="font-mono text-[#E1F5FE]">{new Date(nft.mintedAt).toLocaleDateString()}</p>
              </div>
              <div className="col-span-2">
                <p className="text-[#B0BEC5]">Metadata</p>
                <p className="font-mono text-[#00A8B5] truncate">{nft.metadata}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
