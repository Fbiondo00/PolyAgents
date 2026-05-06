"use step"

// Workflow step: log cycle result to HCS and execute agent micropayment
// Wraps lib/hedera/hcs-logger.ts + lib/hedera/agent-payment.ts

import type { TradeDecision } from "@/types/trade-decision"
import type { AuditEventType } from "@/types/hedera"
import type { AuditRecord } from "@/types/engine"
import { getRun, addAuditEvent } from "@/actions/engine/store"
import { logToHCS } from "@/lib/hedera/hcs-logger"

/**
 * Log a single engine step to HCS as an individual message.
 * Fire-and-forget — callers should .catch(() => {}) the promise.
 */
export async function logEngineStep(
  topicId: string | null,
  vaultId: string,
  step: string,
  data: Record<string, unknown>,
  cycleNum?: number,
): Promise<void> {
  if (!topicId) return
  try {
    const { setActiveTopic } = await import("@/lib/hedera/hcs-logger")
    setActiveTopic(topicId)
    await logToHCS({
      event: step as AuditEventType,
      vault_id: vaultId,
      step,
      cycle_num: cycleNum,
      ...data,
    })
    console.log(`[log-hedera] ${step} logged to HCS`)
  } catch (err) {
    console.error(`[log-hedera] ${step} HCS log failed:`, err)
  }
}

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
        event: "CYCLE_RESULT" as AuditEventType,
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
