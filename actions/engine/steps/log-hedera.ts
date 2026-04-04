"use step"

// Workflow step: log cycle result to HCS and execute agent micropayment
// Wraps lib/hedera/hcs-logger.ts + lib/hedera/agent-payment.ts

import type { TradeDecision } from "@/types/trade-decision"
import type { AuditRecord } from "@/types/engine"
import { getRun, addAuditEvent } from "@/actions/engine/store"
import { logToHCS } from "@/lib/hedera/hcs-logger"

export async function logHedera(
  vaultId: string,
  topicId: string | null,
  cycleResult: {
    status: string
    fills: number
    pnl: number
    decision?: TradeDecision
  },
): Promise<{ logged: boolean }> {
  // Log to HCS if topic is configured (payment is handled upstream in trading-cycle step 2)
  if (topicId) {
    console.log(`[log-hedera] logging cycle to HCS`, { vaultId, topicId })
    try {
      const { setActiveTopic } = await import("@/lib/hedera/hcs-logger")
      setActiveTopic(topicId)

      await logToHCS({
        event: "CYCLE_RESULT" as AuditRecord["type"],
        vault_id: vaultId,
        cycle_status: cycleResult.status,
        fills: cycleResult.fills,
        pnl: cycleResult.pnl,
        ai_decision: cycleResult.decision
          ? {
              shouldTrade: cycleResult.decision.shouldTrade,
              direction: cycleResult.decision.direction,
              confidence: cycleResult.decision.confidence,
              reasoning: cycleResult.decision.reasoning,
            }
          : null,
      })
      console.log(`[log-hedera] HCS log success`)
    } catch (err) {
      console.error("[log-hedera] HCS log failed:", err)
    }
  } else {
    console.log(`[log-hedera] no topic configured, skipping`)
  }

  return { logged: !!topicId }
}
