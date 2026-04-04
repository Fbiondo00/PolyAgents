import {
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  TopicId,
} from '@hashgraph/sdk'
import { getHederaClient } from './client'
import type { AuditEventType, HCSLogPayload, HCSLogResult } from '@/types'

let activeTopicId: TopicId | null = null

export async function createVaultAuditTopic(
  vaultId: string
): Promise<{ topicId: string; hashscanUrl: string }> {
  const { client, operatorKey } = getHederaClient()

  const tx = await new TopicCreateTransaction()
    .setTopicMemo(`PolyAgents Audit Log — ${vaultId}`)
    .setSubmitKey(operatorKey.publicKey)
    .setAdminKey(operatorKey.publicKey)
    .freezeWith(client)
    .sign(operatorKey)

  const response = await tx.execute(client)
  const receipt = await response.getReceipt(client)
  const topicId = receipt.topicId!

  activeTopicId = topicId

  return {
    topicId: topicId.toString(),
    hashscanUrl: `https://hashscan.io/testnet/topic/${topicId}`,
  }
}

export function setActiveTopic(topicIdStr: string): void {
  activeTopicId = TopicId.fromString(topicIdStr)
}

export function getActiveTopicId(): string | null {
  return activeTopicId?.toString() ?? null
}

export async function logToHCS(
  payload: HCSLogPayload
): Promise<HCSLogResult> {
  if (!activeTopicId) {
    throw new Error('HCS topic not initialized. Call createVaultAuditTopic or setActiveTopic first.')
  }

  const { client, operatorKey } = getHederaClient()

  const message = JSON.stringify({
    ...payload,
    agent: 'PolyAgents-v1',
    network: 'hedera-testnet',
    ts: new Date().toISOString(),
  })

  const tx = await new TopicMessageSubmitTransaction()
    .setTopicId(activeTopicId)
    .setMessage(message)
    .setMaxChunks(10)
    .freezeWith(client)
    .sign(operatorKey)

  const response = await tx.execute(client)
  const receipt = await response.getReceipt(client)

  return {
    sequenceNumber: receipt.topicSequenceNumber?.toString() ?? 'unknown',
    topicId: activeTopicId.toString(),
  }
}
