'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { getVaultById } from '@/lib/store'
import { Vault } from '@/types'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Coins, Shield, XCircle, CheckCircle2 } from 'lucide-react'

export default function TokenPage() {
  const params = useParams<{ id: string }>()
  const [vault, setVault] = useState<Vault | null>(null)

  useEffect(() => {
    async function load() {
      setVault(await getVaultById(params.id))
    }
    load()
  }, [params.id])

  if (!vault) return null

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-2xl">
      <div>
        <h1 className="font-heading text-xl font-bold text-[#E1F5FE]">Token & Access</h1>
        <p className="text-sm text-[#B0BEC5]">Token gate status and NFT holdings.</p>
      </div>

      {/* Not deployed */}
      <div className="rounded-lg border border-[#EF5350]/40 bg-[#EF5350]/10 p-6 text-center">
        <XCircle className="h-10 w-10 text-[#EF5350] mx-auto mb-3" />
        <p className="text-sm font-semibold text-[#EF5350]">Token Gate Not Configured</p>
        <p className="text-xs text-[#B0BEC5] mt-1">This vault was not deployed with a token gate. Create a new vault to get started.</p>
      </div>

      {/* Gate Status */}
      <div className="rounded-lg border border-[#1A3C50] bg-[#0E1B27] p-4">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="h-4 w-4 text-[#00A8B5]" />
          <p className="text-sm font-semibold text-[#E1F5FE]">Gate Status</p>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-[#EF5350]/30 bg-[#EF5350]/10 p-3">
          <XCircle className="h-5 w-5 text-[#EF5350] shrink-0" />
          <div>
            <p className="text-sm font-semibold text-[#EF5350]">Gate Inactive</p>
            <p className="text-xs text-[#B0BEC5]">No token gate configured for this vault.</p>
          </div>
        </div>
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
