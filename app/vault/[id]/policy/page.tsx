'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { getVaultById, saveVault } from '@/lib/store'
import { Vault } from '@/types'
import { StrategyForm } from '@/components/strategy-form'
import { PolicyHashCard } from '@/components/policy-hash-card'
import { ENSVerificationCard } from '@/components/ens-verification-card'
import { computePolicyHash } from '@/lib/ens/policy-commitment'
import { commitPolicy } from '@/actions/ens'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Loader2, Save, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function PolicyPage() {
  const params = useParams<{ id: string }>()
  const [vault, setVault] = useState<Vault | null>(null)
  const [strategy, setStrategy] = useState<Vault['strategy'] | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [hash, setHash] = useState('')

  useEffect(() => {
    const v = getVaultById(params.id)
    if (v) {
      setVault(v)
      setStrategy(v.strategy)
      setHash(computePolicyHash(v.strategy, v.name, v.mode))
    }
  }, [params.id])

  function onStrategyChange(s: Vault['strategy']) {
    setStrategy(s)
    if (vault) setHash(computePolicyHash(s, vault.name, vault.mode))
    setSaved(false)
  }

  async function handleSave() {
    if (!vault || !strategy) return
    setSaving(true)

    try {
      // Commit policy hash to ENS (real on-chain transaction)
      const result = await commitPolicy(vault.id, strategy, vault.name, vault.mode)

      if (!result.success) {
        toast.error('ENS commit failed', { description: result.error })
      } else {
        toast.success('Policy committed to ENS', {
          description: `Tx: ${result.txHash?.slice(0, 10)}…`,
        })
      }
    } catch {
      // Non-blocking: ENS failure shouldn't prevent local save
      toast.warning('ENS commit skipped — saved locally')
    }

    const updated = { ...vault, strategy }
    saveVault(updated)
    setVault(updated)
    setSaved(true)
    setSaving(false)

    setTimeout(() => setSaved(false), 3000)
  }

  if (!vault || !strategy) return null

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="font-heading text-xl font-bold text-[#E1F5FE]">Policy</h1>
        <p className="text-sm text-[#B0BEC5]">Modify strategy parameters. Changes are hashed on-chain.</p>
      </div>

      <StrategyForm value={strategy} onChange={onStrategyChange} />

      <PolicyHashCard hash={hash} />

      {vault.ens?.name && (
        <ENSVerificationCard vault={vault} />
      )}

      <Button
        onClick={handleSave}
        disabled={saving}
        className={cn(
          'w-full gap-2 font-semibold transition-all',
          saved
            ? 'bg-[#26A69A] hover:bg-[#26A69A] text-[#081216]'
            : 'bg-[#00A8B5] hover:bg-[#4DD0E1] text-[#081216]'
        )}
      >
        {saving ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Committing to ENS…
          </>
        ) : saved ? (
          <>
            <CheckCircle2 className="h-4 w-4" />
            Policy Saved
          </>
        ) : (
          <>
            <Save className="h-4 w-4" />
            Save Policy
          </>
        )}
      </Button>
    </div>
  )
}
