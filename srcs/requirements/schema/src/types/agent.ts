import type { PnlSnapshot } from './engine'
import type { AuditEvent } from './vault'

/** Payment receipt for agent cycle transactions. */
export interface PaymentReceipt {
  txId: string
  amount: string
  consensusTimestamp: string
  hashscanUrl: string
}

export interface AgentHooks {
  onBeforeLLMCall: (
    vaultId: string,
    topicId: string,
  ) => Promise<{ paymentReceipt: PaymentReceipt | null }>

  onTradeDecision: (
    vaultId: string,
    topicId: string,
    side: string,
    pnl: number,
  ) => Promise<void>

  onCycleComplete: (
    vaultId: string,
    topicId: string,
    pnl: PnlSnapshot,
  ) => Promise<void>

  onEngineError: (
    vaultId: string,
    error: Error,
  ) => Promise<void>

  onPolicySave: (
    vaultId: string,
    policyHash: string,
  ) => Promise<{ txHash: string } | null>
}

export interface CycleResult {
  success: boolean
  pnl: PnlSnapshot | null
  fills: number
  paymentReceipt: PaymentReceipt | null
  auditEvent: AuditEvent | null
  error?: string
}

export interface AgentStatus {
  running: boolean
  engineState: string
  cyclesCompleted: number
  lastPnl: number
}
