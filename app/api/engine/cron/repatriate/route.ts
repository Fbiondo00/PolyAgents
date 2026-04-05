import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";
import { AppKit, Blockchain } from "@circle-fin/app-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";

// ── Vercel Cron: Repatriate Polygon USDC profits → Arc ──
//
// Runs every 5 minutes. For each active vault, checks if there are
// realized profits on Polygon (from Polymarket trading) and bridges
// them back to Arc where:
// - Oracle HBAR payments are funded
// - Vault settlement happens
// - The PolyAgentsMarket contract records positions
//
// The vault is the agent's single wallet. USDC flows:
//   Arc (fund) → Polygon (trade) → Arc (settle + pay)

const STORE_PATH = join(process.cwd(), ".engine-store.json");

interface EngineStore {
  runs: Record<string, { status: string; id: string }>;
  marketStates: Record<string, {
    sides: {
      YES: { realizedPnl: number };
      NO: { realizedPnl: number };
    };
  }>;
}

// Amount to repatriate per vault per cron run ($5 chunks)
const REPATRIATE_CHUNK = "5.00";

function readStore(): EngineStore {
  try {
    const raw = readFileSync(STORE_PATH, "utf-8");
    return JSON.parse(raw) as EngineStore;
  } catch {
    return { runs: {}, marketStates: {} };
  }
}

export async function GET() {
  const polygonKey = process.env.POLYMARKET_PRIVATE_KEY;
  const arcKey = process.env.ARC_PRIVATE_KEY;

  // If no keys, return demo status
  if (!polygonKey || !arcKey) {
    return NextResponse.json({
      repatriated: 0,
      vaults: 0,
      timestamp: Date.now(),
      mode: "demo",
      message: "No private keys configured — bridge runs in engine cycle",
    });
  }

  const store = readStore();

  // Find active vaults (status = "running")
  const activeVaultIds = Object.entries(store.runs)
    .filter(([, run]) => run.status === "running")
    .map(([vaultId]) => vaultId);

  if (activeVaultIds.length === 0) {
    return NextResponse.json({
      repatriated: 0,
      vaults: 0,
      timestamp: Date.now(),
      message: "No active vaults",
    });
  }

  const arcAdapter = createViemAdapterFromPrivateKey({ privateKey: arcKey });
  const polygonAdapter = createViemAdapterFromPrivateKey({ privateKey: polygonKey });
  const kit = new AppKit();

  const results: Array<{
    vaultId: string;
    pnl: number;
    bridged: boolean;
    amount?: string;
    error?: string;
  }> = [];

  for (const vaultId of activeVaultIds) {
    const state = store.marketStates[vaultId];
    const totalPnl = state
      ? state.sides.YES.realizedPnl + state.sides.NO.realizedPnl
      : 0;

    // Only repatriate if there are realized profits
    if (totalPnl <= 0) {
      results.push({ vaultId, pnl: totalPnl, bridged: false });
      continue;
    }

    try {
      // Bridge the repatriate chunk (or actual PnL if smaller)
      const amount = totalPnl < parseFloat(REPATRIATE_CHUNK)
        ? totalPnl.toFixed(2)
        : REPATRIATE_CHUNK;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (kit.bridge as any)({
        source: {
          adapter: polygonAdapter,
          address: (polygonAdapter as any).address,
          chain: Blockchain.Polygon,
        },
        destination: {
          adapter: arcAdapter,
          address: (arcAdapter as any).address,
          chain: Blockchain.Arc_Testnet,
        },
        amount: String(amount),
        token: "USDC",
        config: {},
      });

      console.log(
        `[cron/repatriate] vault=${vaultId} bridged $${amount} Polygon→Arc`,
      );

      results.push({
        vaultId,
        pnl: totalPnl,
        bridged: true,
        amount: String(amount),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[cron/repatriate] vault=${vaultId} failed:`, message);
      results.push({ vaultId, pnl: totalPnl, bridged: false, error: message });
    }
  }

  const totalRepatriated = results
    .filter((r) => r.bridged)
    .reduce((sum, r) => sum + parseFloat(r.amount ?? "0"), 0);

  return NextResponse.json({
    repatriated: totalRepatriated,
    vaults: activeVaultIds.length,
    results,
    timestamp: Date.now(),
  });
}
