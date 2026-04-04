import { TransferTransaction, Hbar } from '@hashgraph/sdk'
import { getHederaClient } from './client'
import { logToHCS } from './hcs-logger'
import type { AuditEventType } from '@/types'

export interface PaymentReceipt {
  txId: string
  amount: string
  consensusTimestamp: string
  hashscanUrl: string
}

/**
 * Execute an autonomous HBAR micropayment for an agent cycle.
 * Logs the payment to HCS for verifiable audit trail.
 */
export async function payForAgentCycle(
  callContext: string,
  vaultId: string,
  topicId: string
): Promise<PaymentReceipt> {
  const { client, operatorId } = getHederaClient()
  const amount = new Hbar(0.001)

  // Import active topic for HCS logging
  const { setActiveTopic } = await import('./hcs-logger')
  setActiveTopic(topicId)

  const tx = await new TransferTransaction()
    .addHbarTransfer(operatorId, amount.negated())
    .addHbarTransfer(operatorId, amount) // self-pay for demo; treasury in prod
    .setTransactionMemo(`PolyAgents:${vaultId}:${callContext}`)
    .execute(client)

  const record = await tx.getRecord(client)
  const txId = tx.transactionId.toString()
  const timestamp = record.consensusTimestamp.toDate().toISOString()

  // Log payment to HCS for verifiable audit trail
  await logToHCS({
    event: 'PAYMENT_MADE' as AuditEventType,
    vault_id: vaultId,
    amount_hbar: '0.001',
    call_context: callContext,
    tx_id: txId,
    consensus_timestamp: timestamp,
  })

  return {
    txId,
    amount: '0.001 ℏ',
    consensusTimestamp: timestamp,
    hashscanUrl: `https://hashscan.io/testnet/transaction/${txId}`,
  }
}
