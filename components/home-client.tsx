'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { initDemoVault, getVaults } from '@/lib/store'
import { Vault } from '@/lib/types'
import { PnLSparkline } from '@/components/pnl-sparkline'
import { MobileNav } from '@/components/mobile-nav'
import {
  Bot, Zap, Shield, TrendingUp, ArrowRight, Plus,
  BarChart3, Activity, Coins, ChevronRight
} from 'lucide-react'

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

const PRIZE_CARDS = [
  { title: 'Track 1 — AI Agent', prize: '$15,000', desc: 'Most profitable autonomous vault over 24h backtest' },
  { title: 'Track 2 — UX', prize: '$8,000', desc: 'Best onboarding and mobile experience' },
  { title: 'Track 3 — Infrastructure', prize: '$7,000', desc: 'Most scalable HCS integration' },
]

const DIAGRAM_NODES = [
  { label: 'CLOB Market', x: '10%', y: '20%' },
  { label: 'AI Agent', x: '42%', y: '10%' },
  { label: 'HBAR Wallet', x: '75%', y: '20%' },
  { label: 'Vault Strategy', x: '42%', y: '50%' },
  { label: 'HCS Feed', x: '10%', y: '75%' },
  { label: 'Token Gate', x: '75%', y: '75%' },
]

export function HomeClient() {
  const [vaults, setVaults] = useState<Vault[]>([])
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    initDemoVault()
    setVaults(getVaults())
    setMounted(true)
  }, [])

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
            Live on Hedera Testnet
          </div>
          <h1 className="font-heading text-4xl font-extrabold leading-tight text-balance text-[#E1F5FE] md:text-6xl lg:text-7xl">
            Autonomous{' '}
            <span className="text-[#00A8B5] text-glow">Trading Agents</span>
            <br />
            for Prediction Markets
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-[#B0BEC5] md:text-lg">
            Deploy AI-powered vaults that scalp micro spreads on Polymarket CLOBs using Hedera Token Service for access control and HCS for deterministic audit trails.
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

        {/* Stats */}
        <section className="grid grid-cols-2 gap-3 mb-12 md:grid-cols-4">
          {[
            { label: 'Total Vaults', value: '1,482', icon: Bot },
            { label: 'Cycles Run', value: '284K', icon: Activity },
            { label: 'Protocol PnL', value: '+$18.7K', icon: TrendingUp },
            { label: 'Token Gates', value: '1,482', icon: Shield },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-lg border border-[#1A3C50] bg-[#0E1B27] p-4">
              <Icon className="h-4 w-4 text-[#00A8B5] mb-2" />
              <p className="text-xl font-mono font-bold text-[#E1F5FE]">{value}</p>
              <p className="text-xs text-[#B0BEC5] mt-0.5">{label}</p>
            </div>
          ))}
        </section>

        {/* My Vaults */}
        {mounted && vaults.length > 0 && (
          <section className="mb-12">
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
                <Link key={vault.id} href={`/vault/${vault.id}`}>
                  <div className="group rounded-lg border border-[#1A3C50] bg-[#0E1B27] p-4 hover:border-[#00A8B5]/50 hover:bg-[#0E1B27] transition-all cursor-pointer">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-semibold text-[#E1F5FE] group-hover:text-[#00A8B5] transition-colors">
                          {vault.name}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`h-1.5 w-1.5 rounded-full ${vault.mode === 'auto' ? 'bg-[#26A69A]' : 'bg-[#FF8F00]'}`} />
                          <span className="text-xs text-[#B0BEC5] capitalize">{vault.mode}</span>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-[#B0BEC5] group-hover:text-[#00A8B5] transition-colors" />
                    </div>
                    <div className="h-12 mb-3">
                      <PnLSparkline data={vault.sparkline ?? [vault.stats.pnl]} />
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <p className="text-[#B0BEC5]">PnL</p>
                        <p className={`font-mono font-semibold ${vault.stats.pnl >= 0 ? 'text-[#26A69A]' : 'text-[#EF5350]'}`}>
                          {vault.stats.pnl >= 0 ? '+' : ''}{vault.stats.pnl.toFixed(2)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[#B0BEC5]">Flips</p>
                        <p className="font-mono font-semibold text-[#E1F5FE]">{vault.stats.flips}</p>
                      </div>
                      <div>
                        <p className="text-[#B0BEC5]">Cycles</p>
                        <p className="font-mono font-semibold text-[#E1F5FE]">{vault.stats.cycles}</p>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Features */}
        <section className="mb-16">
          <h2 className="font-heading text-2xl font-bold text-[#E1F5FE] text-center mb-8">How It Works</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                icon: Bot,
                title: 'AI-Driven Strategy',
                desc: 'Each vault runs an autonomous agent that analyses order flow, RSI, and volume to pick optimal entry tranches.',
              },
              {
                icon: Shield,
                title: 'Token-Gated Access',
                desc: 'HTS token ownership gates vault creation and cycle execution, ensuring skin-in-the-game from every operator.',
              },
              {
                icon: Coins,
                title: 'Deterministic Audit',
                desc: 'Every bid, fill, and rollover is logged immutably to HCS. Exportable audit trail ready for compliance.',
              },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-lg border border-[#1A3C50] bg-[#0E1B27] p-6">
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#00A8B5]/15 text-[#00A8B5]">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="font-heading font-semibold text-[#E1F5FE] mb-2">{title}</h3>
                <p className="text-sm leading-relaxed text-[#B0BEC5]">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Architecture Diagram */}
        <section className="mb-16">
          <h2 className="font-heading text-2xl font-bold text-[#E1F5FE] text-center mb-8">Architecture</h2>
          <div className="relative rounded-xl border border-[#1A3C50] bg-[#0E1B27] h-56 overflow-hidden">
            {/* SVG connections */}
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

        {/* Prize Cards */}
        <section className="mb-16">
          <h2 className="font-heading text-2xl font-bold text-[#E1F5FE] text-center mb-8">Hackathon Prizes</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {PRIZE_CARDS.map(({ title, prize, desc }) => (
              <div key={title} className="rounded-lg border border-[#1A3C50] bg-[#0E1B27] p-6 relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1 bg-[#00A8B5]" />
                <p className="text-xs text-[#B0BEC5] mb-1">{title}</p>
                <p className="font-heading text-3xl font-extrabold text-[#00A8B5] text-glow mb-2">{prize}</p>
                <p className="text-sm text-[#B0BEC5] leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="text-center py-12 mb-8">
          <h2 className="font-heading text-3xl font-bold text-[#E1F5FE] mb-4">Ready to deploy?</h2>
          <p className="text-[#B0BEC5] mb-8 max-w-md mx-auto">
            Create your vault in under 2 minutes and let the agent start scalping immediately.
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
