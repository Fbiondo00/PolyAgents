'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { getVaultById, saveVault } from '@/lib/store'
import { Vault } from '@/lib/types'
import { StrategyForm } from '@/components/strategy-form'
import { PolicyHashCard } from '@/components/policy-hash-card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Loader2, Save, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

function computeHash(strategy: Vault['strategy'], name: string): string {
  const str = JSON.stringify({ name, strategy })
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  const h = Math.abs(hash).toString(16).padStart(8, '0')
  return `0x${h}${h.split('').reverse().join('')}${h}abcdef0123456789`.slice(0, 64)
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
      setHash(computeHash(v.strategy, v.name))
    }
  }, [params.id])

  function onStrategyChange(s: Vault['strategy']) {
    setStrategy(s)
    if (vault) setHash(computeHash(s, vault.name))
    setSaved(false)
  }

  async function handleSave() {
    if (!vault || !strategy) return
    setSaving(true)
    await new Promise(r => setTimeout(r, 3000))
    const updated = { ...vault, strategy }
    saveVault(updated)
    setVault(updated)
    setSaved(true)
    setSaving(false)
    toast.success('Policy saved', {
      description: `Hash: ${hash.slice(0, 16)}…`,
    })
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
            Computing hash (3s)…
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
