import {
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
} from '@hashgraph/sdk'
import { getHederaClient } from './client'
import type { AgentIdentity as AgentIdentityType } from '@polyagents/schema'

export async function registerAgentIdentity(
  auditTopicId?: string
): Promise<AgentIdentityType> {
  const { client, operatorId, operatorKey } = getHederaClient()

  const topicTx = await new TopicCreateTransaction()
    .setTopicMemo('PolyAgents Agent Identity — HCS-14 UAID')
    .setAdminKey(operatorKey.publicKey)
    .freezeWith(client)
    .sign(operatorKey)

  const topicResponse = await topicTx.execute(client)
  const topicReceipt = await topicResponse.getReceipt(client)
  const topicId = topicReceipt.topicId!.toString()

  const agentDefinition = {
    p: 'hcs-14',
    op: 'register',
    t_id: topicId,
    m: {
      name: 'PolyAgents',
      description: 'Autonomous AI agent for prediction market vault management on Polymarket',
      version: '1.0.0',
      type: 'financial-agent',
      capabilities: [
        'market-analysis',
        'bid-placement',
        'risk-management',
        'pnl-reconciliation',
      ],
      network: 'hedera-testnet',
      operator: operatorId.toString(),
      audit_topic: auditTopicId ?? 'pending',
      created_at: new Date().toISOString(),
    },
  }

  const msgTx = await new TopicMessageSubmitTransaction()
    .setTopicId(topicReceipt.topicId!)
    .setMessage(JSON.stringify(agentDefinition))
    .freezeWith(client)
    .sign(operatorKey)

  const msgResponse = await msgTx.execute(client)
  await msgResponse.getRecord(client)

  const uaid = `hcs14:hedera:testnet:${topicId}`

  return {
    topicId,
    uaid,
    hashscanUrl: `https://hashscan.io/testnet/topic/${topicId}`,
  }
}
