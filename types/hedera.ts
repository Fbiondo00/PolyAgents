// ── Hedera Vault Context (persisted in Vault.hedera) ──

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

// ── HTS Token ──

export interface VaultTokenResult {
  tokenId: string
  tokenName: string
  tokenSymbol: string
  initialSupply: number
  hashscanUrl: string
}

// ── HCS Audit ──

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

export interface HCSLogPayload {
  event: AuditEventType
  vault_id?: string
  [key: string]: unknown
}

export interface HCSLogResult {
  sequenceNumber: string
  topicId: string
}

// ── Mirror Node ──

export interface HCSMessage {
  sequence_number: number
  consensus_timestamp: string
  message: string // base64 encoded
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

// ── Vault Init Config ──

export interface HederaVaultConfig {
  vaultId: string
  vaultName: string
  policyHash?: string
  initialShares?: number
}

// ── Agent Payment ──

export interface PaymentReceipt {
  txId: string
  amount: string
  consensusTimestamp: string
  hashscanUrl: string
}

// ── Agent Identity ──

export interface AgentIdentity {
  topicId: string
  uaid: string
  hashscanUrl: string
}

// ── Scheduled Transaction ──

export interface ScheduleResult {
  scheduleId: string
  hashscanUrl: string
}

export interface ScheduleStatus {
  executed: boolean
  deleted: boolean
  memo: string
  creator: string | null
}
