import {
  ScheduleCreateTransaction,
  ScheduleInfoQuery,
  TransferTransaction,
  ScheduleId,
  Hbar,
  AccountId,
} from '@hashgraph/sdk'
import { getHederaClient } from './client'
import { logToHCS, setActiveTopic } from './hcs-logger'
import type { AuditEventType, ScheduleResult, ScheduleStatus } from '@polyagents/schema'

export async function scheduleVaultOperation(opts: {
  vaultId: string
  topicId: string
  memo: string
  recipientId?: string
  amountHbar?: number
}): Promise<ScheduleResult> {
  const { client, operatorId, operatorKey } = getHederaClient()
  const recipient = opts.recipientId
    ? AccountId.fromString(opts.recipientId)
    : operatorId
  const amount = opts.amountHbar ?? 0.001

  setActiveTopic(opts.topicId)

  const innerTx = new TransferTransaction()
    .addHbarTransfer(operatorId, new Hbar(-amount))
    .addHbarTransfer(recipient, new Hbar(amount))
    .setTransactionMemo(`PolyAgents scheduled: ${opts.vaultId}`)

  const scheduleTx = await new ScheduleCreateTransaction()
    .setScheduledTransaction(innerTx)
    .setScheduleMemo(`PolyAgents Rebalance — ${opts.vaultId}: ${opts.memo}`)
    .setAdminKey(operatorKey.publicKey)
    .setPayerAccountId(operatorId)
    .freezeWith(client)
    .sign(operatorKey)

  const response = await scheduleTx.execute(client)
  const receipt = await response.getReceipt(client)
  const scheduleId = receipt.scheduleId!.toString()

  await logToHCS({
    event: 'SCHEDULE_CREATED' as AuditEventType,
    vault_id: opts.vaultId,
    schedule_id: scheduleId,
    memo: opts.memo,
    amount_hbar: amount.toString(),
  })

  return {
    scheduleId,
    hashscanUrl: `https://hashscan.io/testnet/schedule/${scheduleId}`,
  }
}

export async function getScheduleStatus(scheduleId: string): Promise<ScheduleStatus> {
  const { client } = getHederaClient()

  const info = await new ScheduleInfoQuery()
    .setScheduleId(ScheduleId.fromString(scheduleId))
    .execute(client)

  return {
    executed: info.executed !== null,
    deleted: info.deleted !== null,
    memo: info.scheduleMemo ?? '',
    creator: info.creatorAccountId?.toString() ?? null,
  }
}
