import { createGateway } from "@ai-sdk/gateway"
import { generateText } from "ai"
import type { MarketContext, TradeDecision } from "@/types/trade-decision"

// Gemini 2.0 Flash Lite pricing per 1M tokens (USD)
const INPUT_COST_PER_TOKEN = 0.075 / 1_000_000
const OUTPUT_COST_PER_TOKEN = 0.30 / 1_000_000
// HBAR reference price for USD→HBAR conversion
const HBAR_USD_PRICE = 0.25
// Minimum payment in HBAR (Hedera tinybar precision)
const MIN_PAYMENT_HBAR = 0.00001

const SYSTEM_PROMPT = `You are an autonomous market-making strategist for a prediction market bot. You analyze 5-minute binary BTC markets (YES/NO outcomes) and decide whether to place passive limit orders.

Strategy: Place $0.01 limit bids on both sides. When filled, sell at $0.02 for 100% spread capture. This is passive market-making -- you only profit from the spread, not from directional bets.

Respond ONLY with valid JSON matching this schema:
{
  "shouldTrade": boolean,
  "direction": "YES" | "NO" | "BOTH" | "NONE",
  "confidence": number (0-1),
  "reasoning": string (brief explanation),
  "suggestedSize": number (USDC amount, typically 10)
}

Rules:
- If odds are already tight (< 2% spread), skip trading
- If time to expiry < 30 seconds, skip new entries
- If inventory is heavily skewed, prefer the opposite side
- If recent PnL is negative, reduce position size
- Default to BOTH sides unless there's a specific reason not to`

const SAFE_DEFAULT: TradeDecision = {
  shouldTrade: false,
  direction: "NONE",
  confidence: 0,
  reasoning: "AI unavailable",
  suggestedSize: 0,
}

function buildUserPrompt(ctx: MarketContext): string {
  return [
    `Question: ${ctx.question}`,
    `Current odds: YES ${ctx.currentOdds.yes} / NO ${ctx.currentOdds.no}`,
    `Time to expiry: ${ctx.timeToExpiry}s`,
    `Inventory: ${ctx.inventory.upShares} UP shares, ${ctx.inventory.downShares} DOWN shares`,
    `Recent PnL: $${ctx.recentPnl.toFixed(4)}`,
    `Order book: YES bid=${ctx.orderBook.yesBid} ask=${ctx.orderBook.yesAsk} | NO bid=${ctx.orderBook.noBid} ask=${ctx.orderBook.noAsk}`,
  ].join("\n")
}

function parseResponse(text: string): TradeDecision | null {
  // Strip markdown fences if present
  const cleaned = text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim()

  const parsed = JSON.parse(cleaned)

  if (
    typeof parsed.shouldTrade !== "boolean" ||
    !["YES", "NO", "BOTH", "NONE"].includes(parsed.direction) ||
    typeof parsed.confidence !== "number" ||
    typeof parsed.reasoning !== "string" ||
    typeof parsed.suggestedSize !== "number"
  ) {
    return null
  }

  return {
    shouldTrade: parsed.shouldTrade,
    direction: parsed.direction,
    confidence: Math.min(1, Math.max(0, parsed.confidence)),
    reasoning: parsed.reasoning,
    suggestedSize: Math.max(0, parsed.suggestedSize),
  }
}

const gateway = createGateway({
  apiKey: process.env.VERCEL_AI_API_KEY ?? "",
})

export async function analyzeMarket(
  context: MarketContext,
): Promise<TradeDecision> {
  console.log("[AI] analyzeMarket called for:", context.question)

  const model = process.env.VERCEL_AI_DEFAULT_MODEL || "google/gemini-2.0-flash-lite"
  const maxTokens = Number(process.env.VERCEL_AI_MAX_TOKENS) || 256

  if (!process.env.VERCEL_AI_API_KEY) {
    console.warn("[AI] VERCEL_AI_API_KEY not set, using SAFE_DEFAULT fallback")
    return SAFE_DEFAULT
  }

  try {
    const userPrompt = buildUserPrompt(context)
    console.log("[AI] Calling Vercel AI Gateway, model:", model)

    const result = await generateText({
      model: gateway(model),
      system: SYSTEM_PROMPT,
      prompt: userPrompt,
      maxOutputTokens: maxTokens,
      temperature: 0.2,
      providerOptions: {
        gateway: {
          only: ["vertex"],
        },
      },
    })

    const content = result.text
    if (!content) {
      console.warn("[AI] No content in response, using SAFE_DEFAULT fallback")
      return SAFE_DEFAULT
    }

    const decision = parseResponse(content)
    if (!decision) {
      console.warn("[AI] Invalid JSON structure from AI:", content.slice(0, 200))
      console.warn("[AI] Using SAFE_DEFAULT fallback")
      return SAFE_DEFAULT
    }

    // Extract token usage and compute cost
    if (result.usage) {
      const promptTokens = result.usage.inputTokens ?? 0
      const completionTokens = result.usage.outputTokens ?? 0
      const costUsd = promptTokens * INPUT_COST_PER_TOKEN + completionTokens * OUTPUT_COST_PER_TOKEN
      const costHbar = Math.max(costUsd / HBAR_USD_PRICE, MIN_PAYMENT_HBAR)
      decision.usage = { promptTokens, completionTokens, costUsd, costHbar }
      console.log(`[AI] Usage: ${promptTokens}+${completionTokens} tokens, $${costUsd.toFixed(6)}, ${costHbar.toFixed(6)} HBAR`)
    }

    return decision
  } catch (error) {
    console.error("[AI] Vercel AI Gateway error:", error)
    console.warn("[AI] Using SAFE_DEFAULT fallback")
    return SAFE_DEFAULT
  }
}
