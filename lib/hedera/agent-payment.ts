import { TransferTransaction, Hbar, AccountId } from '@hashgraph/sdk'
import { getHederaClient } from './client'
import { logToHCS } from './hcs-logger'
import type { AuditEventType } from '@/types'

export interface PaymentReceipt {
  txId: string
  amount: string
  consensusTimestamp: string
  hashscanUrl: string
  recipient: string
}

/**
 * Execute an autonomous HBAR micropayment for an agent cycle.
 * Logs the payment to HCS for verifiable audit trail.
 *
 * @param callContext - What the payment is for (e.g. "ai-analysis")
 * @param vaultId - Vault identifier
 * @param topicId - HCS audit topic
 * @param costHbar - Exact HBAR amount based on LLM token usage
 *                   Falls back to 0.001 HBAR if not provided.
 */
export async function payForAgentCycle(
  callContext: string,
  vaultId: string,
  topicId: string,
  costHbar?: number
): Promise<PaymentReceipt> {
  const { client, operatorId } = getHederaClient()
  // Use actual LLM cost if provided, otherwise fixed 0.001 HBAR
  const amount = new Hbar(costHbar ?? 0.001)

  // Resolve recipient: env var > operator (self-pay for demo)
  const recipientStr = process.env.HEDERA_PAYMENT_RECIPIENT
  const recipient = recipientStr
    ? AccountId.fromString(recipientStr)
    : operatorId

  // Import active topic for HCS logging
  const { setActiveTopic } = await import('./hcs-logger')
  setActiveTopic(topicId)

  const tx = await new TransferTransaction()
    .addHbarTransfer(operatorId, amount.negated())
    .addHbarTransfer(recipient, amount)
    .setTransactionMemo(`PolyAgents:${vaultId}:${callContext}`)
    .execute(client)

  const record = await tx.getRecord(client)
  const txId = tx.transactionId.toString()
  const timestamp = record.consensusTimestamp.toDate().toISOString()

  // Log payment to HCS for verifiable audit trail
  await logToHCS({
    event: 'PAYMENT_MADE' as AuditEventType,
    vault_id: vaultId,
    amount_hbar: amount.toTinybars().toNumber() / 100_000_000,
    call_context: callContext,
    tx_id: txId,
    consensus_timestamp: timestamp,
    recipient: recipient.toString(),
  })

  return {
    txId,
    amount: `${amount.toTinybars().toNumber() / 100_000_000} ℏ`,
    consensusTimestamp: timestamp,
    hashscanUrl: `https://hashscan.io/testnet/transaction/${txId}`,
    recipient: recipient.toString(),
  }
}
