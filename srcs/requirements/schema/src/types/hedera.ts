export interface HederaContext {
  tokenId: string
  tokenName: string
  tokenSymbol: string
  tokenHashscan: string
  topicId: string
  topicHashscan: string
  initialSharesMinted: number
  agentTopicId: string
  agentUaid: string
  agentHashscan: string
  scheduleId: string
  scheduleHashscan: string
  treasuryAccountId: string
  treasuryHashscan: string
}

export interface VaultTokenResult {
  tokenId: string
  tokenName: string
  tokenSymbol: string
  initialSupply: number
  hashscanUrl: string
}

export type AuditEventType =
  | 'VAULT_INITIALIZED'
  | 'TOKEN_CREATED'
  | 'TOKEN_MINTED'
  | 'SHARES_TRANSFERRED'
  | 'AUDIT_LOG'
  | 'PAYMENT_MADE'
  | 'SCHEDULE_CREATED'
  | 'AGENT_REGISTERED'
  | 'ERROR'
  | 'CYCLE_RESULT'
  | 'MARKET_DISCOVERED'
  | 'AI_DECISION'
  | 'ORDERS_PLACED'
  | 'FILLS_DETECTED'
  | 'SELLS_PLACED'
  | 'RECONCILIATION'
  | 'PNL_UPDATE'

export interface HCSLogPayload {
  event: AuditEventType
  vault_id?: string
  [key: string]: unknown
}

export interface HCSLogResult {
  sequenceNumber: string
  topicId: string
}

export interface HCSMessage {
  sequence_number: number
  consensus_timestamp: string
  message: string
  payer_account_id?: string
  parsed?: Record<string, unknown>
}

export interface TokenInfo {
  token_id: string
  name: string
  symbol: string
  decimals: number
  total_supply: string
  initial_supply: string
  treasury_account_id: string
  custom_fees?: {
    fixed_fees?: Array<{ amount: number; denominator?: number; collector_account_id?: string }>
  }
  memo: string
  created_timestamp: string
}

export interface HederaVaultConfig {
  vaultId: string
  vaultName: string
  policyHash?: string
  initialShares?: number
}

export interface PaymentReceipt {
  txId: string
  amount: string
  consensusTimestamp: string
  hashscanUrl: string
}

export interface AgentIdentity {
  topicId: string
  uaid: string
  hashscanUrl: string
}

export interface ScheduleResult {
  scheduleId: string
  hashscanUrl: string
}

export interface ScheduleStatus {
  executed: boolean
  deleted: boolean
  memo: string | null
  creator: string | null
}
