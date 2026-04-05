// ── ENS Module Stub ──
// Flavio will replace this with real ENS integration (ENS bounty: $2,500).
// All functions return null with console warnings until real implementation arrives.

/** ENS context stored on vault for UI display */
export interface EnsContext {
  /** ENS subname, e.g. "polyagents.eth" */
  name: string
  /** Policy hash committed as text record */
  policyRecordHash: string | null
  /** Resolver address for the subname */
  resolverAddress: string | null
}

/** Commit a policy hash to an ENS text record. Returns txHash or null. */
export async function commitPolicyHash(
  _name: string,
  _hash: string,
): Promise<{ txHash: string } | null> {
  console.warn('[ENS] Stub: commitPolicyHash not yet implemented')
  return null
}

/** Resolve the policy hash stored on an ENS text record. */
export async function resolvePolicyHash(_name: string): Promise<string | null> {
  console.warn('[ENS] Stub: resolvePolicyHash not yet implemented')
  return null
}

/** Get the ENS context for a vault. Returns null until Flavio wires real ENS. */
export function getEnsContext(_vaultId: string): EnsContext | null {
  return null
}
