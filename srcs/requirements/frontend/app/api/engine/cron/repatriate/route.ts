import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

// ── Vercel Cron: Repatriate status ──
//
// Placeholder — bridge functionality removed.
// Returns current vault PnL summary.

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

function readStore(): EngineStore {
  try {
    const raw = readFileSync(STORE_PATH, "utf-8");
    return JSON.parse(raw) as EngineStore;
  } catch {
    return { runs: {}, marketStates: {} };
  }
}

export async function GET() {
  const store = readStore();

  const activeVaultIds = Object.entries(store.runs)
    .filter(([, run]) => run.status === "running")
    .map(([vaultId]) => vaultId);

  const results = activeVaultIds.map(vaultId => {
    const state = store.marketStates[vaultId];
    const totalPnl = state
      ? state.sides.YES.realizedPnl + state.sides.NO.realizedPnl
      : 0;
    return { vaultId, pnl: totalPnl };
  });

  return NextResponse.json({
    repatriated: 0,
    vaults: activeVaultIds.length,
    results,
    timestamp: Date.now(),
    message: "Bridge disabled — no chain integration",
  });
}
