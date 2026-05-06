'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { initDemoVault, getVaults } from '@/lib/store'
import { Vault } from '@/types'
import { PnLSparkline } from '@/components/pnl-sparkline'
import { MobileNav } from '@/components/mobile-nav'
import { VaultCard } from '@/components/vault-card'
import {
  Bot, Zap, Shield, TrendingUp, ArrowRight, Plus,
  BarChart3, Activity, Coins, ChevronRight,
  Globe, Lock, FileText, Cpu, RefreshCw, Eye, LayoutGrid,
} from 'lucide-react'
import { PrivyLoginButton } from '@/components/privy-login-button'

const TICKER_ITEMS = [
  { label: 'BTC/USD 5m', value: '0.523', delta: '+2.1%' },
  { label: 'ETH/USD 5m', value: '0.481', delta: '+0.8%' },
  { label: 'SOL/USD 5m', value: '0.612', delta: '-1.2%' },
  { label: 'HBAR/USD 5m', value: '0.091', delta: '+5.4%' },
  { label: 'Total Volume', value: '$4.2M', delta: '' },
  { label: 'Active Vaults', value: '1,482', delta: '' },
  { label: 'Protocol PnL', value: '+$18.7K', delta: '' },
  { label: 'Open Positions', value: '8,340', delta: '' },
]

const DIAGRAM_NODES = [
  { label: 'Polymarket CLOB', x: '15%', y: '25%' },
  { label: 'AI Agent', x: '50%', y: '15%' },
  { label: 'Vault Strategy', x: '50%', y: '55%' },
  { label: 'Risk Engine', x: '80%', y: '40%' },
]

const STRATEGY_STEPS = [
  { step: '01', title: 'Discover', desc: 'Scan Polymarket for active BTC 5-minute binary markets with tight spreads and high liquidity.' },
  { step: '02', title: 'Quote', desc: 'Place $0.01 limit bids on both YES and NO sides — passive market-making at extreme probability edges.' },
  { step: '03', title: 'Fill & Flip', desc: 'When filled, instantly sell at $0.02. 100% spread capture per share — no directional risk.' },
  { step: '04', title: 'Roll Over', desc: 'Before expiry, cancel open orders and roll into the next 5-minute window. Non-stop cycle.' },
  { step: '05', title: 'Reconcile', desc: 'Cross-check on-chain inventory with local ledger. Patch any drift from network latency.' },
]

export function HomeClient() {
  const [allVaults, setAllVaults] = useState<Vault[]>([])
  const [mounted, setMounted] = useState(false)
  const { authenticated } = usePrivy()
  const { wallets } = useWallets()
  const walletAddress = authenticated && wallets.length > 0 ? wallets[0].address.toLowerCase() : null

  // Demo vault: solo al mount
  useEffect(() => {
    initDemoVault()
  }, [])

  // Vault list: reattivo al cambio wallet
  useEffect(() => {
    setAllVaults(getVaults())
    setMounted(true)
  }, [authenticated, wallets])

  // Filter: show demo vault always, user vaults only if wallet matches
  const vaults = allVaults.filter(v => {
    if (!v.walletAddress) return true // demo vault
    return v.walletAddress.toLowerCase() === walletAddress
  })

  return (
    <div className="min-h-screen bg-[#081216] pb-20 md:pb-0">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-[#1A3C50] bg-[#081216]/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-VlVMoEHHdkmyfUe5dLKTvdGHkcEXao.png"
              alt="PolyAgents logo"
              className="h-8 w-8 object-contain"
            />
            <span className="font-heading font-bold text-[#E1F5FE] text-lg">PolyAgents</span>
            <Badge className="hidden sm:flex bg-[#00A8B5]/20 text-[#00A8B5] border-[#00A8B5]/30 text-[10px]">
              BETA
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {authenticated && wallets.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="border-[#1A3C50] text-[#B0BEC5] hover:text-[#E1F5FE] hover:bg-[#1A3C50] gap-1.5"
                onClick={() => document.getElementById('my-vaults')?.scrollIntoView({ behavior: 'smooth' })}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                My Vaults
              </Button>
            )}
            <PrivyLoginButton />
            <Link href="/vault/create">
              <Button size="sm" className="bg-[#00A8B5] hover:bg-[#4DD0E1] text-[#081216] font-semibold gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                New Vault
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Ticker */}
      <div className="overflow-hidden border-b border-[#1A3C50] bg-[#0E1B27] py-2">
        <div className="flex ticker-animate gap-12">
          {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
            <div key={i} className="flex shrink-0 items-center gap-2">
              <span className="text-xs text-[#B0BEC5]">{item.label}</span>
              <span className="text-xs font-mono font-semibold text-[#E1F5FE]">{item.value}</span>
              {item.delta && (
                <span className={`text-[10px] font-mono ${item.delta.startsWith('+') ? 'text-[#26A69A]' : 'text-[#EF5350]'}`}>
                  {item.delta}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4">
        {/* Hero */}
        <section className="flex flex-col items-center py-16 text-center md:py-24">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#1A3C50] bg-[#0E1B27] px-4 py-1.5 text-xs text-[#00A8B5]">
            <Activity className="h-3 w-3" />
            ETHGlobal Cannes 2026 — Live Prototype
          </div>
          <h1 className="font-heading text-4xl font-extrabold leading-tight text-balance text-[#E1F5FE] md:text-6xl lg:text-7xl">
            Autonomous{' '}
            <span className="text-[#00A8B5] text-glow">Trading Agents</span>
            <br />
            for Prediction Markets
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-[#B0BEC5] md:text-lg">
            Deploy AI-powered vaults that scalp micro spreads on Polymarket&apos;s 5-minute BTC binary markets.
            Passive market-making: $0.01 bids on both sides, instant $0.02 flips for 100% spread capture.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/vault/create">
              <Button size="lg" className="bg-[#00A8B5] hover:bg-[#4DD0E1] text-[#081216] font-bold gap-2 glow-teal">
                <Zap className="h-4 w-4" />
                Deploy Your Vault
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            {mounted && vaults.length > 0 && (
              <Link href={`/vault/${vaults[0].id}`}>
                <Button size="lg" variant="outline" className="border-[#1A3C50] bg-[#0E1B27] text-[#E1F5FE] hover:bg-[#1A3C50] gap-2">
                  <BarChart3 className="h-4 w-4" />
                  View Demo Vault
                </Button>
              </Link>
            )}
          </div>
        </section>

        {/* Strategy — How It Works */}
        <section className="mb-16">
          <h2 className="font-heading text-2xl font-bold text-[#E1F5FE] text-center mb-2">The Strategy</h2>
          <p className="text-sm text-[#B0BEC5] text-center mb-8 max-w-xl mx-auto">
            A state-machine driven cycle that runs every 5 minutes — no directional bets, pure passive market-making.
          </p>
          <div className="grid gap-3 md:grid-cols-5">
            {STRATEGY_STEPS.map(({ step, title, desc }) => (
              <div key={step} className="rounded-lg border border-[#1A3C50] bg-[#0E1B27] p-4 relative">
                <span className="text-[10px] font-mono text-[#00A8B5]/60">{step}</span>
                <h3 className="font-heading font-semibold text-[#E1F5FE] text-sm mt-1 mb-1.5">{title}</h3>
                <p className="text-xs text-[#B0BEC5] leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Architecture */}
        <section className="mb-16">
          <h2 className="font-heading text-2xl font-bold text-[#E1F5FE] text-center mb-2">Architecture</h2>
          <p className="text-sm text-[#B0BEC5] text-center mb-8 max-w-xl mx-auto">
            Autonomous trading engine powered by AI analysis on Polymarket binary markets.
          </p>
          <div className="relative rounded-xl border border-[#1A3C50] bg-[#0E1B27] h-56 overflow-hidden mb-8">
            <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <marker id="arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L6,3 z" fill="#00A8B5" opacity="0.5" />
                </marker>
              </defs>
              {[
                ['15%', '28%', '47%', '18%'],
                ['53%', '18%', '80%', '28%'],
                ['47%', '58%', '15%', '78%'],
                ['53%', '58%', '80%', '78%'],
                ['47%', '18%', '47%', '48%'],
              ].map(([x1, y1, x2, y2], i) => (
                <line
                  key={i}
                  x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke="#00A8B5"
                  strokeWidth="1"
                  strokeOpacity="0.3"
                  strokeDasharray="4 4"
                  markerEnd="url(#arrow)"
                />
              ))}
            </svg>
            {DIAGRAM_NODES.map(({ label, x, y }) => (
              <div
                key={label}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: x, top: y }}
              >
                <div className="rounded-lg border border-[#00A8B5]/40 bg-[#081216] px-3 py-1.5 text-xs font-medium text-[#00A8B5] whitespace-nowrap">
                  {label}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Core Features */}
        <section className="mb-16">
          <h2 className="font-heading text-2xl font-bold text-[#E1F5FE] text-center mb-8">Core Features</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: Cpu,
                title: 'Autonomous Agent Loop',
                desc: 'State machine cycles through DISCOVER → QUOTE → HOLDING_INVENTORY → EXPIRY_GUARD → ROLL_OVER → RECONCILE. Fully automatic or advisory mode.',
              },
              {
                icon: Eye,
                title: 'AI Market Analysis',
                desc: 'Gemini analyses order flow, RSI, and volume to determine entry confidence and sizing.',
              },
              {
                icon: Shield,
                title: 'Risk Engine',
                desc: 'Position sizing, drawdown limits, and inventory caps protect capital on every cycle.',
              },
              {
                icon: BarChart3,
                title: 'Fill Simulator',
                desc: 'Monte Carlo simulation estimates fill probability based on order book depth and queue position.',
              },
              {
                icon: RefreshCw,
                title: 'Auto Rollover',
                desc: 'Before expiry, cancel open orders and roll into the next 5-minute window. Non-stop cycle.',
              },
              {
                icon: Lock,
                title: 'Policy Commitment',
                desc: 'keccak256 hash of your strategy config. Verify the agent follows its original policy at any time.',
              },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-lg border border-[#1A3C50] bg-[#0E1B27] p-5">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#00A8B5]/15 text-[#00A8B5]">
                  <Icon className="h-4 w-4" />
                </div>
                <h3 className="font-heading font-semibold text-[#E1F5FE] mb-1.5 text-sm">{title}</h3>
                <p className="text-xs leading-relaxed text-[#B0BEC5]">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* My Vaults */}
        {mounted && vaults.length > 0 && (
          <section id="my-vaults" className="mb-12">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-heading text-lg font-bold text-[#E1F5FE]">My Vaults</h2>
              <Link href="/vault/create">
                <Button size="sm" variant="outline" className="border-[#1A3C50] text-[#B0BEC5] hover:text-[#E1F5FE] hover:bg-[#1A3C50] gap-1.5 text-xs">
                  <Plus className="h-3 w-3" />
                  Add Vault
                </Button>
              </Link>
            </div>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {vaults.map(vault => (
                <VaultCard key={vault.id} vault={vault} />
              ))}
            </div>
          </section>
        )}

        {/* CTA */}
        <section className="text-center py-12 mb-8">
          <h2 className="font-heading text-3xl font-bold text-[#E1F5FE] mb-4">Ready to deploy?</h2>
          <p className="text-[#B0BEC5] mb-8 max-w-md mx-auto">
            Configure your strategy, fund your vault, and let the agent start scalping 5-minute markets.
          </p>
          <Link href="/vault/create">
            <Button size="lg" className="bg-[#00A8B5] hover:bg-[#4DD0E1] text-[#081216] font-bold gap-2 glow-teal px-8">
              <Zap className="h-4 w-4" />
              Create Free Vault
            </Button>
          </Link>
        </section>
      </main>

      <MobileNav />
    </div>
  )
}
