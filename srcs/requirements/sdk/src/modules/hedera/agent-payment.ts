import { TransferTransaction, Hbar, AccountId } from '@hashgraph/sdk'
import { getHederaClient } from './client'
import { logToHCS, setActiveTopic } from './hcs-logger'
import type { AuditEventType, PaymentReceipt } from '@polyagents/schema'

export async function payForAgentCycle(
  callContext: string,
  vaultId: string,
  topicId: string,
  costHbar?: number
): Promise<PaymentReceipt> {
  const { client, operatorId } = getHederaClient()
  const amount = new Hbar(costHbar ?? 0.001)

  const recipientStr = process.env.HEDERA_PAYMENT_RECIPIENT
  const recipient = recipientStr
    ? AccountId.fromString(recipientStr)
    : operatorId

  setActiveTopic(topicId)

  const tx = await new TransferTransaction()
    .addHbarTransfer(operatorId, amount.negated())
    .addHbarTransfer(recipient, amount)
    .setTransactionMemo(`PolyAgents:${vaultId}:${callContext}`)
    .execute(client)

  const record = await tx.getRecord(client)
  const txId = tx.transactionId.toString()
  const timestamp = record.consensusTimestamp.toDate().toISOString()

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
  }
}
