import type { PaymentReceipt } from './hedera'
import type { PnlSnapshot } from './engine'
import type { AuditEvent } from './vault'

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
  hederaHealthy: boolean | null
}
