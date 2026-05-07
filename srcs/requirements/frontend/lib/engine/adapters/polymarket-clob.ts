// CLOB adapter — wraps @polymarket/clob-client behind a unified interface
// Three modes selected by POLYMARKET_LIVE env var:
//   LIVE=true  → LiveClobAdapter  (real orders on Polygon via @polymarket/clob-client)
//   LIVE=demo  → LiveClobAdapter  (real CLOB, but bridges are skipped in the cycle)
//   LIVE=false → ReadOnlyClobAdapter (real market data, simulated fills)

import type { BookTop } from "../types";
import { getTopOfBook } from "./polymarket-readonly";
import type { ClobClient, ApiKeyCreds, OpenOrder, OpenOrderParams } from "@polymarket/clob-client";

// ── Public interface ──

export interface ClobOrder {
  id: string;
  tokenId: string;
  side: "BUY" | "SELL";
  price: number;
  size: number;
  filledSize: number;
  status: "OPEN" | "PARTIAL" | "FILLED" | "CANCELLED";
}

export interface OrderResult {
  orderId: string;
  simulated: boolean;
}

export interface ClobAdapter {
  readonly isLive: boolean;
  initialize(): Promise<void>;
  getMarketBooks(tokenIds: string[]): Promise<Record<string, BookTop>>;
  placeOrder(tokenId: string, side: "BUY" | "SELL", price: number, size: number): Promise<OrderResult>;
  cancelOrder(orderId: string): Promise<boolean>;
  getOrder(orderId: string): Promise<ClobOrder | null>;
  getOpenOrders(market?: string): Promise<ClobOrder[]>;
  getBalance(): Promise<number>;
}

// ── ReadOnlyClobAdapter (default — simulated fills with real market data) ──

class ReadOnlyClobAdapter implements ClobAdapter {
  readonly isLive = false;

  private orders = new Map<string, ClobOrder>();

  async initialize(): Promise<void> {
    // No auth needed for read-only
  }

  async getMarketBooks(tokenIds: string[]): Promise<Record<string, BookTop>> {
    const result: Record<string, BookTop> = {};
    await Promise.all(
      tokenIds.map(async (id) => {
        result[id] = await getTopOfBook(id);
      }),
    );
    return result;
  }

  async placeOrder(tokenId: string, side: "BUY" | "SELL", price: number, size: number): Promise<OrderResult> {
    const id = `sim-ord-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.orders.set(id, {
      id,
      tokenId,
      side,
      price,
      size,
      filledSize: 0,
      status: "OPEN",
    });
    return { orderId: id, simulated: true };
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    const order = this.orders.get(orderId);
    if (!order || order.status === "FILLED" || order.status === "CANCELLED") return false;
    order.status = "CANCELLED";
    return true;
  }

  async getOrder(orderId: string): Promise<ClobOrder | null> {
    return this.orders.get(orderId) ?? null;
  }

  async getOpenOrders(_market?: string): Promise<ClobOrder[]> {
    return Array.from(this.orders.values()).filter(
      (o) => o.status === "OPEN" || o.status === "PARTIAL",
    );
  }

  async getBalance(): Promise<number> {
    return 1000; // Simulated balance
  }
}

// ── LiveClobAdapter (real Polymarket CLOB on Polygon) ──

class LiveClobAdapter implements ClobAdapter {
  readonly isLive = true;
  private client: ClobClient | null = null;
  private creds: ApiKeyCreds | null = null;

  async initialize(): Promise<void> {
    const { ClobClient } = await import("@polymarket/clob-client");
    const { Chain } = await import("@polymarket/clob-client");

    // Create a viem WalletClient (matches ClobSigner = EthersSigner | WalletClient)
    const { createWalletClient, http } = await import("viem");
    const { privateKeyToAccount } = await import("viem/accounts");
    const { polygon } = await import("viem/chains");

    const pk = process.env.POLYMARKET_PRIVATE_KEY;
    if (!pk) throw new Error("POLYMARKET_PRIVATE_KEY not set for live mode");

    const account = privateKeyToAccount(pk as `0x${string}`);
    const walletClient = createWalletClient({ account, chain: polygon, transport: http() });

    const funderPk = process.env.POLYMARKET_FUNDER_PRIVATE_KEY as `0x${string}` | undefined;
    const funderAddress = funderPk ? privateKeyToAccount(funderPk).address : undefined;

    // Create client with L1 auth initially
    this.client = new ClobClient(
      "https://clob.polymarket.com",
      Number(Chain.POLYGON),
      walletClient,
      undefined,
      undefined,
      funderAddress,
    );

    // Derive or create API creds (L2 auth)
    const apiKey = process.env.POLYMARKET_API_KEY;
    const apiSecret = process.env.POLYMARKET_API_SECRET;
    const apiPassphrase = process.env.POLYMARKET_API_PASSPHRASE;

    if (apiKey && apiSecret && apiPassphrase) {
      this.creds = { key: apiKey, secret: apiSecret, passphrase: apiPassphrase };
      // Recreate client with creds
      this.client = new ClobClient(
        "https://clob.polymarket.com",
        Number(Chain.POLYGON),
        walletClient,
        this.creds,
        undefined,
        funderAddress,
      );
    } else {
      // Auto-derive API key
      try {
        this.creds = await this.client!.createOrDeriveApiKey();
        this.client = new ClobClient(
          "https://clob.polymarket.com",
          Number(Chain.POLYGON),
          walletClient,
          this.creds,
          undefined,
          funderAddress,
        );
      } catch (err) {
        console.warn("[LiveClobAdapter] Failed to derive API key, using L1 auth:", err);
      }
    }
  }

  async getMarketBooks(tokenIds: string[]): Promise<Record<string, BookTop>> {
    const result: Record<string, BookTop> = {};
    await Promise.all(
      tokenIds.map(async (id) => {
        try {
          const book = await this.client!.getOrderBook(id);
          const bids = book.bids ?? [];
          const asks = book.asks ?? [];
          result[id] = {
            bestBid: bids.length > 0 ? parseFloat(bids[0].price) : null,
            bestAsk: asks.length > 0 ? parseFloat(asks[0].price) : null,
          };
        } catch {
          result[id] = { bestBid: null, bestAsk: null };
        }
      }),
    );
    return result;
  }

  async placeOrder(tokenId: string, side: "BUY" | "SELL", price: number, size: number): Promise<OrderResult> {
    // Simulated tokens don't exist on the real CLOB — return a simulated order
    if (tokenId.startsWith("sim-")) {
      const id = `sim-ord-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      return { orderId: id, simulated: true };
    }

    const { Side, OrderType } = await import("@polymarket/clob-client");

    const userOrder = {
      tokenID: tokenId,
      price,
      size,
      side: side === "BUY" ? Side.BUY : Side.SELL,
    };

    const resp = await this.client!.createAndPostOrder(
      userOrder,
      {},
      OrderType.GTC,
    );

    return {
      orderId: resp.orderID ?? resp.orderId ?? `live-${Date.now()}`,
      simulated: false,
    };
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    try {
      await this.client!.cancelOrder({ orderID: orderId });
      return true;
    } catch {
      return false;
    }
  }

  async getOrder(orderId: string): Promise<ClobOrder | null> {
    try {
      const o = await this.client!.getOrder(orderId);
      return {
        id: o.id,
        tokenId: o.asset_id,
        side: o.side === "BUY" ? "BUY" : "SELL",
        price: parseFloat(o.price),
        size: parseFloat(o.original_size),
        filledSize: parseFloat(o.size_matched),
        status: mapPolymarketStatus(o.status),
      };
    } catch {
      return null;
    }
  }

  async getOpenOrders(market?: string): Promise<ClobOrder[]> {
    try {
      const params: OpenOrderParams = {};
      if (market) params.market = market;
      const orders: OpenOrder[] = await this.client!.getOpenOrders(params);
      return (orders ?? []).map((o) => ({
        id: o.id,
        tokenId: o.asset_id,
        side: o.side === "BUY" ? "BUY" : "SELL",
        price: parseFloat(o.price),
        size: parseFloat(o.original_size),
        filledSize: parseFloat(o.size_matched),
        status: mapPolymarketStatus(o.status),
      }));
    } catch {
      return [];
    }
  }

  async getBalance(): Promise<number> {
    try {
      const { AssetType } = await import("@polymarket/clob-client");
      const resp = await this.client!.getBalanceAllowance({
        asset_type: AssetType.COLLATERAL,
      });
      return parseFloat(resp.balance) / 1e6; // USDC has 6 decimals
    } catch {
      return 0;
    }
  }
}

function mapPolymarketStatus(s: string): ClobOrder["status"] {
  if (s === "MATCHED" || s === "FILLED") return "FILLED";
  if (s === "CANCELLED") return "CANCELLED";
  if (s === "PARTIAL") return "PARTIAL";
  return "OPEN";
}

// ── Singleton factory ──

let _adapter: ClobAdapter | null = null;
let _initialized = false;

/** True when POLYMARKET_LIVE is "true" or "demo" — real CLOB trading. */
export function isLiveMode(): boolean {
  const v = process.env.POLYMARKET_LIVE;
  return v === "true" || v === "demo";
}

/** True when POLYMARKET_LIVE is "demo" — real CLOB but skip bridges. */
export function isDemoMode(): boolean {
  return process.env.POLYMARKET_LIVE === "demo";
}

export async function getClobAdapter(): Promise<ClobAdapter> {
  if (!_adapter) {
    _adapter = isLiveMode() ? new LiveClobAdapter() : new ReadOnlyClobAdapter();
  }
  if (!_initialized) {
    await _adapter.initialize();
    _initialized = true;
  }
  return _adapter;
}

export function resetClobAdapter(): void {
  _adapter = null;
  _initialized = false;
}
