"use client";

import { useState, useEffect } from "react";
import {
  fetchAllMarkets,
  fetchMarketCount,
  fetchOdds,
  createPredictionMarket,
  placeBetOnMarket,
  resolvePredictionMarket,
  claimMarketWinnings,
} from "@/actions/arc/markets";

interface Market {
  marketId: number;
  question: string;
  category: string;
  resolutionTime: string;
  totalYes: string;
  totalNo: string;
  outcome: number;
  resolved: boolean;
}

export default function ArcTestPage() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [newQuestion, setNewQuestion] = useState("Will BTC close above $100k this week?");
  const [betMarketId, setBetMarketId] = useState("1");
  const [betSide, setBetSide] = useState<"YES" | "NO">("YES");
  const [betAmount, setBetAmount] = useState("5");
  const [resolveId, setResolveId] = useState("1");
  const [resolveOutcome, setResolveOutcome] = useState<"YES" | "NO">("YES");
  const [claimId, setClaimId] = useState("1");

  const addLog = (msg: string) => setLog((prev) => [msg, ...prev]);

  const load = async () => {
    setLoading(true);
    try {
      const count = await fetchMarketCount();
      addLog(`Market count: ${count}`);
      if (count === 0) {
        setMarkets([]);
        return;
      }
      const data = await fetchAllMarkets();
      setMarkets(data as unknown as Market[]);
      addLog(`Loaded ${data.length} markets`);
    } catch (err: unknown) {
      addLog(`ERROR: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    setLoading(true);
    try {
      const res = await createPredictionMarket({
        question: newQuestion,
        category: "crypto",
        resolutionTime: new Date(Date.now() + 7 * 86400000),
        hederaTopicId: "0.0.test",
        policyHash: "0x" + "00".repeat(32),
      });
      addLog(`Created market #${res.marketId} — tx: ${res.txHash.slice(0, 18)}...`);
      await load();
    } catch (err: unknown) {
      addLog(`ERROR: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleBet = async () => {
    setLoading(true);
    try {
      const res = await placeBetOnMarket({
        marketId: Number(betMarketId),
        isYes: betSide === "YES",
        amountUsdc: Number(betAmount),
      });
      addLog(`Bet ${betSide} ${betAmount} USDC on #${betMarketId} — tx: ${res.txHash.slice(0, 18)}...`);
      await load();
    } catch (err: unknown) {
      addLog(`ERROR: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async () => {
    setLoading(true);
    try {
      const res = await resolvePredictionMarket({
        marketId: Number(resolveId),
        outcome: resolveOutcome,
      });
      addLog(`Resolved #${resolveId} as ${resolveOutcome} — tx: ${res.txHash.slice(0, 18)}...`);
      await load();
    } catch (err: unknown) {
      addLog(`ERROR: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleClaim = async () => {
    setLoading(true);
    try {
      const res = await claimMarketWinnings(Number(claimId));
      addLog(`Claimed ${res.amount} USDC from #${claimId} — tx: ${res.txHash.slice(0, 18)}...`);
      await load();
    } catch (err: unknown) {
      addLog(`ERROR: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const outcomeLabel = (o: number) =>
    o === 1 ? "YES" : o === 2 ? "NO" : o === 3 ? "VOIDED" : "OPEN";

  return (
    <div className="min-h-screen p-6" style={{ backgroundColor: "#081216", color: "#E1F5FE" }}>
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-2" style={{ fontFamily: "Sora, sans-serif" }}>
          Arc Test Panel
        </h1>
        <p className="text-sm mb-6" style={{ color: "#B0BEC5" }}>
          Tests VaultPilotMarket against local Anvil (port 8545). Make sure Anvil is running and DeployLocal has been executed.
        </p>

        {/* Markets table */}
        <div className="mb-6 rounded-lg p-4" style={{ backgroundColor: "#0E1B27", border: "1px solid #1A3C50" }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Markets</h2>
            <button
              onClick={load}
              disabled={loading}
              className="px-3 py-1.5 rounded text-sm font-medium"
              style={{ backgroundColor: "#1A3C50", color: "#4DD0E1" }}
            >
              Refresh
            </button>
          </div>
          {markets.length === 0 ? (
            <p className="text-sm" style={{ color: "#B0BEC5" }}>No markets yet. Create one below.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ color: "#B0BEC5", borderBottom: "1px solid #1A3C50" }}>
                    <th className="text-left py-2 pr-4">ID</th>
                    <th className="text-left py-2 pr-4">Question</th>
                    <th className="text-right py-2 pr-4">YES</th>
                    <th className="text-right py-2 pr-4">NO</th>
                    <th className="text-center py-2 pr-4">Odds</th>
                    <th className="text-center py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {markets.map((m) => (
                    <tr key={String(m.marketId)} style={{ borderBottom: "1px solid #1A3C50" }}>
                      <td className="py-2 pr-4 font-mono" style={{ color: "#4DD0E1" }}>#{m.marketId}</td>
                      <td className="py-2 pr-4">{m.question}</td>
                      <td className="py-2 pr-4 text-right" style={{ color: "#26A69A" }}>{m.totalYes}</td>
                      <td className="py-2 pr-4 text-right" style={{ color: "#EF5350" }}>{m.totalNo}</td>
                      <td className="py-2 pr-4 text-right">
                        {m.totalYes === "0" && m.totalNo === "0"
                          ? "50/50"
                          : `${Math.round((Number(m.totalYes) / (Number(m.totalYes) + Number(m.totalNo))) * 100)}/${Math.round((Number(m.totalNo) / (Number(m.totalYes) + Number(m.totalNo))) * 100)}`}
                      </td>
                      <td className="py-2 text-center">
                        <span
                          className="px-2 py-0.5 rounded text-xs font-medium"
                          style={{
                            backgroundColor: m.resolved
                              ? m.outcome === 1
                                ? "#26A69A20"
                                : m.outcome === 2
                                ? "#EF535020"
                                : "#FF8F0020"
                              : "#1A3C50",
                            color: m.resolved
                              ? m.outcome === 1
                                ? "#26A69A"
                                : m.outcome === 2
                                ? "#EF5350"
                                : "#FF8F00"
                              : "#B0BEC5",
                          }}
                        >
                          {outcomeLabel(m.outcome)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* Create */}
          <div className="rounded-lg p-4" style={{ backgroundColor: "#0E1B27", border: "1px solid #1A3C50" }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: "#4DD0E1" }}>Create Market</h3>
            <input
              value={newQuestion}
              onChange={(e) => setNewQuestion(e.target.value)}
              className="w-full rounded px-3 py-2 text-sm mb-3"
              style={{ backgroundColor: "#081216", border: "1px solid #1A3C50", color: "#E1F5FE" }}
            />
            <button
              onClick={handleCreate}
              disabled={loading}
              className="w-full py-2 rounded text-sm font-medium"
              style={{ backgroundColor: "#00A8B5", color: "#081216" }}
            >
              Create Market
            </button>
          </div>

          {/* Place Bet */}
          <div className="rounded-lg p-4" style={{ backgroundColor: "#0E1B27", border: "1px solid #1A3C50" }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: "#4DD0E1" }}>Place Bet</h3>
            <div className="flex gap-2 mb-3">
              <input
                value={betMarketId}
                onChange={(e) => setBetMarketId(e.target.value)}
                placeholder="Market #"
                className="flex-1 rounded px-3 py-2 text-sm"
                style={{ backgroundColor: "#081216", border: "1px solid #1A3C50", color: "#E1F5FE" }}
              />
              <select
                value={betSide}
                onChange={(e) => setBetSide(e.target.value as "YES" | "NO")}
                className="rounded px-3 py-2 text-sm"
                style={{ backgroundColor: "#081216", border: "1px solid #1A3C50", color: "#E1F5FE" }}
              >
                <option value="YES">YES</option>
                <option value="NO">NO</option>
              </select>
              <input
                value={betAmount}
                onChange={(e) => setBetAmount(e.target.value)}
                placeholder="USDC"
                className="w-20 rounded px-3 py-2 text-sm"
                style={{ backgroundColor: "#081216", border: "1px solid #1A3C50", color: "#E1F5FE" }}
              />
            </div>
            <button
              onClick={handleBet}
              disabled={loading}
              className="w-full py-2 rounded text-sm font-medium"
              style={{ backgroundColor: "#00A8B5", color: "#081216" }}
            >
              Place Bet
            </button>
          </div>

          {/* Resolve */}
          <div className="rounded-lg p-4" style={{ backgroundColor: "#0E1B27", border: "1px solid #1A3C50" }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: "#FF8F00" }}>Resolve Market</h3>
            <div className="flex gap-2 mb-3">
              <input
                value={resolveId}
                onChange={(e) => setResolveId(e.target.value)}
                placeholder="Market #"
                className="flex-1 rounded px-3 py-2 text-sm"
                style={{ backgroundColor: "#081216", border: "1px solid #1A3C50", color: "#E1F5FE" }}
              />
              <select
                value={resolveOutcome}
                onChange={(e) => setResolveOutcome(e.target.value as "YES" | "NO")}
                className="rounded px-3 py-2 text-sm"
                style={{ backgroundColor: "#081216", border: "1px solid #1A3C50", color: "#E1F5FE" }}
              >
                <option value="YES">YES</option>
                <option value="NO">NO</option>
              </select>
            </div>
            <button
              onClick={handleResolve}
              disabled={loading}
              className="w-full py-2 rounded text-sm font-medium"
              style={{ backgroundColor: "#FF8F00", color: "#081216" }}
            >
              Resolve
            </button>
          </div>

          {/* Claim */}
          <div className="rounded-lg p-4" style={{ backgroundColor: "#0E1B27", border: "1px solid #1A3C50" }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: "#26A69A" }}>Claim Winnings</h3>
            <input
              value={claimId}
              onChange={(e) => setClaimId(e.target.value)}
              placeholder="Market #"
              className="w-full rounded px-3 py-2 text-sm mb-3"
              style={{ backgroundColor: "#081216", border: "1px solid #1A3C50", color: "#E1F5FE" }}
            />
            <button
              onClick={handleClaim}
              disabled={loading}
              className="w-full py-2 rounded text-sm font-medium"
              style={{ backgroundColor: "#26A69A", color: "#081216" }}
            >
              Claim
            </button>
          </div>
        </div>

        {/* Log */}
        <div className="rounded-lg p-4" style={{ backgroundColor: "#0E1B27", border: "1px solid #1A3C50" }}>
          <h3 className="text-sm font-semibold mb-2" style={{ color: "#B0BEC5" }}>Log</h3>
          <div className="font-mono text-xs space-y-1 max-h-48 overflow-y-auto" style={{ color: "#B0BEC5" }}>
            {log.length === 0 ? <p>No actions yet.</p> : log.map((l, i) => (
              <p key={i} className={l.startsWith("ERROR") ? "text-red-400" : ""}>{l}</p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
