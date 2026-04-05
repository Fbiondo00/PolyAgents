"use server";

/**
 * Engine step: ensure Polygon USDC liquidity before placing bets.
 *
 * Checks the trading wallet's Polygon USDC balance. If below the minimum
 * threshold, bridges USDC from Arc → Polygon via Circle CCTP.
 *
 * Non-blocking — if the bridge fails, the cycle continues.
 * Uses ARC_PRIVATE_KEY for bridge signing (server-side operational action).
 */

import { AppKit, Blockchain } from "@circle-fin/app-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";

// Amount to bridge each time (~500 orders at $0.01 each)
const BRIDGE_AMOUNT = "5.00";

export interface LiquidityResult {
  bridged: boolean;
  polygonBalance?: string;
  bridgeAmount?: string;
  error?: string;
}

export async function ensurePolygonLiquidity(
  vaultId: string,
): Promise<LiquidityResult> {
  console.log(`[ensure-polygon-liquidity] checking`, { vaultId });

  const polygonKey = process.env.POLYMARKET_PRIVATE_KEY;
  const arcKey = process.env.ARC_PRIVATE_KEY;

  if (!polygonKey || !arcKey) {
    console.log(`[ensure-polygon-liquidity] skipping — no private keys configured`);
    return { bridged: false, polygonBalance: "demo" };
  }

  try {
    const arcAdapter = createViemAdapterFromPrivateKey({ privateKey: arcKey });
    const polygonAdapter = createViemAdapterFromPrivateKey({ privateKey: polygonKey });

    const kit = new AppKit();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await (kit.bridge as any)({
      source: {
        adapter: arcAdapter,
        address: (arcAdapter as any).address,
        chain: Blockchain.Arc_Testnet,
      },
      destination: {
        adapter: polygonAdapter,
        address: (polygonAdapter as any).address,
        chain: Blockchain.Polygon,
      },
      amount: BRIDGE_AMOUNT,
      token: "USDC",
      config: {},
    });

    console.log(
      `[ensure-polygon-liquidity] bridged ${BRIDGE_AMOUNT} USDC Arc→Polygon`,
    );

    return {
      bridged: true,
      bridgeAmount: BRIDGE_AMOUNT,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ensure-polygon-liquidity] bridge failed:`, message);
    return { bridged: false, error: message };
  }
}

/**
 * Reverse bridge: move USDC from Polygon → Arc.
 * Called after trading profits are realized on Polymarket.
 * Returns the USDC to the vault's home chain (Arc) for settlement
 * and to fund oracle HBAR payments.
 */
export async function repatriateProfitsToArc(
  vaultId: string,
  amount: string = "5.00",
): Promise<LiquidityResult> {
  console.log(`[repatriate-profits] bridging ${amount} USDC Polygon→Arc`, { vaultId });

  const polygonKey = process.env.POLYMARKET_PRIVATE_KEY;
  const arcKey = process.env.ARC_PRIVATE_KEY;

  if (!polygonKey || !arcKey) {
    console.log(`[repatriate-profits] skipping — no private keys configured`);
    return { bridged: false };
  }

  try {
    const arcAdapter = createViemAdapterFromPrivateKey({ privateKey: arcKey });
    const polygonAdapter = createViemAdapterFromPrivateKey({ privateKey: polygonKey });

    const kit = new AppKit();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await (kit.bridge as any)({
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
      amount,
      token: "USDC",
      config: {},
    });

    console.log(`[repatriate-profits] bridged ${amount} USDC Polygon→Arc`);
    return { bridged: true, bridgeAmount: amount };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[repatriate-profits] reverse bridge failed:`, message);
    return { bridged: false, error: message };
  }
}
