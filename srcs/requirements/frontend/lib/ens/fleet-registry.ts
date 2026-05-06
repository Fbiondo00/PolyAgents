import { setTextRecord, readTextRecord } from "./subname"
import { ENS_BASE_DOMAIN } from "./client"

const MAX_FLEET_SIZE = 100

/**
 * Register a new agent in the fleet registry on the parent domain.
 * Uses text record "fleet.agent.{n}" keys on polyagents.eth.
 * Value format: "ensName|vaultId|type|status"
 */
export async function registerAgentInFleet(
  vaultId: string,
  ensName: string,
  agentType: string = "trading-vault"
): Promise<string | null> {
  for (let i = 0; i < MAX_FLEET_SIZE; i++) {
    const existing = await readTextRecord(
      ENS_BASE_DOMAIN,
      `fleet.agent.${i}`
    )
    if (!existing) {
      const value = `${ensName}|${vaultId}|${agentType}|active`
      return setTextRecord(ENS_BASE_DOMAIN, `fleet.agent.${i}`, value)
    }
  }
  return null
}

export interface FleetAgent {
  ensName: string
  vaultId: string
  type: string
  status: "active" | "paused" | "error"
  index: number
}

/**
 * Get the list of all registered agents from the fleet registry.
 */
export async function getFleetAgents(): Promise<FleetAgent[]> {
  const agents: FleetAgent[] = []

  for (let i = 0; i < MAX_FLEET_SIZE; i++) {
    const value = await readTextRecord(ENS_BASE_DOMAIN, `fleet.agent.${i}`)
    if (!value) break

    const parts = value.split("|")
    agents.push({
      ensName: parts[0] || "",
      vaultId: parts[1] || "",
      type: parts[2] || "trading-vault",
      status: (parts[3] as FleetAgent["status"]) || "active",
      index: i,
    })
  }

  return agents
}

/**
 * Update agent status in the fleet registry.
 */
export async function updateFleetAgentStatus(
  index: number,
  status: "active" | "paused" | "error"
): Promise<string | null> {
  const value = await readTextRecord(ENS_BASE_DOMAIN, `fleet.agent.${index}`)
  if (!value) return null

  const parts = value.split("|")
  parts[3] = status
  return setTextRecord(ENS_BASE_DOMAIN, `fleet.agent.${index}`, parts.join("|"))
}
