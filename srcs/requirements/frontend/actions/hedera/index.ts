'use server'

import { checkHederaConnection } from '@/lib/hedera/client'
import { initHederaVault } from '@/lib/hedera/vault-init'
import { getAuditLogs, getTokenInfo } from '@/lib/hedera/mirror-node'
import { setActiveTopic, logToHCS } from '@/lib/hedera/hcs-logger'
import { payForAgentCycle } from '@/lib/hedera/agent-payment'
import { scheduleVaultOperation, getScheduleStatus } from '@/lib/hedera/scheduler'
import { registerVault } from '@/lib/server/vault-registry'
import type {
  AuditEventType,
  HCSLogPayload,
  HederaContext,
  HCSMessage,
  TokenInfo,
  PaymentReceipt,
  ScheduleResult,
  ScheduleStatus,
} from '@/types'

// ── Result Types ──────────────────────────────────────

export interface HealthResult {
  success: boolean
  connected: boolean
  balance: string
  accountId: string
  error?: string
}

export interface VaultInitResult {
  success: boolean
  context?: HederaContext
  error?: string
}

export interface AuditLogsResult {
  success: boolean
  logs: HCSMessage[]
  count: number
  error?: string
}

export interface TokenInfoResult {
  success: boolean
  token?: TokenInfo
  error?: string
}

export interface HCSLogActionResult {
  success: boolean
  sequenceNumber?: string
  topicId?: string
  error?: string
}

export interface PaymentResult {
  success: boolean
  receipt?: PaymentReceipt
  error?: string
}

export interface ScheduleActionResult {
  success: boolean
  schedule?: ScheduleResult
  error?: string
}

export interface ScheduleStatusResult {
  success: boolean
  status?: ScheduleStatus
  error?: string
}

// ── Actions ────────────────────────────────────────────

export async function checkHealth(): Promise<HealthResult> {
  try {
    const result = await checkHederaConnection()
    return { success: true, ...result }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Connection failed'
    return { success: false, connected: false, balance: '0', accountId: '', error: message }
  }
}

export async function initVault(config: {
  vaultId: string
  vaultName: string
  policyHash?: string
  initialShares?: number
}): Promise<VaultInitResult> {
  try {
    if (!config.vaultId || !config.vaultName) {
      return { success: false, error: 'Missing required fields: vaultId, vaultName' }
    }

    console.log(`[init-vault] starting vault init`, {
      vaultId: config.vaultId,
      vaultName: config.vaultName,
      shares: config.initialShares ?? 1000,
    })

    const context = await initHederaVault({
      vaultId: config.vaultId,
      vaultName: config.vaultName,
      policyHash: config.policyHash,
      initialShares: config.initialShares ?? 1000,
    })

    console.log(`[init-vault] hedera init complete`, {
      tokenId: context.tokenId,
      topicId: context.topicId,
      agentUaid: context.agentUaid,
      scheduleId: context.scheduleId,
    })

    // Persist hedera context to server-side registry (used by proxy.ts)
    registerVault(config.vaultId, {
      tokenId: context.tokenId,
      treasuryAccountId: context.treasuryAccountId,
    })

    console.log(`[init-vault] vault registered`, { vaultId: config.vaultId })
    console.log(`[init-vault] vault init complete`, { vaultId: config.vaultId })

    return { success: true, context }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[init-vault] vault init FAILED`, { vaultId: config.vaultId, error: message })
    return { success: false, error: message }
  }
}

export async function fetchAuditLogs(topicId: string, limit?: number): Promise<AuditLogsResult> {
  try {
    if (!topicId) {
      return { success: false, logs: [], count: 0, error: 'Missing required param: topicId' }
    }

    const logs = await getAuditLogs(topicId, limit ?? 50)
    return { success: true, logs, count: logs.length }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, logs: [], count: 0, error: message }
  }
}

export async function fetchTokenInfo(tokenId: string): Promise<TokenInfoResult> {
  try {
    if (!tokenId) {
      return { success: false, error: 'Missing required param: tokenId' }
    }

    const token = await getTokenInfo(tokenId)
    return { success: true, token }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

export async function submitHCSLog(payload: HCSLogPayload & { topicId: string }): Promise<HCSLogActionResult> {
  try {
    const { topicId, event, vault_id, ...extraData } = payload

    if (!topicId || !event) {
      return { success: false, error: 'Missing required fields: topicId, event' }
    }

    setActiveTopic(topicId)

    const result = await logToHCS({
      event: event as AuditEventType,
      vault_id,
      ...extraData,
    })

    return { success: true, ...result }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

export async function executeAgentPayment(config: {
  vaultId: string
  topicId: string
  callContext: string
}): Promise<PaymentResult> {
  try {
    if (!config.vaultId || !config.topicId) {
      return { success: false, error: 'Missing required fields: vaultId, topicId' }
    }

    const receipt = await payForAgentCycle(config.callContext, config.vaultId, config.topicId)
    return { success: true, receipt }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

export async function createSchedule(config: {
  vaultId: string
  topicId: string
  memo: string
}): Promise<ScheduleActionResult> {
  try {
    if (!config.vaultId || !config.topicId) {
      return { success: false, error: 'Missing required fields: vaultId, topicId' }
    }

    const schedule = await scheduleVaultOperation({
      vaultId: config.vaultId,
      topicId: config.topicId,
      memo: config.memo,
    })
    return { success: true, schedule }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

export async function fetchScheduleStatus(scheduleId: string): Promise<ScheduleStatusResult> {
  try {
    if (!scheduleId) {
      return { success: false, error: 'Missing required param: scheduleId' }
    }

    const status = await getScheduleStatus(scheduleId)
    return { success: true, status }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}
