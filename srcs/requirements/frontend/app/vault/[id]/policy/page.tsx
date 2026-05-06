'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { getVaultById, saveVault } from '@/lib/store'
import { Vault } from '@/types'
import { StrategyForm } from '@/components/strategy-form'
import { PolicyHashCard } from '@/components/policy-hash-card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Loader2, Save, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

function computePolicyHash(strategy: Vault['strategy'], name: string, mode: string): string {
  // Simple hash for local preview
  const raw = JSON.stringify({ name, mode, strategy })
  let hash = 0
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return '0x' + Math.abs(hash).toString(16).padStart(64, '0')
}

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

    const updated = { ...vault, strategy }
    saveVault(updated)
    setVault(updated)
    setSaved(true)
    setSaving(false)

    toast.success('Policy saved locally')

    setTimeout(() => setSaved(false), 3000)
  }

  if (!vault || !strategy) return null

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="font-heading text-xl font-bold text-[#E1F5FE]">Policy</h1>
        <p className="text-sm text-[#B0BEC5]">Modify strategy parameters.</p>
      </div>

      <StrategyForm value={strategy} onChange={onStrategyChange} />

      <PolicyHashCard hash={hash} />

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
            Saving…
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
