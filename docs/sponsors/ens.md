
Implementazione ENS — Step by Step

Cos'è ENS per PolyAgents (in 30 secondi)
ENS (Ethereum Name Service) viene usato in modo creativo per trasformare il nome di un vault in una **public identity card** verificabile. Invece di semplice name resolution, PolyAgents scrive hash crittografici della strategia e statistiche live dell'agente come **text record** su subname ENS. Chiunque può verificare che l'agente ha eseguito esattamente la policy inizializzata — senza mai vedere il contenuto della policy. Questo è **cryptographic commitment via text records**, un pattern che i giudici ENS non hanno mai visto.

Bounty target: **ENS — Most Creative Use — $2,500**

🔧 STEP 0 — Prerequisiti (5 minuti)

Assicurati di avere viem già installato (lo stai usando per Arc):
```bash
npm install viem @ensdomains/ensjs
```

Aggiungi al tuo `.env`:
```
# ENS
ENS_OWNER_PRIVATE_KEY=0x...          # chiave del controller del nome ENS
ENS_REGISTRY_ADDRESS=0x00000000000C2e074eC69A0dFb2997BA6C7d2e1e  # mainnet o sepolia
ENS_BASE_DOMAIN=polyagents.eth       # nome registrato su ENS
```

Registra `polyagents.eth` su https://app.ens.domains (mainnet) o usa il testnet Sepolia ENS deployment.

🔧 STEP 1 — ENS Client Base (10 minuti)

Crea `src/ens/client.ts`:
```typescript
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const account = privateKeyToAccount(process.env.ENS_OWNER_PRIVATE_KEY as `0x${string}`);

export const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(),
});

export const walletClient = createWalletClient({
  chain: sepolia,
  account,
  transport: http(),
});
```

🔧 STEP 2 — Policy Hash Commitment (20 minuti)

→ Copre: Requisito core del bounty — uso creativo di ENS che migliora chiaramente il prodotto

Il concetto: quando un vault viene creato, calcoliamo `keccak256(strategyParams)` e lo scriviamo come text record `policy.commitment` sul subname del vault (es. `vault-abc.polyagents.eth`). Questo è un **commitment scheme**: l'hash è pubblico ma la policy rimane privata. Chiunque può verificare che l'agente sta seguendo la policy originale confrontando l'hash.

Crea `src/ens/policy-commitment.ts`:
```typescript
import { encodeFunctionData, keccak256, toBytes, toHex } from "viem";
import { publicClient, walletClient } from "./client";

const ENS_REGISTRY = "0x00000000000C2e074eC69A0dFb2997BA6C7d2e1e" as const;
const ENS_PUBLIC_RESOLVER = "0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63" as const; // Sepolia

/**
 * Compute keccak256 hash of the vault strategy config.
 * This hash gets committed on-chain via ENS text record.
 */
export function computePolicyHash(strategy: {
  bidPrice: number;
  sellPrice: number;
  maxCapital: number;
  trancheSize: number;
  noNewEntriesLast: number;
  keepSellAfter: number;
  aiEnabled: boolean;
}, vaultName: string, mode: string): `0x${string}` {
  const serialized = JSON.stringify({
    name: vaultName,
    mode,
    strategy: {
      bidPrice: strategy.bidPrice,
      sellPrice: strategy.sellPrice,
      maxCapital: strategy.maxCapital,
      trancheSize: strategy.trancheSize,
      noNewEntriesLast: strategy.noNewEntriesLast,
      keepSellAfter: strategy.keepSellAfter,
      aiEnabled: strategy.aiEnabled,
    },
  });
  return keccak256(toBytes(serialized));
}

/**
 * Write the policy hash as an ENS text record.
 * Key: "policy.commitment"
 * Subname: {vaultId}.polyagents.eth
 */
export async function commitPolicyHash(
  vaultId: string,
  policyHash: `0x${string}`
): Promise<string> {
  // setText(bytes32 node, string key, string value)
  const node = namehash(`${vaultId}.polyagents.eth`);

  const txHash = await walletClient.writeContract({
    address: ENS_PUBLIC_RESOLVER,
    abi: [
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
    ],
    functionName: "setText",
    args: [node, "policy.commitment", policyHash],
  });

  await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log(`✅ Policy committed to ENS: ${vaultId}.polyagents.eth → ${policyHash.slice(0, 16)}…`);
  return txHash;
}
```

🔧 STEP 3 — Live Agent Stats as Text Records (15 minuti)

→ Copre: Differenziante creativo — vault ENS name diventa una public identity card leggibile da qualsiasi tool ENS

Oltre al policy hash, scriviamo statistiche live dell'agente come text record aggiornabili. Questo trasforma il nome ENS del vault in un cruscotto pubblico.

Crea `src/ens/agent-stats.ts`:
```typescript
import { walletClient, publicClient } from "./client";

const ENS_PUBLIC_RESOLVER = "0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63" as const;

interface AgentStats {
  flips: number;
  pnl: number;
  inventory_up: number;
  inventory_down: number;
  mode: "advisory" | "auto";
  lastTrade: string; // ISO timestamp
}

/**
 * Write live agent stats as ENS text records.
 * Keys: agent.flips, agent.pnl, agent.inventory, agent.mode, agent.lastTrade
 */
export async function updateAgentStats(
  vaultId: string,
  stats: AgentStats
): Promise<string[]> {
  const node = namehash(`${vaultId}.polyagents.eth`);

  const updates: [string, string][] = [
    ["agent.flips", stats.flips.toString()],
    ["agent.pnl", stats.pnl.toFixed(4)],
    ["agent.inventory", `${stats.inventory_up}/${stats.inventory_down}`],
    ["agent.mode", stats.mode],
    ["agent.lastTrade", stats.lastTrade],
  ];

  const txHashes: string[] = [];

  for (const [key, value] of updates) {
    const txHash = await walletClient.writeContract({
      address: ENS_PUBLIC_RESOLVER,
      abi: [
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
      ],
      functionName: "setText",
      args: [node, key, value],
    });
    await publicClient.waitForTransactionReceipt({ hash: txHash });
    txHashes.push(txHash);
  }

  console.log(`✅ Agent stats updated on ENS for ${vaultId}.polyagents.eth`);
  return txHashes;
}

/**
 * Read back agent stats from ENS (for verification dashboard).
 */
export async function readAgentStats(
  vaultId: string
): Promise<Record<string, string>> {
  const node = namehash(`${vaultId}.polyagents.eth`);
  const keys = [
    "policy.commitment",
    "agent.flips",
    "agent.pnl",
    "agent.inventory",
    "agent.mode",
    "agent.lastTrade",
  ];

  const result: Record<string, string> = {};

  for (const key of keys) {
    const value = await publicClient.readContract({
      address: ENS_PUBLIC_RESOLVER,
      abi: [
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
      ],
      functionName: "text",
      args: [node, key],
    });
    result[key] = value as string;
  }

  return result;
}
```

🔧 STEP 4 — Subname Creation (10 minuti)

Ogni vault ha bisogno di un subname sotto `polyagents.eth`. Questo viene creato una volta alla creazione del vault.

Crea `src/ens/subname.ts`:
```typescript
import { walletClient, publicClient } from "./client";
import { labelhash, namehash } from "viem/ens";

const ENS_REGISTRY = "0x00000000000C2e074eC69A0dFb2997BA6C7d2e1e" as const;

/**
 * Create a subname for a new vault under polyagents.eth.
 * Sets the resolver to the public resolver.
 */
export async function createVaultSubname(
  vaultId: string
): Promise<string> {
  const parentName = "polyagents.eth";
  const parent Node = namehash(parentName);
  const label = vaultId; // e.g. "vault-abc"
  const fullNode = namehash(`${label}.${parentName}`);

  // 1. Set subdomain owner (creates the subname)
  const txHash = await walletClient.writeContract({
    address: ENS_REGISTRY,
    abi: [
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
    ],
    functionName: "setSubnodeOwner",
    args: [parentNode, labelhash(label), walletClient.account.address],
  });

  await publicClient.waitForTransactionReceipt({ hash: txHash });

  // 2. Set resolver to public resolver
  const resolverTx = await walletClient.writeContract({
    address: ENS_REGISTRY,
    abi: [
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
    ],
    functionName: "setResolver",
    args: [fullNode, "0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63"],
  });

  await publicClient.waitForTransactionReceipt({ hash: resolverTx });

  console.log(`✅ ENS subname created: ${label}.${parentName}`);
  return txHash;
}
```

🔧 STEP 5 — Integra nella Vault Creation (15 minuti)

Collega tutto nel flusso di creazione vault. Quando l'utente clicca "Deploy" nel wizard:

```typescript
// src/ens/vault-ens-init.ts
import { createVaultSubname } from "./subname";
import { computePolicyHash, commitPolicyHash } from "./policy-commitment";
import { updateAgentStats } from "./agent-stats";

export async function initVaultENS(opts: {
  vaultId: string;
  vaultName: string;
  strategy: Vault["strategy"];
  mode: "advisory" | "auto";
}): Promise<{ ensName: string; policyHash: string; txHashes: string[] }> {
  const { vaultId, vaultName, strategy, mode } = opts;

  // 1. Create ENS subname
  await createVaultSubname(vaultId);

  // 2. Compute and commit policy hash
  const policyHash = computePolicyHash(strategy, vaultName, mode);
  await commitPolicyHash(vaultId, policyHash);

  // 3. Write initial agent stats
  const txHashes = await updateAgentStats(vaultId, {
    flips: 0,
    pnl: 0,
    inventory_up: 0,
    inventory_down: 0,
    mode,
    lastTrade: new Date().toISOString(),
  });

  const ensName = `${vaultId}.polyagents.eth`;
  console.log(`✅ ENS fully initialized: ${ensName}`);
  console.log(`   Policy hash: ${policyHash.slice(0, 16)}…`);

  return { ensName, policyHash, txHashes };
}
```

🔧 STEP 6 — Hook nell'Agent Loop (10 minuti)

Dopo ogni trade o ciclo, aggiorna le stat ENS:

```typescript
// Nel tuo agent loop — dopo ogni ciclo completato
import { updateAgentStats } from "../ens/agent-stats";

async function onCycleComplete(vault: Vault) {
  await updateAgentStats(vault.id, {
    flips: vault.stats.flips,
    pnl: vault.stats.pnl,
    inventory_up: vault.inventory.upShares,
    inventory_down: vault.inventory.downShares,
    mode: vault.mode,
    lastTrade: new Date().toISOString(),
  });
}
```

🔧 STEP 7 — Verifica Dashboard (Frontend) (15 minuti)

Aggiungi una sezione nella pagina Policy (`/vault/[id]/policy`) per mostrare la verifica ENS:

```typescript
// components/ens-verification.tsx
// Mostra:
// 1. ENS name: vault-abc.polyagents.eth
// 2. Policy hash on-chain: 0xabcd...
// 3. Current local hash:   0xabcd...
// 4. Match status: ✅ VERIFIED or ⚠️ MISMATCH
// 5. Agent stats lette da ENS: flips, pnl, mode, lastTrade
```

🔧 STEP 8 — Diagramma Flusso ENS

```
Vault Creation Wizard
       │
       ▼
┌─────────────────────────┐
│  computePolicyHash()     │  keccak256(strategy JSON)
│  → 0x7a3f...             │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│  createVaultSubname()    │  vault-abc.polyagents.eth
│  + setResolver()         │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│  commitPolicyHash()      │  setText(node, "policy.commitment", hash)
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│  updateAgentStats()      │  setText per: flips, pnl, mode, lastTrade
└──────────┬──────────────┘
           │
     Per ogni ciclo
           │
           ▼
┌─────────────────────────┐
│  updateAgentStats()      │  Aggiorna text record live
└─────────────────────────┘
```

📋 Checklist Bounty ENS $2,500

| Requisito | Come lo soddisfi | Step |
|-----------|-----------------|------|
| ENS migliora chiaramente il prodotto | Cryptographic commitment della policy — verifica pubblica che l'agente segue la strategia | 2 |
| Demo funzionale, no hard-coded values | Hash calcolato da vera strategy JSON, scritto on-chain via viem | 2-5 |
| Video o live demo | Demo end-to-end nel video 3 minuti | — |
| Presentazione ENS booth Sunday | Calendar reminder | — |
| Creatività del pattern | Text records come commitment scheme + live identity card — pattern inedito | 2-3 |

Tempo totale stimato: ~2 ore.

**L'approccio chiave:** I giudici ENS valutano la creatività. Il nostro uso di `policy.commitment` come commitment scheme crittografico (hash pubblico, policy privata) + stats live come text record è qualcosa che non hanno mai visto. Non è semplice name resolution — è ENS come **public verification layer** per agenti autonomi.
