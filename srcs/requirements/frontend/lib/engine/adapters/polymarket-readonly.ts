// Polymarket read-only adapter — market discovery + book data via Gamma/CLOB REST APIs
// Port of Python bot/exchange.py + bot/market_discovery.py

import type { ActiveMarket } from "../types";

const GAMMA_BASE = "https://gamma-api.polymarket.com";
const CLOB_BASE = "https://clob.polymarket.com";

export interface PolymarketMarket {
  conditionId: string;
  slug: string;
  question: string;
  yesTokenId: string;
  noTokenId: string;
  startTs: number;
  endTs: number;
  tickSize: number;
}

/**
 * Port of MarketDiscoveryService.get_active_btc_5m_market()
 * Two-phase: deterministic slug lookup -> fallback broad scan
 */
export async function discoverActiveMarket(now?: number): Promise<ActiveMarket | null> {
  const ts = now ?? Date.now() / 1000;

  // Phase 1: Deterministic slug lookup for current +/- 1 five-minute windows
  const windowSize = 300; // 5 minutes
  const candidates = [-1, 0, 1].map(offset => {
    const windowTs = Math.floor(ts / windowSize) * windowSize + offset * windowSize;
    return `btc-updown-5m-${windowTs}`;
  });

  for (const slug of candidates) {
    try {
      // BTC 5-min markets live under /events (not /markets)
      const res = await fetch(`${GAMMA_BASE}/events?slug=${slug}`);
      const events = await res.json();
      if (Array.isArray(events) && events.length > 0) {
        const markets = events[0].markets ?? [];
        if (markets.length > 0) {
          const parsed = parsePolymarketMarket(markets[0]);
          if (parsed) return parsed;
        }
      }
    } catch { /* continue */ }
  }

  // Phase 2: Fallback broad scan
  try {
    const res = await fetch(`${GAMMA_BASE}/markets?active=true&closed=false&limit=100`);
    const data: any[] = await res.json();
    const keywords = ["bitcoin", "up", "down", "5"];

    for (const m of data) {
      const text = `${m.question ?? ""} ${m.slug ?? ""}`.toLowerCase();
      if (keywords.every(k => text.includes(k)) && text.includes("min")) {
        const parsed = parsePolymarketMarket(m);
        if (parsed) return parsed;
      }
    }
  } catch { /* no market found */ }

  // Phase 3 (dev/fallback): return a simulated market for demo purposes
  return generateSimulatedMarket(ts);
}

function parsePolymarketMarket(raw: any): ActiveMarket | null {
  const tokens: string[] = raw.clobTokenIds ?? [];
  const outcomes: string[] = raw.outcomes ?? [];
  // Support both YES/NO (standard Polymarket) and Up/Down (BTC 5-min markets)
  const yesIdx = outcomes.findIndex((o: string) =>
    ["YES", "UP"].includes(o.toUpperCase())
  );
  const noIdx = outcomes.findIndex((o: string) =>
    ["NO", "DOWN"].includes(o.toUpperCase())
  );
  if (yesIdx === -1 || noIdx === -1 || !tokens[yesIdx] || !tokens[noIdx]) return null;

  return {
    conditionId: raw.conditionId ?? "",
    slug: raw.slug ?? "",
    question: raw.question ?? "",
    yesTokenId: tokens[yesIdx],
    noTokenId: tokens[noIdx],
    startTs: new Date(raw.startDate ?? raw.created_at).getTime() / 1000,
    endTs: new Date(raw.endDate ?? raw.closeTime).getTime() / 1000,
    tickSize: parseFloat(raw.tickSize ?? "0.01"),
    minOrderSize: 1,
  };
}

/** Generate a simulated 5-minute BTC market for demo/fallback */
function generateSimulatedMarket(now: number): ActiveMarket {
  const windowSize = 300;
  const windowTs = Math.floor(now / windowSize) * windowSize;

  return {
    conditionId: `sim-btc5m-${windowTs}`,
    slug: `btc-updown-5m-${windowTs}`,
    question: `Will Bitcoin go UP in the next 5 minutes? (window ${windowTs})`,
    yesTokenId: `sim-yes-${windowTs}`,
    noTokenId: `sim-no-${windowTs}`,
    startTs: windowTs,
    endTs: windowTs + windowSize,
    tickSize: 0.01,
    minOrderSize: 1,
  };
}

/** Get top-of-book for a token */
export async function getTopOfBook(tokenId: string): Promise<{ bestBid: number | null; bestAsk: number | null }> {
  // Simulated tokens return mock data
  if (tokenId.startsWith("sim-")) {
    return generateSimulatedBook();
  }

  try {
    const res = await fetch(`${CLOB_BASE}/book?token_id=${tokenId}`);
    const data = await res.json();
    const bids = data.bids ?? [];
    const asks = data.asks ?? [];
    return {
      bestBid: bids.length > 0 ? parseFloat(bids[0].price) : null,
      bestAsk: asks.length > 0 ? parseFloat(asks[0].price) : null,
    };
  } catch {
    return generateSimulatedBook();
  }
}

/** Generate simulated book data for demo */
function generateSimulatedBook(): { bestBid: number | null; bestAsk: number | null } {
  const base = 0.45 + Math.random() * 0.1; // 0.45-0.55 range
  return {
    bestBid: Math.round((base - 0.01) * 100) / 100,
    bestAsk: Math.round((base + 0.01) * 100) / 100,
  };
}
