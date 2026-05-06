/**
 * PolyAgents Trading Cycle Runner
 *
 * One-shot script that executes a full trading cycle via MCP tools.
 */

const VAULT_ID = process.env.VAULT_ID || "demo-vault"

async function main() {
  console.log(`[polyagents-cycle] starting cycle for vault: ${VAULT_ID}`)

  // The actual cycle logic is handled by the AI agent calling MCP tools.
  // This script serves as the entrypoint that the skill invokes.

  console.log("[polyagents-cycle] cycle complete")
}

main().catch((err) => {
  console.error("[polyagents-cycle] error:", err)
  process.exit(1)
})
