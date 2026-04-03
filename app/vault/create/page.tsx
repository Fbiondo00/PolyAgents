'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { StrategyForm } from '@/components/strategy-form'
import { PrivyConnectMock } from '@/components/privy-connect-mock'
import { saveVault, generateId, generateAuditId } from '@/lib/store'
import { Vault } from '@/lib/types'
import { cn } from '@/lib/utils'
import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  ChevronLeft, ChevronRight, User, Settings, Shield,
  Wallet, Rocket, Check, Loader2
} from 'lucide-react'

const STEPS = [
  { id: 0, label: 'Identity', icon: User },
  { id: 1, label: 'Strategy', icon: Settings },
  { id: 2, label: 'Policy', icon: Shield },
  { id: 3, label: 'Funding', icon: Wallet },
  { id: 4, label: 'Deploy', icon: Rocket },
]

const DEPLOY_STAGES = [
  'Minting HTS token…',
  'Registering HCS topic…',
  'Submitting strategy hash…',
  'Funding vault…',
  'Activating agent…',
  'Provisioning order gateway…',
  'Verifying policy…',
  'Vault live!',
]

export default function CreateVaultPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [vaultName, setVaultName] = useState('')
  const [walletConnected, setWalletConnected] = useState(false)
  const [strategy, setStrategy] = useState<Vault['strategy']>({
    bidPrice: 0.01,
    sellPrice: 0.02,
    maxCapital: 100,
    trancheSize: 15,
    noNewEntriesLast: 30,
    keepSellAfter: 10,
    aiEnabled: true,
  })
  const [mode, setMode] = useState<'advisory' | 'auto'>('auto')
  const [usdcFunding, setUsdcFunding] = useState('100')
  const [deploying, setDeploying] = useState(false)
  const [deployStage, setDeployStage] = useState(-1)
  const [deployDone, setDeployDone] = useState(false)
  const [newVaultId, setNewVaultId] = useState('')
  const [confirmDeployOpen, setConfirmDeployOpen] = useState(false)

  const canProceed = useCallback(() => {
    if (step === 0) return vaultName.trim().length >= 2 && walletConnected
    if (step === 1) return strategy.sellPrice > strategy.bidPrice
    return true
  }, [step, vaultName, walletConnected, strategy])

  async function deploy() {
    setDeploying(true)
    const id = generateId()
    setNewVaultId(id)

    for (let i = 0; i < DEPLOY_STAGES.length; i++) {
      setDeployStage(i)
      const wait = i === DEPLOY_STAGES.length - 1 ? 600 : 1000
      await new Promise(r => setTimeout(r, wait))
    }

    const vault: Vault = {
      id,
      name: vaultName,
      created: Date.now(),
      strategy,
      funding: { usdc: parseFloat(usdcFunding) || 100, hbar: 1.0 },
      inventory: { upShares: 0, downShares: 0 },
      stats: { flips: 0, pnl: 0, cycles: 0 },
      mode,
      tokenBalance: 1,
      activeMarket: {
        id: `btc-5m-${Math.floor(Math.random() * 99)}`,
        expiry: Date.now() + 300000,
        midPrice: 0.5 + Math.random() * 0.1 - 0.05,
      },
      audit: [
        {
          id: generateAuditId(),
          type: 'ai-analysis',
          timestamp: Date.now(),
          reasoning: 'Vault deployed. Initial strategy loaded and agent standing by.',
        },
      ],
      sparkline: [0],
    }

    saveVault(vault)
    setDeployDone(true)
    setDeploying(false)

    setTimeout(() => router.push(`/vault/${id}`), 1200)
  }

  return (
    <div className="min-h-screen bg-[#081216] flex flex-col">
      {/* Header */}
      <header className="border-b border-[#1A3C50] bg-[#0E1B27] px-4 py-3 flex items-center gap-3">
        <Link href="/">
          <Button variant="ghost" size="icon" className="text-[#B0BEC5] hover:text-[#E1F5FE]">
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <p className="text-xs text-[#B0BEC5]">New Vault</p>
          <p className="font-heading font-bold text-[#E1F5FE] text-sm">{vaultName || 'Unnamed Vault'}</p>
        </div>
      </header>

      {/* Step indicator */}
      <div className="border-b border-[#1A3C50] bg-[#0E1B27] px-4 py-3">
        <div className="flex items-center gap-1 overflow-x-auto">
          {STEPS.map(({ id, label, icon: Icon }) => (
            <div key={id} className="flex items-center gap-1 shrink-0">
              <div className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-all',
                id === step ? 'bg-[#00A8B5]/20 text-[#00A8B5]' :
                id < step ? 'text-[#26A69A]' : 'text-[#B0BEC5]'
              )}>
                {id < step ? <Check className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
                <span className="hidden sm:block">{label}</span>
              </div>
              {id < STEPS.length - 1 && (
                <div className={cn(
                  'h-px w-4 sm:w-8',
                  id < step ? 'bg-[#26A69A]' : 'bg-[#1A3C50]'
                )} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 md:p-8 max-w-2xl mx-auto w-full">
        {/* Step 0: Identity */}
        {step === 0 && (
          <div className="space-y-6">
            <div>
              <h2 className="font-heading text-xl font-bold text-[#E1F5FE] mb-1">Identity</h2>
              <p className="text-sm text-[#B0BEC5]">Name your vault and connect your wallet.</p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-[#B0BEC5]">Vault Name</Label>
              <Input
                placeholder="e.g. BTC Scalper Alpha"
                value={vaultName}
                onChange={e => setVaultName(e.target.value)}
                className="bg-[#0E1B27] border-[#1A3C50] text-[#E1F5FE] placeholder:text-[#B0BEC5]"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-[#B0BEC5]">Wallet</Label>
              <PrivyConnectMock onConnected={() => setWalletConnected(true)} />
            </div>
          </div>
        )}

        {/* Step 1: Strategy */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="font-heading text-xl font-bold text-[#E1F5FE] mb-1">Strategy</h2>
              <p className="text-sm text-[#B0BEC5]">Configure your vault&apos;s trading parameters.</p>
            </div>
            <StrategyForm value={strategy} onChange={setStrategy} />
            {strategy.sellPrice <= strategy.bidPrice && (
              <p className="text-xs text-[#EF5350]">Sell price must be greater than bid price.</p>
            )}
          </div>
        )}

        {/* Step 2: Policy */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="font-heading text-xl font-bold text-[#E1F5FE] mb-1">Policy</h2>
              <p className="text-sm text-[#B0BEC5]">Choose your operating mode and review policy.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {(['advisory', 'auto'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={cn(
                    'rounded-lg border p-4 text-left transition-all',
                    mode === m
                      ? 'border-[#00A8B5] bg-[#00A8B5]/10'
                      : 'border-[#1A3C50] bg-[#0E1B27] hover:border-[#00A8B5]/50'
                  )}
                >
                  <p className="font-semibold text-sm text-[#E1F5FE] capitalize mb-1">{m}</p>
                  <p className="text-xs text-[#B0BEC5] leading-relaxed">
                    {m === 'advisory'
                      ? 'AI recommends, you approve each action.'
                      : 'Agent executes autonomously within strategy bounds.'}
                  </p>
                </button>
              ))}
            </div>
            <div className="rounded-lg border border-[#1A3C50] bg-[#081216] p-4">
              <p className="text-xs text-[#B0BEC5] mb-2">Policy Preview</p>
              <pre className="text-xs font-mono text-[#00A8B5] overflow-auto whitespace-pre-wrap leading-relaxed">
{JSON.stringify({ name: vaultName, mode, strategy }, null, 2)}
              </pre>
            </div>
          </div>
        )}

        {/* Step 3: Funding */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="font-heading text-xl font-bold text-[#E1F5FE] mb-1">Funding</h2>
              <p className="text-sm text-[#B0BEC5]">Allocate capital to your vault.</p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-[#B0BEC5]">USDC Amount</Label>
              <Input
                type="number"
                min="10"
                max="10000"
                value={usdcFunding}
                onChange={e => setUsdcFunding(e.target.value)}
                className="bg-[#0E1B27] border-[#1A3C50] text-[#E1F5FE] font-mono"
              />
            </div>
            <div className="rounded-lg border border-[#1A3C50] bg-[#0E1B27] p-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-[#B0BEC5]">USDC Deposit</span>
                <span className="font-mono text-[#E1F5FE]">{usdcFunding} USDC</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#B0BEC5]">HBAR Reserve</span>
                <span className="font-mono text-[#E1F5FE]">1.0 HBAR</span>
              </div>
              <div className="h-px bg-[#1A3C50]" />
              <div className="flex justify-between text-sm font-semibold">
                <span className="text-[#B0BEC5]">Total Deployment</span>
                <span className="font-mono text-[#00A8B5]">${(parseFloat(usdcFunding) || 0) + 1} equiv.</span>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Deploy */}
        {step === 4 && (
          <div className="space-y-6 text-center">
            <div>
              <h2 className="font-heading text-xl font-bold text-[#E1F5FE] mb-1">Deploy</h2>
              <p className="text-sm text-[#B0BEC5]">Launch your vault onto Hedera.</p>
            </div>

            {!deploying && !deployDone && (
              <div className="rounded-lg border border-[#1A3C50] bg-[#0E1B27] p-6 text-left space-y-2">
                <p className="text-sm font-semibold text-[#E1F5FE] mb-3">Deployment Summary</p>
                {[
                  ['Name', vaultName],
                  ['Mode', mode],
                  ['Bid / Sell', `$${strategy.bidPrice} / $${strategy.sellPrice}`],
                  ['Max Capital', `$${strategy.maxCapital}`],
                  ['USDC', `${usdcFunding} USDC`],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between text-sm">
                    <span className="text-[#B0BEC5]">{k}</span>
                    <span className="font-mono text-[#E1F5FE]">{v}</span>
                  </div>
                ))}
              </div>
            )}

            {deploying && (
              <div className="rounded-lg border border-[#1A3C50] bg-[#0E1B27] p-8 space-y-4">
                <Loader2 className="h-10 w-10 text-[#00A8B5] animate-spin mx-auto" />
                <div className="space-y-2">
                  {DEPLOY_STAGES.map((stage, i) => (
                    <div
                      key={i}
                      className={cn(
                        'flex items-center gap-2 text-sm transition-all',
                        i === deployStage ? 'text-[#00A8B5]' :
                        i < deployStage ? 'text-[#26A69A]' : 'text-[#1A3C50]'
                      )}
                    >
                      {i < deployStage ? (
                        <Check className="h-3 w-3 shrink-0" />
                      ) : i === deployStage ? (
                        <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
                      ) : (
                        <div className="h-3 w-3" />
                      )}
                      {stage}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {deployDone && (
              <div className="rounded-lg border border-[#26A69A]/40 bg-[#26A69A]/10 p-8 space-y-3">
                <Check className="h-10 w-10 text-[#26A69A] mx-auto" />
                <p className="font-heading font-bold text-[#E1F5FE]">Vault Deployed!</p>
                <p className="text-sm text-[#B0BEC5]">Redirecting to dashboard…</p>
              </div>
            )}

            {!deploying && !deployDone && (
              <>
                <Button
                  onClick={() => setConfirmDeployOpen(true)}
                  size="lg"
                  className="bg-[#00A8B5] hover:bg-[#4DD0E1] text-[#081216] font-bold gap-2 w-full glow-teal"
                >
                  <Rocket className="h-4 w-4" />
                  Deploy Vault (8s)
                </Button>
                <ConfirmDialog
                  open={confirmDeployOpen}
                  onOpenChange={setConfirmDeployOpen}
                  title="Deploy Vault?"
                  description={`This will mint an HTS token, register an HCS topic, and activate your agent for "${vaultName}". You will fund it with ${usdcFunding} USDC.`}
                  confirmLabel="Deploy Now"
                  onConfirm={() => { setConfirmDeployOpen(false); deploy() }}
                />
              </>
            )}
          </div>
        )}
      </div>

      {/* Footer nav */}
      {step < 4 && (
        <div className="border-t border-[#1A3C50] bg-[#0E1B27] px-4 py-3 flex justify-between">
          <Button
            variant="outline"
            onClick={() => setStep(s => s - 1)}
            disabled={step === 0}
            className="border-[#1A3C50] text-[#B0BEC5] hover:bg-[#1A3C50] hover:text-[#E1F5FE] gap-1"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </Button>
          <Button
            onClick={() => setStep(s => s + 1)}
            disabled={!canProceed()}
            className="bg-[#00A8B5] hover:bg-[#4DD0E1] text-[#081216] font-semibold gap-1"
          >
            {step === 3 ? 'Review' : 'Continue'}
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
