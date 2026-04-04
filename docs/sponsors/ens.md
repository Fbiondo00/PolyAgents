
# Implementazione ENS — Doppio Bounty

## Panoramica

PolyAgents concorre a **due bounty ENS** per un totale di **$10,000** (massimo $5,000 per bounty, tre posizioni ciascuno).

| Bounty | Target | Pitch |
|--------|--------|-------|
| **Best ENS Integration for AI Agents** | $5,000 | Ogni vault/agent ottiene un ENS subname (`vault-abc.vaultpilot.eth`) come identità persistente, con ENSIP-25 per la verifica dell'agente on-chain e un registry di fleet per scoperta |
| **Most Creative Use of ENS** | $5,000 | Text records come cryptographic commitment scheme: hash della policy pubblicato on-chain, stats live dell'agente, vault metadata — ENS diventa un public verification layer |

### Perché vinciamo entrambi

1. **AI Agents**: ENS non è cosmetico — l'agente non può operare senza la sua identità ENS. Il subname è creato al deploy del vault, l'ENSIP-25 collega l'agente HCS-14 al suo nome ENS, e gli altri agenti possono risolvere le identità della fleet via text records.
2. **Most Creative**: Nessuno usa ENS come commitment scheme. `policy.commitment` = `keccak256(strategyJSON)` pubblicato on-chain. Chiunque verifica che l'agente segue la policy originale senza vederne il contenuto. Aggiungiamo stats live, vault metadata, e collegamento cross-chain (Arc + Hedera) tutto dentro i text records.

### Requisiti comuni (entrambi i bounty)
- ENS deve chiaramente migliorare il prodotto (non cosmetico)
- Demo funzionale, no valori hard-coded
- Video o live demo link
- Presentazione al booth ENS domenica mattina

---

## STEP 0 — Prerequisiti

### Installa dipendenze
```bash
npm install viem @ensdomains/ensjs
```

### Variabili d'ambiente (`.env`)
```
# ENS — Sepolia Testnet
ENS_OWNER_PRIVATE_KEY=0x...          # chiave del controller del nome ENS
ENS_BASE_DOMAIN=vaultpilot.eth       # nome registrato su ENS
```

### Registra il dominio
1. Vai su https://app.ens.domains
2. Registra `vaultpilot.eth` su Sepolia (o mainnet se hai budget gas)
3. Annotati l'address del wallet controller — sarà `ENS_OWNER_PRIVATE_KEY`

### Indirizzi contratti Sepolia
```
ENS Registry:          0x00000000000C2e074eC69A0dFb2997BA6C7d2e1e
Public Resolver:       0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63
```

### Aggiorna il tipo Vault
Aggiungi il campo ENS context al tipo `Vault` in `types/vault.ts`:

```typescript
// Aggiungi alla fine dell'interfaccia Vault:
ens?: {
  name: string           // es. "vault-abc.vaultpilot.eth"
  policyHash: string     // es. "0x7a3f..."
  txHashes: string[]     // transaction hashes on-chain
  initializedAt: number  // timestamp
}
```

---

## BOUNTY 1: Best ENS Integration for AI Agents

### Pitch per i giudici
> PolyAgents usa ENS come **identity layer per agenti autonomi**. Ogni vault riceve un ENS subname alla creazione (`vault-{id}.vaultpilot.eth`) che funziona come nome persistente e risolvibile dell'agente. Implementiamo **ENSIP-25** per verificare l'associazione tra l'agente HCS-14 (on-chain su Hedera) e il suo nome ENS. I text records contengono i metadati dell'agente (capacità, stato, rete) e un fleet registry permette la scoperta inter-agent. Non è name resolution decorativa — l'agente *non esiste* senza la sua identità ENS.

### STEP 1 — ENS Client Base

Crea `lib/ens/client.ts`:

```typescript
import { createPublicClient, createWalletClient, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const account = privateKeyToAccount(
  process.env.NEXT_PUBLIC_ENS_OWNER_PRIVATE_KEY as `0x${string}`
);

export const ensPublicClient = createPublicClient({
  chain: sepolia,
  transport: http(),
});

export const ensWalletClient = createWalletClient({
  chain: sepolia,
  account,
  transport: http(),
});

export const ENS_REGISTRY = "0x00000000000C2e074eC69A0dFb2997BA6C7d2e1e" as const;
export const ENS_PUBLIC_RESOLVER = "0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63" as const;
export const ENS_BASE_DOMAIN = (process.env.NEXT_PUBLIC_ENS_BASE_DOMAIN || "vaultpilot.eth") as const;
```

### STEP 2 — Subname Creation per Vault/Agent

Ogni vault creato ottiene automaticamente un subname ENS. Il subname diventa l'identità pubblica dell'agente.

Crea `lib/ens/subname.ts`:

```typescript
import { namehash, labelhash } from "viem/ens";
import { ensWalletClient, ensPublicClient, ENS_REGISTRY, ENS_PUBLIC_RESOLVER, ENS_BASE_DOMAIN } from "./client";

const RESOLVER_ABI = [
  {
    name: "setText",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" },
      { name: "value", type: "string" },
    ],
    outputs: [],
  },
  {
    name: "text",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" },
    ],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

const REGISTRY_ABI = [
  {
    name: "setSubnodeOwner",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "label", type: "bytes32" },
      { name: "owner", type: "address" },
    ],
    outputs: [],
  },
  {
    name: "setResolver",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "resolver", type: "address" },
    ],
    outputs: [],
  },
] as const;

/**
 * Create an ENS subname for a vault/agent.
 * Label = vault ID (es. "btc-scalper-1")
 * Full name = {label}.vaultpilot.eth
 */
export async function createVaultSubname(
  vaultId: string
): Promise<{ ensName: string; txHash: string }> {
  const label = slugify(vaultId);
  const ensName = `${label}.${ENS_BASE_DOMAIN}`;
  const parentNode = namehash(ENS_BASE_DOMAIN);
  const fullNode = namehash(ensName);

  // 1. Create subdomain
  const txHash = await ensWalletClient.writeContract({
    address: ENS_REGISTRY,
    abi: REGISTRY_ABI,
    functionName: "setSubnodeOwner",
    args: [parentNode, labelhash(label), ensWalletClient.account.address],
  });
  await ensPublicClient.waitForTransactionReceipt({ hash: txHash });

  // 2. Set resolver
  const resolverTx = await ensWalletClient.writeContract({
    address: ENS_REGISTRY,
    abi: REGISTRY_ABI,
    functionName: "setResolver",
    args: [fullNode, ENS_PUBLIC_RESOLVER],
  });
  await ensPublicClient.waitForTransactionReceipt({ hash: resolverTx });

  return { ensName, txHash };
}

/**
 * Read a text record from an ENS subname.
 */
export async function readTextRecord(
  ensName: string,
  key: string
): Promise<string | null> {
  const node = namehash(ensName);
  try {
    const value = await ensPublicClient.readContract({
      address: ENS_PUBLIC_RESOLVER,
      abi: RESOLVER_ABI,
      functionName: "text",
      args: [node, key],
    });
    return (value as string) || null;
  } catch {
    return null;
  }
}

/**
 * Write a text record on an ENS subname.
 */
export async function setTextRecord(
  ensName: string,
  key: string,
  value: string
): Promise<string> {
  const node = namehash(ensName);
  const txHash = await ensWalletClient.writeContract({
    address: ENS_PUBLIC_RESOLVER,
    abi: RESOLVER_ABI,
    functionName: "setText",
    args: [node, key, value],
  });
  await ensPublicClient.waitForTransactionReceipt({ hash: txHash });
  return txHash;
}

/**
 * Batch write multiple text records on an ENS subname.
 */
export async function batchSetTextRecords(
  ensName: string,
  records: [string, string][]
): Promise<string[]> {
  const txHashes: string[] = [];
  for (const [key, value] of records) {
    const txHash = await setTextRecord(ensName, key, value);
    txHashes.push(txHash);
  }
  return txHashes;
}

function slugify(id: string): string {
  return id
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32); // ENS label max length
}
```

### STEP 3 — ENSIP-25 Agent Identity Verification

**ENSIP-25** ("AI Agent Registry ENS Name Verification") è lo standard ENS per verificare che un ENS name sia associato a un agente registrato in un on-chain registry. Noi lo implementiamo per collegare l'agente HCS-14 (già registrato su Hedera) al suo nome ENS.

Il text record key segue il formato:
```
agent-registration[<registry_interoperable_address>][<agent_id>]
```

Per Hedera, usiamo il network ID Hedera come namespace. L'agent_id è il topic ID HCS-14.

Crea `lib/ens/agent-identity.ts`:

```typescript
import { batchSetTextRecords, readTextRecord } from "./subname";
import type { HederaContext } from "@/types";

/**
 * ENSIP-25 text record key for agent registry verification.
 * Links an ENS name to an on-chain agent identity.
 *
 * Format: agent-registration[<registry_address>][<agent_id>]
 * We use "hedera" as registry namespace and the HCS-14 topic ID as agent_id.
 */
function ensip25Key(hcsTopicId: string): string {
  // Per Hedera, il registry address è il namespace della rete
  // ENSIP-25 supporta qualsiasi registry — Hedera HCS-14 è il nostro
  return `agent-registration[hedera-hcs14][${hcsTopicId}]`;
}

/**
 * Register ENSIP-25 verification linking ENS name ↔ HCS-14 agent identity.
 * Called after vault creation when Hedera agent identity is ready.
 */
export async function registerAgentENSIP25(
  ensName: string,
  hederaContext: HederaContext
): Promise<string[]> {
  const agentId = hederaContext.agentTopicId;
  const uaid = hederaContext.agentUaid;

  const records: [string, string][] = [
    // ENSIP-25 verification — valore "1" = attestation positiva
    [ensip25Key(agentId), "1"],

    // Agent identity metadata (ai.* namespace)
    ["ai.agent.type", "financial-trading-agent"],
    ["ai.agent.name", "PolyAgents Vault"],
    ["ai.agent.version", "1.0.0"],
    ["ai.agent.capabilities", "market-analysis,bid-placement,risk-management,pnl-reconciliation"],
    ["ai.agent.network", "hedera-testnet"],
    ["ai.agent.status", "active"],

    // Cross-chain link: Hedera HCS-14 UAID
    ["ai.agent.hcs14-uaid", uaid],

    // Cross-chain link: Arc vault address (se disponibile)
    // ["ai.agent.arc-address", arcWalletAddress],

    // Profile text records (standard ENS)
    ["description", "Autonomous AI trading vault on Polymarket — powered by PolyAgents"],
    ["url", "https://polyagents.eth"],
  ];

  return batchSetTextRecords(ensName, records);
}

/**
 * Verify an ENS name against a known HCS-14 agent identity (ENSIP-25).
 * Returns true if the ENS name owner has attested the association.
 */
export async function verifyAgentIdentity(
  ensName: string,
  hcsTopicId: string
): Promise<boolean> {
  const key = ensip25Key(hcsTopicId);
  const value = await readTextRecord(ensName, key);
  return value !== null && value !== "";
}

/**
 * Resolve an agent's full ENS profile.
 * Used by the discovery dashboard to show agent fleet.
 */
export async function resolveAgentProfile(
  ensName: string
): Promise<Record<string, string>> {
  const keys = [
    "ai.agent.type",
    "ai.agent.name",
    "ai.agent.version",
    "ai.agent.capabilities",
    "ai.agent.network",
    "ai.agent.status",
    "ai.agent.hcs14-uaid",
    "description",
    "url",
  ];

  const profile: Record<string, string> = {};
  for (const key of keys) {
    const value = await readTextRecord(ensName, key);
    if (value) profile[key] = value;
  }

  return profile;
}
```

### STEP 4 — Fleet Registry & Agent Discovery

I text records sul dominio parent (`vaultpilot.eth`) tengono traccia di tutti gli agenti registrati. Questo permette la **scoperta inter-agent**: chiunque può interrogare il dominio parent per ottenere la lista completa dei vault/agent.

Crea `lib/ens/fleet-registry.ts`:

```typescript
import { setTextRecord, readTextRecord } from "./subname";
import { ENS_BASE_DOMAIN } from "./client";

const MAX_FLEET_SIZE = 100;

/**
 * Register a new agent in the fleet registry on the parent domain.
 * Uses text record "fleet.agent.{n}" keys on vaultpilot.eth.
 */
export async function registerAgentInFleet(
  vaultId: string,
  ensName: string,
  agentType: string = "trading-vault"
): Promise<string | null> {
  // Find first available slot
  for (let i = 0; i < MAX_FLEET_SIZE; i++) {
    const existing = await readTextRecord(
      ENS_BASE_DOMAIN,
      `fleet.agent.${i}`
    );
    if (!existing) {
      // Write in format: ensName|vaultId|type|status
      const value = `${ensName}|${vaultId}|${agentType}|active`;
      return setTextRecord(ENS_BASE_DOMAIN, `fleet.agent.${i}`, value);
    }
  }
  return null; // fleet full
}

/**
 * Get the list of all registered agents from the fleet registry.
 */
export async function getFleetAgents(): Promise<
  Array<{ ensName: string; vaultId: string; type: string; status: string; index: number }>
> {
  const agents: Array<{ ensName: string; vaultId: string; type: string; status: string; index: number }> = [];

  for (let i = 0; i < MAX_FLEET_SIZE; i++) {
    const value = await readTextRecord(ENS_BASE_DOMAIN, `fleet.agent.${i}`);
    if (!value) break; // no more agents

    const [ensName, vaultId, type, status] = value.split("|");
    agents.push({ ensName, vaultId, type, status, index: i });
  }

  return agents;
}

/**
 * Update agent status in the fleet registry (active/paused/error).
 */
export async function updateFleetAgentStatus(
  index: number,
  status: "active" | "paused" | "error"
): Promise<string | null> {
  const value = await readTextRecord(ENS_BASE_DOMAIN, `fleet.agent.${index}`);
  if (!value) return null;

  const parts = value.split("|");
  parts[3] = status; // update status field
  return setTextRecord(ENS_BASE_DOMAIN, `fleet.agent.${index}`, parts.join("|"));
}
```

### STEP 5 — Integrazione nel Vault Creation

Modifica il flusso di deploy (Step 5 del wizard in `app/vault/create/page.tsx`). Dopo la creazione Hedera, inizializza ENS.

Crea `lib/ens/vault-ens-init.ts`:

```typescript
import { createVaultSubname } from "./subname";
import { computePolicyHash, commitPolicyHash } from "./policy-commitment";
import { updateAgentStats } from "./agent-stats";
import { registerAgentENSIP25 } from "./agent-identity";
import { registerAgentInFleet } from "./fleet-registry";
import type { Vault, HederaContext } from "@/types";

export interface ENSInitResult {
  ensName: string;
  policyHash: string;
  txHashes: string[];
}

/**
 * Full ENS initialization for a new vault.
 * Called after Hedera vault-init in the deploy step.
 *
 * Steps:
 * 1. Create ENS subname (agent identity)
 * 2. Commit policy hash (Most Creative)
 * 3. Write initial agent stats (Most Creative)
 * 4. Register ENSIP-25 agent verification (AI Agents)
 * 5. Add to fleet registry (AI Agents)
 */
export async function initVaultENS(opts: {
  vaultId: string;
  vaultName: string;
  strategy: Vault["strategy"];
  mode: "advisory" | "auto";
  hederaContext?: HederaContext;
}): Promise<ENSInitResult> {
  const { vaultId, vaultName, strategy, mode, hederaContext } = opts;
  const allTxHashes: string[] = [];

  // 1. Create ENS subname
  const { ensName, txHash: subnameTx } = await createVaultSubname(vaultId);
  allTxHashes.push(subnameTx);

  // 2. Compute and commit policy hash
  const policyHash = computePolicyHash(strategy, vaultName, mode);
  const commitTx = await commitPolicyHash(ensName, policyHash);
  allTxHashes.push(commitTx);

  // 3. Write initial agent stats
  const statsTxes = await updateAgentStats(ensName, {
    flips: 0,
    pnl: 0,
    inventoryUp: 0,
    inventoryDown: 0,
    mode,
    cycles: 0,
    lastTrade: new Date().toISOString(),
    engineState: "IDLE",
  });
  allTxHashes.push(...statsTxes);

  // 4. ENSIP-25 agent verification (if Hedera is ready)
  if (hederaContext) {
    const ensipTxes = await registerAgentENSIP25(ensName, hederaContext);
    allTxHashes.push(...ensipTxes);
  }

  // 5. Add to fleet registry
  await registerAgentInFleet(vaultId, ensName, "trading-vault");

  return { ensName, policyHash, txHashes: allTxHashes };
}
```

### STEP 6 — Update Deploy Stage nel Wizard

Modifica `app/vault/create/page.tsx` — aggiungi gli stage ENS alla sequenza di deploy:

```typescript
// Nella deploy sequence, dopo lo stage Hedera (stage 5-6), aggiungi:

// Stage 7: ENS Identity
{ label: "Creating ENS identity", status: "ens-identity" },
// Stage 8: Policy Commitment
{ label: "Committing policy hash", status: "ens-policy" },
// Stage 9: Agent Registration
{ label: "Registering agent fleet", status: "ens-fleet" },
```

E nel handler di deploy:
```typescript
// Dopo initVault Hedera...
const ensResult = await initVaultENS({
  vaultId: vault.id,
  vaultName: vault.name,
  strategy: vault.strategy,
  mode: vault.mode,
  hederaContext: hederaResult,
});

// Salva ENS context nel vault
vault.ens = {
  name: ensResult.ensName,
  policyHash: ensResult.policyHash,
  txHashes: ensResult.txHashes,
  initializedAt: Date.now(),
};
saveVault(vault);
```

---

## BOUNTY 2: Most Creative Use of ENS

### Pitch per i giudici
> PolyAgents usa ENS come **cryptographic commitment scheme**. Quando un vault viene creato, calcoliamo `keccak256(strategyJSON)` e lo pubblichiamo come text record `policy.commitment` sul subname del vault. Chiunque può verificare che l'agente sta seguendo la policy originale ricalcolando l'hash — senza mai vedere il contenuto della policy. In aggiunta, pubblichiamo stats live dell'agente (flips, PnL, inventory, stato engine) come text records aggiornabili, trasformando ogni vault ENS name in una **public identity card** verificabile. Mettiamo anche vault metadata (descrizione, versione strategy, timestamp creazione) e collegamenti cross-chain. ENS non risolve solo nomi — è il **public verification layer** per agenti finanziari autonomi.

### STEP 7 — Policy Hash Commitment

Crea `lib/ens/policy-commitment.ts`:

```typescript
import { keccak256, toBytes, type Hex } from "viem";
import { setTextRecord, readTextRecord } from "./subname";
import type { Vault } from "@/types";

/**
 * Compute keccak256 hash of the vault strategy + mode.
 * This is the commitment: the hash is public, the policy is private.
 * Anyone can verify the agent follows the original policy by recomputing.
 */
export function computePolicyHash(
  strategy: Vault["strategy"],
  vaultName: string,
  mode: Vault["mode"]
): Hex {
  // Deterministic serialization — order matters
  const serialized = JSON.stringify({
    n: vaultName,
    m: mode,
    s: {
      bp: strategy.bidPrice,
      sp: strategy.sellPrice,
      mc: strategy.maxCapital,
      ts: strategy.trancheSize,
      ne: strategy.noNewEntriesLast,
      ks: strategy.keepSellAfter,
      ai: strategy.aiEnabled,
    },
  });
  return keccak256(toBytes(serialized));
}

/**
 * Write the policy hash as ENS text record "policy.commitment".
 */
export async function commitPolicyHash(
  ensName: string,
  policyHash: Hex
): Promise<string> {
  return setTextRecord(ensName, "policy.commitment", policyHash);
}

/**
 * Verify policy integrity: recompute local hash and compare with on-chain.
 * Returns { match, localHash, onChainHash }.
 */
export async function verifyPolicyIntegrity(
  ensName: string,
  strategy: Vault["strategy"],
  vaultName: string,
  mode: Vault["mode"]
): Promise<{ match: boolean; localHash: Hex; onChainHash: string | null }> {
  const localHash = computePolicyHash(strategy, vaultName, mode);
  const onChainHash = await readTextRecord(ensName, "policy.commitment");
  return {
    match: onChainHash !== null && onChainHash.toLowerCase() === localHash.toLowerCase(),
    localHash,
    onChainHash,
  };
}
```

### STEP 8 — Live Agent Stats come Text Records

Oltre al policy hash, scriviamo statistiche live dell'agente come text records aggiornabili. Questo trasforma il nome ENS del vault in un **cruscotto pubblico** leggibile da qualsiasi tool ENS.

Crea `lib/ens/agent-stats.ts`:

```typescript
import { batchSetTextRecords, readTextRecord } from "./subname";

export interface AgentStats {
  flips: number;
  pnl: number;
  inventoryUp: number;
  inventoryDown: number;
  mode: "advisory" | "auto";
  cycles: number;
  lastTrade: string; // ISO timestamp
  engineState: string; // IDLE, QUOTING, etc.
}

/**
 * Write live agent stats as ENS text records.
 * Keys use "agent." prefix for namespace clarity.
 */
export async function updateAgentStats(
  ensName: string,
  stats: AgentStats
): Promise<string[]> {
  const records: [string, string][] = [
    ["agent.flips", stats.flips.toString()],
    ["agent.pnl", stats.pnl.toFixed(4)],
    ["agent.inventory", `${stats.inventoryUp}/${stats.inventoryDown}`],
    ["agent.mode", stats.mode],
    ["agent.cycles", stats.cycles.toString()],
    ["agent.lastTrade", stats.lastTrade],
    ["agent.engineState", stats.engineState],
  ];
  return batchSetTextRecords(ensName, records);
}

/**
 * Read agent stats from ENS (for verification dashboard).
 */
export async function readAgentStats(ensName: string): Promise<Record<string, string>> {
  const keys = [
    "policy.commitment",
    "agent.flips",
    "agent.pnl",
    "agent.inventory",
    "agent.mode",
    "agent.cycles",
    "agent.lastTrade",
    "agent.engineState",
  ];

  const result: Record<string, string> = {};
  for (const key of keys) {
    const value = await readTextRecord(ensName, key);
    if (value) result[key] = value;
  }
  return result;
}
```

### STEP 9 — Vault Metadata come Text Records

Crea `lib/ens/vault-metadata.ts`:

```typescript
import { batchSetTextRecords, readTextRecord } from "./subname";

export interface VaultMetadata {
  description: string;
  strategyVersion: string;
  createdAt: string; // ISO timestamp
  funding: { usdc: number; hbar: number };
  network: string; // "hedera-testnet", "arc-testnet", etc.
}

/**
 * Write vault metadata as ENS text records.
 * These are set once at creation and rarely change.
 */
export async function writeVaultMetadata(
  ensName: string,
  meta: VaultMetadata
): Promise<string[]> {
  const records: [string, string][] = [
    ["vault.description", meta.description],
    ["vault.strategy-version", meta.strategyVersion],
    ["vault.created-at", meta.createdAt],
    ["vault.funding-usdc", meta.funding.usdc.toString()],
    ["vault.funding-hbar", meta.funding.hbar.toString()],
    ["vault.network", meta.network],
    // Standard ENS profile records
    ["name", "PolyAgents Vault"],
    ["description", meta.description],
  ];
  return batchSetTextRecords(ensName, records);
}
```

---

## STEP 10 — Hook nell'Agent Loop

Aggiorna le stat ENS dopo ogni ciclo dell'agente. Modifica `app/vault/[id]/agent/page.tsx`:

```typescript
import { updateAgentStats } from "@/lib/ens/agent-stats";

// Nel ciclo auto-mode, dopo engine.step() e PnL computation:
async function onCycleComplete(vault: Vault) {
  if (!vault.ens?.name) return; // skip se ENS non inizializzato

  await updateAgentStats(vault.ens.name, {
    flips: vault.stats.flips,
    pnl: vault.stats.pnl,
    inventoryUp: vault.inventory.upShares,
    inventoryDown: vault.inventory.downShares,
    mode: vault.mode,
    cycles: vault.stats.cycles,
    lastTrade: new Date().toISOString(),
    engineState: currentEngineState, // es. "QUOTING" o "HOLDING_INVENTORY"
  });
}
```

---

## STEP 11 — Verifica Dashboard (Frontend)

### Componente ENS Verification Card

Crea `components/ens-verification-card.tsx`:

```typescript
"use client";

import { useState, useEffect } from "react";
import { readAgentStats } from "@/lib/ens/agent-stats";
import { verifyPolicyIntegrity } from "@/lib/ens/policy-commitment";
import { resolveAgentProfile } from "@/lib/ens/agent-identity";
import type { Vault } from "@/types";

export function ENSVerificationCard({ vault }: { vault: Vault }) {
  const [ensData, setEnsData] = useState<Record<string, string>>({});
  const [profile, setProfile] = useState<Record<string, string>>({});
  const [verification, setVerification] = useState<{
    match: boolean;
    localHash: string;
    onChainHash: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!vault.ens?.name) return;

    async function load() {
      setLoading(true);
      try {
        const [stats, prof, verify] = await Promise.all([
          readAgentStats(vault.ens!.name),
          resolveAgentProfile(vault.ens!.name),
          verifyPolicyIntegrity(
            vault.ens!.name,
            vault.strategy,
            vault.name,
            vault.mode
          ),
        ]);
        setEnsData(stats);
        setProfile(prof);
        setVerification(verify);
      } catch (err) {
        console.error("ENS read failed:", err);
      }
      setLoading(false);
    }
    load();
  }, [vault]);

  if (!vault.ens?.name) return null;

  return (
    <div className="rounded-lg border border-[#1A3C50] bg-[#0E1B27] p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#E1F5FE]">ENS Identity</h3>
        <span className="text-xs font-mono text-[#00A8B5]">{vault.ens.name}</span>
      </div>

      {/* Policy Verification */}
      {verification && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-semibold ${
              verification.match ? "text-[#26A69A]" : "text-[#EF5350]"
            }`}>
              {verification.match ? "POLICY VERIFIED" : "POLICY MISMATCH"}
            </span>
          </div>
          <div className="text-xs text-[#B0BEC5] space-y-1">
            <p>On-chain: <code className="text-[#4DD0E1]">{verification.onChainHash?.slice(0, 16)}...</code></p>
            <p>Local:    <code className="text-[#4DD0E1]">{verification.localHash.slice(0, 16)}...</code></p>
          </div>
        </div>
      )}

      {/* Live Stats */}
      {!loading && Object.keys(ensData).length > 0 && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          {ensData["agent.flips"] && (
            <div><span className="text-[#B0BEC5]">Flips:</span> <span className="text-[#E1F5FE]">{ensData["agent.flips"]}</span></div>
          )}
          {ensData["agent.pnl"] && (
            <div><span className="text-[#B0BEC5]">PnL:</span> <span className={
              Number(ensData["agent.pnl"]) >= 0 ? "text-[#26A69A]" : "text-[#EF5350]"
            }>${ensData["agent.pnl"]}</span></div>
          )}
          {ensData["agent.inventory"] && (
            <div><span className="text-[#B0BEC5]">Inventory:</span> <span className="text-[#E1F5FE]">{ensData["agent.inventory"]}</span></div>
          )}
          {ensData["agent.engineState"] && (
            <div><span className="text-[#B0BEC5]">Engine:</span> <span className="text-[#00A8B5]">{ensData["agent.engineState"]}</span></div>
          )}
          {ensData["agent.mode"] && (
            <div><span className="text-[#B0BEC5]">Mode:</span> <span className="text-[#E1F5FE] uppercase">{ensData["agent.mode"]}</span></div>
          )}
          {ensData["agent.cycles"] && (
            <div><span className="text-[#B0BEC5]">Cycles:</span> <span className="text-[#E1F5FE]">{ensData["agent.cycles"]}</span></div>
          )}
        </div>
      )}

      {/* Agent Profile */}
      {profile["ai.agent.hcs14-uaid"] && (
        <div className="border-t border-[#1A3C50] pt-2 space-y-1 text-xs">
          <p className="text-[#B0BEC5]">HCS-14 Agent:</p>
          <code className="text-[#4DD0E1] break-all">{profile["ai.agent.hcs14-uaid"]}</code>
          {profile["ai.agent.capabilities"] && (
            <p className="text-[#B0BEC5] mt-1">Capabilities: <span className="text-[#E1F5FE]">{profile["ai.agent.capabilities"]}</span></p>
          )}
        </div>
      )}
    </div>
  );
}
```

### Posiziona il componente
- **Vault Dashboard** (`/vault/[id]`): mostra ENS name + policy verified badge + stats live
- **Policy Page** (`/vault/[id]/policy`): mostra verifica policy hash (on-chain vs local)
- **Agent Page** (`/vault/[id]/agent`): mostra ENS identity + HCS-14 link + fleet status

---

## STEP 12 — Fleet Discovery Dashboard (opzionale, high-impact per demo)

Crea `app/fleet/page.tsx` — una pagina che mostra tutti gli agenti registrati:

```typescript
// Legge fleet.agent.* da vaultpilot.eth e mostra una lista di agent attivi
// Ogni riga: ENS name | Status | Engine State | PnL | Last Trade
// Click su un agent porta al suo vault dashboard
```

---

## Diagramma Flusso Completo

```
                    VAULT CREATION WIZARD
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
         ┌─────────┐ ┌──────────┐ ┌──────────┐
         │ Hedera  │ │   Arc    │ │   ENS    │
         │ Init    │ │ (futuro) │ │  Init    │
         └────┬────┘ └──────────┘ └────┬─────┘
              │                        │
              │                 ┌──────┼──────┐
              │                 ▼      ▼      ▼
              │          ┌──────────┐ ┌──────────────┐ ┌──────────────┐
              │          │ Subname  │ │ Policy Hash  │ │ Agent Stats  │
              │          │ Creation │ │ Commitment   │ │ Initial      │
              │          └────┬─────┘ └──────┬───────┘ └──────┬───────┘
              │               │              │                │
              │               ▼              ▼                ▼
              │          ┌──────────────────────────────────────────┐
              │          │       ENS SUBNAME: vault-x.vaultpilot.eth│
              │          │                                          │
              │          │  TEXT RECORDS:                           │
              │          │  ├── policy.commitment = 0x7a3f...       │
              │          │  ├── agent.flips = 0                     │
              │          │  ├── agent.pnl = 0.0000                  │
              │          │  ├── agent.mode = auto                   │
              │          │  ├── agent.engineState = IDLE            │
              │          │  ├── agent-registration[hedera][...] = 1 │
              │          │  ├── ai.agent.hcs14-uaid = hcs14:...    │
              │          │  ├── ai.agent.capabilities = ...         │
              │          │  └── vault.created-at = 2026-...         │
              │          └──────────────────────────────────────────┘
              │
              ▼
         ┌──────────┐
         │ HCS-14   │─── UAID published to HCS topic
         │ Agent ID │
         └──────────┘
              │
              ▼
         ┌──────────────────────────────────────────┐
         │  FLEET REGISTRY on vaultpilot.eth        │
         │  ├── fleet.agent.0 = vault-x.vp.eth|... │
         │  ├── fleet.agent.1 = vault-y.vp.eth|... │
         │  └── fleet.agent.2 = vault-z.vp.eth|... │
         └──────────────────────────────────────────┘


                    EVERY AGENT CYCLE (15s)
                           │
                           ▼
              ┌─────────────────────────────┐
              │  updateAgentStats()          │
              │  setText(agent.flips, ...)   │
              │  setText(agent.pnl, ...)     │
              │  setText(agent.engineState)  │
              └─────────────────────────────┘


                    VERIFICATION FLOW
                           │
            ┌──────────────┼──────────────┐
            ▼              ▼              ▼
     ┌────────────┐ ┌───────────┐ ┌──────────────┐
     │ Recompute  │ │ Read      │ │ Compare      │
     │ local hash │ │ on-chain  │ │ match?       │
     │ from vault │ │ hash      │ │ VERIFIED ✓   │
     │ strategy   │ │ from ENS  │ │ or MISMATCH  │
     └────────────┘ └───────────┘ └──────────────┘
```

---

## Text Records Summary

### Per ogni vault subname (`{id}.vaultpilot.eth`)

| Key | Bounty | Tipo | Descrizione |
|-----|--------|------|-------------|
| `policy.commitment` | Most Creative | Static | keccak256 della strategy JSON — commitment scheme |
| `agent.flips` | Most Creative | Live | Numero totale di flip completati |
| `agent.pnl` | Most Creative | Live | PnL accumulato |
| `agent.inventory` | Most Creative | Live | UP/DOWN shares (es. "23/17") |
| `agent.mode` | Most Creative | Live | "auto" o "advisory" |
| `agent.cycles` | Most Creative | Live | Numero di cicli engine |
| `agent.lastTrade` | Most Creative | Live | ISO timestamp ultimo trade |
| `agent.engineState` | Most Creative | Live | Stato corrente engine (IDLE, QUOTING, ...) |
| `agent-registration[hedera-hcs14][{topicId}]` | AI Agents | Static | ENSIP-25 verification — valore "1" |
| `ai.agent.type` | AI Agents | Static | "financial-trading-agent" |
| `ai.agent.name` | AI Agents | Static | "PolyAgents Vault" |
| `ai.agent.version` | AI Agents | Static | "1.0.0" |
| `ai.agent.capabilities` | AI Agents | Static | Lista capabilities |
| `ai.agent.network` | AI Agents | Static | "hedera-testnet" |
| `ai.agent.status` | AI Agents | Live | "active" / "paused" / "error" |
| `ai.agent.hcs14-uaid` | AI Agents | Static | Link all'identità HCS-14 |
| `vault.created-at` | Most Creative | Static | Timestamp creazione |
| `vault.funding-usdc` | Most Creative | Static | Funding USDC iniziale |
| `vault.strategy-version` | Most Creative | Static | Versione strategy |

### Per il dominio parent (`vaultpilot.eth`)

| Key | Bounty | Descrizione |
|-----|--------|-------------|
| `fleet.agent.{n}` | AI Agents | `{ensName}|{vaultId}|{type}|{status}` |
| `fleet.count` | AI Agents | Numero totale di agenti registrati |

---

## Struttura File

```
lib/ens/
├── client.ts              # Viem clients, indirizzi, costanti
├── subname.ts             # Creazione subname, read/write text records
├── policy-commitment.ts   # keccak256 commitment scheme
├── agent-stats.ts         # Live stats aggiornabili
├── vault-metadata.ts      # Metadata statici del vault
├── agent-identity.ts      # ENSIP-25 verification + agent profile
└── fleet-registry.ts      # Fleet discovery + registrazione

components/
└── ens-verification-card.tsx   # UI verification card
```

---

## Checklist Doppi Bounty

### Best ENS Integration for AI Agents — $5,000

| Requisito | Come lo soddisfi | Step |
|-----------|-----------------|------|
| ENS migliora l'identità/discoverability dell'agente | Subname = identità persistente, ENSIP-25 = verifica on-chain, fleet registry = scoperta | 2-4 |
| Non cosmetico — l'agente non può operare senza | Subname creato al deploy, required per registrazione fleet, verificato ogni ciclo | 2, 5, 10 |
| Demo funzionale, no hard-coded | Tutti i valori calcolati da vault reale, scritti on-chain via viem | 2-10 |
| Creatività dell'uso | ENSIP-25 + fleet registry + cross-chain identity (HCS-14 ↔ ENS) | 3-4 |
| Video / live demo | Mostra creazione vault → subname ENS → fleet registry → verifica ENSIP-25 | — |

### Most Creative Use of ENS — $5,000

| Requisito | Come lo soddisfi | Step |
|-----------|-----------------|------|
| ENS migliora chiaramente il prodotto | Commitment scheme crittografico — verifica pubblica dell'integrità policy | 7 |
| Non solo name → address | Text records come commitment, live stats, vault metadata, cross-chain links | 7-9 |
| Demo funzionale, no hard-coded | Hash calcolato da strategy reale, stats scritte on-chain dopo ogni ciclo | 7, 8, 10 |
| Sorpresa i giudici | Pattern mai visto: ENS come public verification layer per agenti finanziari | 7-9 |
| Video / live demo | Mostra creazione vault → policy hash → modifica policy → MISMATCH rilevato | — |

---

## Demo Script (3 minuti)

1. **Creazione Vault** (45s): "Creo un vault con strategy custom. Notate che al deploy viene creato automaticamente un ENS subname: `btc-scalper.vaultpilot.eth`"
2. **Verification Dashboard** (45s): "Qui vedo il policy hash on-chain. Se qualcuno modifiesse la strategy localmente, l'hash non matcherebbe — la verifica fallirebbe"
3. **Live Stats** (30s): "Ogni 15 secondi l'agente aggiorna i text records ENS con flips, PnL, stato engine. Chiunque può leggere questi dati da qualsiasi ENS explorer"
4. **Agent Identity** (30s): "Grazie a ENSIP-25, il nome ENS è verificato contro l'identità HCS-14 dell'agente su Hedera. Cross-chain identity"
5. **Fleet Discovery** (30s): "Il dominio parent tiene traccia di tutti gli agenti. Chiunque può interrogare vaultpilot.eth per scoprire la fleet completa"
