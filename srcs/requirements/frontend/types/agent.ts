// ── Agent Orchestrator Types ──
// Separated by field: vault.ts (domain), agent.ts (orchestrator)

import type { PnlSnapshot } from '@/lib/engine/types'
import type { AuditEvent } from './vault'

/** Hooks called during each agent cycle. All hooks are optional —
 *  graceful degradation when context not available. */
export interface AgentHooks {
  /** Called before engine.step(). */
  onBeforeLLMCall: (
    vaultId: string,
  ) => Promise<void>

  /** Called when a fill is detected on a market side. */
  onTradeDecision: (
    vaultId: string,
    side: string,
    pnl: number,
  ) => Promise<void>

  /** Called after engine.step() completes. */
  onCycleComplete: (
    vaultId: string,
    pnl: PnlSnapshot,
  ) => Promise<void>

  /** Called when engine.step() throws. */
  onEngineError: (
    vaultId: string,
    error: Error,
  ) => Promise<void>

  /** Called when policy hash changes. */
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
  auditEvent: AuditEvent | null
  error?: string
}

/** Agent status snapshot for UI display */
export interface AgentStatus {
  running: boolean
  engineState: string
  cyclesCompleted: number
  lastPnl: number
}
