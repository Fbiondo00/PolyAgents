// ── Vault Agent Orchestrator ──
// Ties Engine + Hedera (real) + ENS (stub) together.
// Pietro's section: engine orchestration + Arc hooks
// Flavio's section: Hedera + ENS hooks (stubs here, real in lib/hedera/)

import type { AgentHooks, CycleResult, AgentStatus } from '@/types'
import { getOrCreateEngine } from '@/lib/engine/strategy/engine'
import { computeRunPnL } from '@/lib/engine/pnl'
import { getEngineRun, getMarketState, addEngineAuditEvent } from '@/lib/engine/repositories'
import { getVaultById, updateVaultStats, addAuditEvent, generateAuditId } from '@/lib/store'
import { payForAgentCycle } from '@/lib/hedera/agent-payment'
import { logToHCS } from '@/lib/hedera/hcs-logger'
import { checkHederaConnection } from '@/lib/hedera/client'
import { commitPolicyHash } from '@/lib/agent/ens-stub'

// ── Singleton cache ──

const agents = new Map<string, VaultAgent>()

// ── Default Hedera hooks ──

function defaultOnBeforeLLMCall(vaultId: string, topicId: string) {
  return payForAgentCycle('agent-cycle', vaultId, topicId).then(r => ({ paymentReceipt: r }))
}

async function defaultOnTradeDecision(vaultId: string, topicId: string, side: string, pnl: number) {
  await logToHCS({
    event: 'AUDIT_LOG' as const,
    vault_id: vaultId,
    topic_id: topicId,
    trade_side: side,
    trade_pnl: pnl,
  })
}

async function defaultOnCycleComplete(vaultId: string, topicId: string, pnl: { totalPnl: number; totalRealizedPnl: number; totalUnrealizedPnl: number }) {
  await logToHCS({
    event: 'AUDIT_LOG' as const,
    vault_id: vaultId,
    topic_id: topicId,
    total_pnl: pnl.totalPnl,
    realized_pnl: pnl.totalRealizedPnl,
    unrealized_pnl: pnl.totalUnrealizedPnl,
  })
}

async function defaultOnEngineError(vaultId: string, error: Error) {
  try {
    await logToHCS({
      event: 'ERROR' as const,
      vault_id: vaultId,
      error_message: error.message,
    })
  } catch {
    // HCS may not be configured — don't throw
  }
}

function defaultOnPolicySave(_vaultId: string, policyHash: string) {
  return commitPolicyHash('polyagents.eth', policyHash)
}

// ── VaultAgent class ──

export class VaultAgent {
  private vaultId: string
  private hooks: Partial<AgentHooks>
  private engine: ReturnType<typeof getOrCreateEngine>

  constructor(vaultId: string, hooks?: Partial<AgentHooks>) {
    this.vaultId = vaultId
    this.hooks = hooks ?? {}
    this.engine = getOrCreateEngine(vaultId)
  }

  /** Run one full agent cycle: pay → step → compute → audit → log */
  async runCycle(): Promise<CycleResult> {
    const vault = getVaultById(this.vaultId)
    if (!vault) {
      return { success: false, pnl: null, fills: 0, paymentReceipt: null, auditEvent: null, error: 'Vault not found' }
    }

    const topicId = vault.hedera?.topicId
    let paymentReceipt: import('@/types').PaymentReceipt | null = null

    // 1. Hedera payment (if configured)
    if (topicId) {
      try {
        const hook = this.hooks.onBeforeLLMCall ?? defaultOnBeforeLLMCall
        const result = await hook(this.vaultId, topicId)
        paymentReceipt = result.paymentReceipt ?? null
      } catch (err) {
        console.warn('[VaultAgent] Hedera payment failed, continuing without:', err)
      }
    }

    // 2. Engine step
    try {
      await this.engine.step(this.vaultId)
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      const hook = this.hooks.onEngineError ?? defaultOnEngineError
      await hook(this.vaultId, error).catch(() => {})
      return { success: false, pnl: null, fills: 0, paymentReceipt, auditEvent: null, error: error.message }
    }

    // 3. Compute PnL
    const pnl = computeRunPnL(this.vaultId)

    // 4. Engine audit event
    const auditEvt = {
      id: generateAuditId(),
      type: 'ai-analysis' as const,
      timestamp: Date.now(),
      reasoning: pnl ? `Cycle complete. PnL: ${pnl.totalPnl >= 0 ? '+' : ''}${pnl.totalPnl.toFixed(3)} USDC` : 'Cycle complete',
    }
    addEngineAuditEvent(this.vaultId, auditEvt)
    addAuditEvent(this.vaultId, auditEvt)

    // 5. Determine fills from market state
    let fills = 0
    const state = getMarketState(this.vaultId)
    if (state) {
      for (const side of ['YES', 'NO'] as const) {
        const ledger = state.sides[side]
        fills += ledger.filledBuyQty + ledger.filledSellQty
      }
    }

    // 6. HCS cycle logging (if configured)
    if (topicId && pnl) {
      try {
        const hook = this.hooks.onCycleComplete ?? defaultOnCycleComplete
        await hook(this.vaultId, topicId, pnl)
      } catch (err) {
        console.warn('[VaultAgent] HCS cycle log failed:', err)
      }
    }

    // 7. HCS trade decision logging (if fills detected)
    if (topicId && state && fills > 0) {
      try {
        const hook = this.hooks.onTradeDecision ?? defaultOnTradeDecision
        const deltaPnl = pnl ? pnl.totalRealizedPnl : 0
        await hook(this.vaultId, topicId, 'BOTH', deltaPnl)
      } catch (err) {
        console.warn('[VaultAgent] HCS trade log failed:', err)
      }
    }

    // 8. Sync legacy vault stats
    const deltaPnl = pnl ? pnl.totalRealizedPnl : 0
    updateVaultStats(this.vaultId, deltaPnl)

    return { success: true, pnl, fills, paymentReceipt, auditEvent: auditEvt }
  }

  /** Start the engine for this vault */
  async start(): Promise<void> {
    const vault = getVaultById(this.vaultId)
    if (!vault) return

    this.engine.start(this.vaultId)

    // Log start to HCS if configured
    if (vault.hedera?.topicId) {
      try {
        await logToHCS({
          event: 'AUDIT_LOG' as const,
          vault_id: this.vaultId,
          topic_id: vault.hedera.topicId,
          action: 'AGENT_STARTED',
        })
      } catch (err) {
        console.warn('[VaultAgent] HCS start log failed:', err)
      }
    }
  }

  /** Stop the engine for this vault */
  async stop(): Promise<void> {
    const vault = getVaultById(this.vaultId)
    if (!vault) return

    this.engine.stop(this.vaultId)

    // Log stop to HCS if configured
    if (vault.hedera?.topicId) {
      try {
        await logToHCS({
          event: 'AUDIT_LOG' as const,
          vault_id: this.vaultId,
          topic_id: vault.hedera.topicId,
          action: 'AGENT_STOPPED',
        })
      } catch (err) {
        console.warn('[VaultAgent] HCS stop log failed:', err)
      }
    }
  }

  /** Get current agent status */
  async getStatus(): Promise<AgentStatus> {
    const run = getEngineRun(this.vaultId)
    const pnl = computeRunPnL(this.vaultId)

    let hederaHealthy: boolean | null = null
    const vault = getVaultById(this.vaultId)
    if (vault?.hedera?.topicId) {
      try {
        const health = await checkHederaConnection()
        hederaHealthy = health.connected
      } catch {
        hederaHealthy = false
      }
    }

    return {
      running: run?.status === 'running',
      engineState: run?.currentState ?? 'IDLE',
      cyclesCompleted: pnl?.totalCompletedCycles ?? 0,
      lastPnl: pnl?.totalPnl ?? 0,
      hederaHealthy,
    }
  }

  /** Commit a policy hash to ENS (stub until Flavio implements) */
  async savePolicy(policyHash: string) {
    const hook = this.hooks.onPolicySave ?? defaultOnPolicySave
    return hook(this.vaultId, policyHash)
  }
}

// ── Singleton factory ──

export function getOrCreateVaultAgent(vaultId: string, hooks?: Partial<AgentHooks>): VaultAgent {
  if (!agents.has(vaultId)) {
    agents.set(vaultId, new VaultAgent(vaultId, hooks))
  }
  return agents.get(vaultId)!
}
