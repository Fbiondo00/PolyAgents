// ── Agent Orchestrator Types ──
// Separated by field: vault.ts (domain), hedera.ts (chain), agent.ts (orchestrator)
// Docs: Checkpoint 1 — Interface agreement between Pietro + Flavio

import type { PaymentReceipt } from './hedera'
import type { PnlSnapshot } from '@/lib/engine/types'
import type { AuditEvent } from './vault'

/** Hooks called during each agent cycle. Pietro provides engine orchestration,
 *  Flavio provides Hedera + ENS implementations. All hooks are optional —
 *  graceful degradation when context not available. */
export interface AgentHooks {
  // ── Hedera hooks (REAL — lib/hedera/ modules complete) ──

  /** Called before engine.step(). Pays 0.001 HBAR via Hedera Consensus Service. */
  onBeforeLLMCall: (
    vaultId: string,
    topicId: string,
  ) => Promise<{ paymentReceipt: PaymentReceipt | null }>

  /** Called when a fill is detected on a market side. Logs trade to HCS topic. */
  onTradeDecision: (
    vaultId: string,
    topicId: string,
    side: string,
    pnl: number,
  ) => Promise<void>

  /** Called after engine.step() completes. Logs cycle summary to HCS. */
  onCycleComplete: (
    vaultId: string,
    topicId: string,
    pnl: PnlSnapshot,
  ) => Promise<void>

  /** Called when engine.step() throws. Logs error to HCS. */
  onEngineError: (
    vaultId: string,
    error: Error,
  ) => Promise<void>

  // ── ENS hooks (STUB — Flavio implementing) ──

  /** Called when policy hash changes. Commits hash to ENS text record. */
  onPolicySave: (
    vaultId: string,
    policyHash: string,
  ) => Promise<{ txHash: string } | null>
}

/** Result returned by VaultAgent.runCycle() */
export interface CycleResult {
  success: boolean
  pnl: PnlSnapshot | null
  fills: number
  paymentReceipt: PaymentReceipt | null
  auditEvent: AuditEvent | null
  error?: string
}

/** Agent status snapshot for UI display */
export interface AgentStatus {
  running: boolean
  engineState: string
  cyclesCompleted: number
  lastPnl: number
  hederaHealthy: boolean | null
}
