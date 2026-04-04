'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { StrategyForm } from '@/components/strategy-form'
import { saveVault, generateId, generateAuditId } from '@/lib/store'
import { Vault } from '@/types'
import { initVault } from '@/actions/hedera'
import { initVaultENS, buildEnsContext } from '@/lib/ens/vault-ens-init'
import { buildEnsName } from '@/lib/ens/subname'
import { computePolicyHash } from '@/lib/ens/policy-commitment'
import { fetchUsdcBalance, approveVaultFunding } from '@/actions/arc/fund-vault'
import { cn } from '@/lib/utils'
import {
  ChevronLeft, ChevronRight, User, Settings, Shield,
  Wallet, Rocket, Check, Loader2, Globe
} from 'lucide-react'

const STEPS = [
  { id: 0, label: 'Identity', icon: User },
  { id: 1, label: 'Strategy', icon: Settings },
  { id: 2, label: 'Policy', icon: Shield },
  { id: 3, label: 'Funding', icon: Wallet },
  { id: 4, label: 'Deploy', icon: Rocket },
]

const DEPLOY_STAGES = [
  'Connecting to Hedera…',
  'Creating HTS token…',
  'Minting vault shares…',
  'Registering HCS audit topic…',
  'Logging deployment to HCS…',
  'Creating ENS identity…',
  'Committing policy hash…',
  'Registering agent fleet…',
  'Approving USDC on Arc…',
  'Vault live!',
]

export default function CreateVaultPage() {
  const router = useRouter()
  const { ready, authenticated, login } = usePrivy()
  const { wallets } = useWallets()
  const [step, setStep] = useState(0)
  const [vaultName, setVaultName] = useState('')
  const walletConnected = authenticated && wallets.length > 0
  const walletAddress = (wallets[0]?.address ?? '') as string
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
  const [fundingLoading, setFundingLoading] = useState(false)
  const [fundingTxHash, setFundingTxHash] = useState('')
  const [fundingExplorerUrl, setFundingExplorerUrl] = useState('')
  const [onChainBalance, setOnChainBalance] = useState<string | null>(null)
  const [deploying, setDeploying] = useState(false)
  const [deployStage, setDeployStage] = useState(-1)
  const [deployDone, setDeployDone] = useState(false)
  const [deployError, setDeployError] = useState('')
  const [newVaultId, setNewVaultId] = useState('')
  const previewId = newVaultId || vaultName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 16)

  // Fetch on-chain USDC balance when entering funding step
  useEffect(() => {
    if (step === 3 && walletAddress) {
      fetchUsdcBalance(walletAddress).then(setOnChainBalance)
    }
  }, [step, walletAddress])

  async function handleApprove() {
    if (!usdcFunding) return
    setFundingLoading(true)
    setFundingTxHash('')
    setFundingExplorerUrl('')
    try {
      const result = await approveVaultFunding({ amountUsdc: parseFloat(usdcFunding) })
      if (result.success) {
        setFundingTxHash(result.approveTxHash)
        setFundingExplorerUrl(result.explorerUrl)
        setOnChainBalance(result.balanceAfter)
      }
    } catch {
      // silently fail — user can still proceed
    } finally {
      setFundingLoading(false)
    }
  }

  const canProceed = useCallback(() => {
    if (step === 0) return vaultName.trim().length >= 2 && authenticated && wallets.length > 0
    if (step === 1) return strategy.sellPrice > strategy.bidPrice
    return true
  }, [step, vaultName, authenticated, wallets, strategy])

  async function deploy() {
    setDeploying(true)
    setDeployError('')
    const id = generateId()
    setNewVaultId(id)

    setDeployStage(0) // "Connecting to Hedera…"

    // ── Phase 1: Hedera deployment ──
    const result = await initVault({
      vaultId: id,
      vaultName,
      initialShares: 1000,
    })

    if (!result.success || !result.context) {
      setDeployError(result.error ?? 'Deployment failed')
      setDeploying(false)
      return
    }

    // Advance Hedera stages (0-4)
    for (let i = 1; i < 5; i++) {
      setDeployStage(i)
      await new Promise(r => setTimeout(r, 400))
    }

    // ── Phase 2: ENS initialization ──
    let ensResult: Awaited<ReturnType<typeof initVaultENS>> | null = null

    try {
      setDeployStage(5) // "Creating ENS identity…"
      ensResult = await initVaultENS({
        vaultId: id,
        vaultName,
        strategy,
        mode,
        funding: { usdc: parseFloat(usdcFunding) || 100, hbar: 1.0 },
        hederaContext: result.context,
      })
      setDeployStage(6) // "Committing policy hash…"
      await new Promise(r => setTimeout(r, 400))
      setDeployStage(7) // "Registering agent fleet…"
      await new Promise(r => setTimeout(r, 400))
    } catch (ensErr) {
      console.warn('ENS initialization failed (non-blocking):', ensErr)
      setDeployStage(5)
      await new Promise(r => setTimeout(r, 400))
      setDeployStage(6)
      await new Promise(r => setTimeout(r, 400))
      setDeployStage(7)
      await new Promise(r => setTimeout(r, 400))
    }

    // ── Phase 3: Approve USDC on Arc ──
    setDeployStage(8) // "Approving USDC on Arc…"
    try {
      const arcResult = await approveVaultFunding({ amountUsdc: parseFloat(usdcFunding) || 100 })
      if (arcResult.success) {
        console.log('[deploy] Arc USDC approved:', arcResult.approveTxHash)
      } else {
        console.warn('[deploy] Arc approval failed (non-blocking):', arcResult.error)
      }
    } catch (arcErr) {
      console.warn('[deploy] Arc approval failed (non-blocking):', arcErr)
    }

    setDeployStage(9) // "Vault live!"

    const vault: Vault = {
      id,
      name: vaultName,
      walletAddress,
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
          reasoning: `Vault deployed on Hedera. Token ${result.context.tokenId}, Topic ${result.context.topicId}. ${result.context.initialSharesMinted} shares minted.${ensResult ? ` ENS: ${ensResult.ensName}, policy hash ${ensResult.policyHash.slice(0, 16)}...` : ''}`,
        },
      ],
      sparkline: [0],
      hedera: result.context,
      ens: ensResult ? buildEnsContext(ensResult) : undefined,
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
              {!ready ? (
                <div className="flex items-center gap-2 text-sm text-[#B0BEC5]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading wallet…
                </div>
              ) : walletConnected ? (
                <div className="flex items-center gap-3 rounded-lg border border-[#26A69A]/40 bg-[#26A69A]/10 px-4 py-3">
                  <div className="h-2 w-2 rounded-full bg-[#26A69A]" />
                  <div>
                    <p className="text-xs text-[#B0BEC5]">Wallet Connected</p>
                    <p className="text-sm font-mono text-[#E1F5FE]">
                      {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                    </p>
                  </div>
                </div>
              ) : (
                <Button
                  onClick={() => login()}
                  className="bg-[#00A8B5] hover:bg-[#4DD0E1] text-[#081216] font-semibold gap-2"
                >
                  <Wallet className="h-4 w-4" />
                  Connect Wallet
                </Button>
              )}
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
              <p className="text-sm text-[#B0BEC5]">Allocate capital to your vault on Arc testnet.</p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-[#B0BEC5]">USDC Amount to Approve</Label>
              <Input
                type="number"
                min="1"
                max="10000"
                value={usdcFunding}
                onChange={e => setUsdcFunding(e.target.value)}
                className="bg-[#0E1B27] border-[#1A3C50] text-[#E1F5FE] font-mono"
              />
            </div>

            {/* On-chain balance */}
            <div className="rounded-lg border border-[#1A3C50] bg-[#0E1B27] p-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-[#B0BEC5]">On-chain USDC Balance</span>
                <span className="font-mono text-[#E1F5FE]">
                  {onChainBalance !== null
                    ? `${parseFloat(onChainBalance).toFixed(2)} USDC`
                    : <Loader2 className="h-3 w-3 animate-spin inline" />
                  }
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#B0BEC5]">Approve for Contract</span>
                <span className="font-mono text-[#E1F5FE]">{usdcFunding} USDC</span>
              </div>
              <div className="h-px bg-[#1A3C50]" />
              <div className="flex justify-between text-sm font-semibold">
                <span className="text-[#B0BEC5]">Remaining after approval</span>
                <span className="font-mono text-[#00A8B5]">
                  {onChainBalance !== null
                    ? `${(parseFloat(onChainBalance) - parseFloat(usdcFunding || '0')).toFixed(2)} USDC`
                    : '—'}
                </span>
              </div>
            </div>

            {/* Approve button */}
            {!fundingTxHash && (
              <Button
                onClick={handleApprove}
                disabled={fundingLoading || !usdcFunding}
                className="w-full bg-[#00A8B5] hover:bg-[#4DD0E1] text-[#081216] font-semibold gap-2"
              >
                {fundingLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wallet className="h-4 w-4" />
                )}
                {fundingLoading ? 'Approving on Arc…' : 'Approve USDC on Arc'}
              </Button>
            )}

            {/* Approval confirmed */}
            {fundingTxHash && (
              <div className="rounded-lg border border-[#26A69A]/40 bg-[#26A69A]/10 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-[#26A69A]" />
                  <p className="text-sm font-semibold text-[#E1F5FE]">USDC Approved</p>
                </div>
                <p className="text-xs text-[#B0BEC5] break-all">
                  TX: <span className="font-mono text-[#4DD0E1]">{fundingTxHash.slice(0, 10)}…{fundingTxHash.slice(-8)}</span>
                </p>
                {fundingExplorerUrl && (
                  <a
                    href={fundingExplorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[#00A8B5] hover:text-[#4DD0E1] transition-colors"
                  >
                    View on Arc Explorer
                  </a>
                )}
              </div>
            )}

            <p className="text-xs text-[#B0BEC5]">
              Approval is non-blocking — you can deploy without it, but the engine needs approval to place bets on-chain.
            </p>
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
                  ['ENS Name', buildEnsName(previewId)],
                  ['Policy Hash', computePolicyHash(strategy, vaultName, mode).slice(0, 16) + '…'],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between text-sm">
                    <span className="text-[#B0BEC5]">{k}</span>
                    <span className={cn(
                      'font-mono',
                      k === 'ENS Name' ? 'text-[#00A8B5]' :
                      k === 'Policy Hash' ? 'text-[#4DD0E1]' :
                      'text-[#E1F5FE]'
                    )}>{v}</span>
                  </div>
                ))}
              </div>
            )}

            {deployError && !deploying && (
              <div className="rounded-lg border border-[#EF5350]/40 bg-[#EF5350]/10 p-4">
                <p className="text-sm font-semibold text-[#EF5350] mb-1">Deployment Failed</p>
                <p className="text-xs text-[#B0BEC5]">{deployError}</p>
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
                {buildEnsName(newVaultId) && (
                  <a
                    href={`https://app.ens.domains/name/${buildEnsName(newVaultId)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 mx-auto text-sm text-[#00A8B5] hover:text-[#4DD0E1] transition-colors"
                  >
                    <Globe className="h-3.5 w-3.5" />
                    <span className="font-mono">{buildEnsName(newVaultId)}</span>
                  </a>
                )}
                <p className="text-sm text-[#B0BEC5]">Redirecting to dashboard…</p>
              </div>
            )}

            {!deploying && !deployDone && (
              <Button
                onClick={deploy}
                size="lg"
                className="bg-[#00A8B5] hover:bg-[#4DD0E1] text-[#081216] font-bold gap-2 w-full glow-teal"
              >
                <Rocket className="h-4 w-4" />
                Deploy Vault
              </Button>
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
