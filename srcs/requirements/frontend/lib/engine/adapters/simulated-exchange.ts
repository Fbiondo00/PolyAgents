// Simulated Exchange Adapter — paper trading for virtual orders
// Port of Python bot/exchange.py order management (paper-trading mode)

import type { VirtualOrder, MarketSide } from "../types";

export class SimulatedExchangeAdapter {
  private orders: Map<string, VirtualOrder> = new Map();

  async placeOrder(params: {
    tokenId: string;
    side: MarketSide;
    intent: "BUY" | "SELL";
    price: number;
    size: number;
    clientRef: string;
  }): Promise<VirtualOrder> {
    const order: VirtualOrder = {
      id: `sim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      engineRunId: "",
      marketId: "",
      side: params.side,
      intent: params.intent,
      tokenId: params.tokenId,
      price: params.price,
      submittedQty: params.size,
      filledQty: 0,
      remainingQty: params.size,
      status: "OPEN",
      clientRef: params.clientRef,
      placedAt: Date.now(),
      expiresAt: null,
      simulated: true,
      rejectionReason: null,
    };
    this.orders.set(order.id, order);
    return order;
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    const order = this.orders.get(orderId);
    if (order && (order.status === "OPEN" || order.status === "PARTIAL")) {
      order.status = "CANCELLED";
      order.remainingQty = 0;
      return true;
    }
    return false;
  }

  async getOpenOrders(): Promise<VirtualOrder[]> {
    return [...this.orders.values()].filter(o => o.status === "OPEN" || o.status === "PARTIAL");
  }
}
