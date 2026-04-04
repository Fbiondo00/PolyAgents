# PolyAgents Pitch Deck (Detailed -  Privy UX -  3-Slot Optimized)

**ETHGlobal Cannes 2026**  
**PolyAgents**  
*Private Autonomous Polymarket Liquidity Agent*  
**BTC 5-Minute Scalping Strategy**  
**Arc + Hedera + ENS = $9,500**  
*23h build -  Live testnet -  Privy multi-chain UX*[1][2]

## Slide 1: Title & Opportunity

Polymarket's BTC Up/Down 5-minute markets generate **microstructure alpha**:
- **288 markets daily** (always-on turnover).
- **$0.01 bid → $0.02 flip** = 100% spread capture.
- **High noise + thin books** = predictable inefficiencies.

**Problem:** No infrastructure for private, verifiable, risk-controlled automation across CLOB trading, settlement, payments, and access control.[1]

## Slide 2: Prize Optimization (3 Slots)

| Sponsor | Prizes | Amount | PolyAgents Fit |
|---------|--------|--------|----------------|
| **Arc** | Prediction Markets | **$3,000** | USDC vault for scalping PnL settlement |
| **Hedera** | No Solidity + Agentic Payments | **$4,000** | HTS token gate + HBAR per-cycle payments |
| **ENS** | Most Creative Use | **$2,500** | Strategy params → text record commitment |

**Total: $9,500 -  Perfect 3-slot fit.** Hedera covers both tracks in 1 slot.[2][3]

## Slide 3: BTC 5m Scalping Strategy

**Passive market-making on BTC Up/Down 5-minute binaries:**

```
1. DISCOVERY: Gamma API → active 5m market
2. ENTRY: $0.01 limit bids (Up + Down)  
3. FLIP: Fill → instant $0.02 sell orders
4. EXPIRY: Stop bids 30s early → cancel buys
5. ROLLOVER: Seamless next market
6. RECONCILE: On-chain vs local inventory sync
```

**AI Microstructure Engine:**
- Fill probability (0-100%).
- Optimal tranche sizing (1-50 shares).
- Expiry risk assessment.
- Orderbook anomaly detection.[1]

## Slide 4: Architecture Diagram

```
Privy Wallet ──► PolyAgents Engine ──► BTC 5m Scalper
    │
┌──┼──┐
Arc Hedera ENS
Vault HTS+HCS Text
USDC Logs Records
```

**5s Autonomous Cycle:**
```
1. Privy auth → HTS token check
2. Agent Kit → 0.001 HBAR payment  
3. AI analysis → CLOB order ($0.01 bid)
4. HCS log → full reasoning + txs
5. Arc vault → position settlement
6. ENS update → agent.flips += 1
```

## Slide 5: Privy Multi-Chain UX

**Zero-friction operator onboarding:**

```
Email/Social → Instant testnet wallet
↓ Auto-fund:
• Arc USDC (100 faucet)
• Hedera HBAR (1 faucet) 
• Polygon MATIC (0.1)
↓ Chain switcher: Arc/Polygon/Hedera
↓ Deploy vault → live in 30s
```

**Demo:** Judges email login → funded → scalping live. No MetaMask dance.[3]

## Slide 6: Technical Stack (Next.js 16)

**Single repo -  Server Actions = fullstack:**

```
Next.js 16 (App Router + Server Actions)
├── @polymarket/clob-client (real CLOB orders) [web:10]
├── @hashgraph/sdk + Agent Kit (HTS/HCS/HBAR) [web:17]
├── viem (Arc vault + ENS text) 
├── Privy (multi-chain wallets)
├── OpenAI GPT-4o-mini (microstructure AI)
└── Zustand + Recharts (state/charts)
```

**14 deps total -  `npm run dev` = live testnet.**

## Slide 7: 3-Minute Live Demo Flow

```
**0:00** Privy email → auto-funded wallet
**0:20** Create BTC scalper vault → deploy Arc → mint HTS → HCS topic → ENS commitment
**0:45** Token gate → auto mode unlocked
**1:10** Run cycle → HBAR paid → AI: "78% fill prob" → CLOB $0.01 bid
**1:40** Fill received → Arc position → HCS logged → $0.01 profit
**2:10** Expiry countdown → rollover → next market
**2:40** Audit: HCS feed + Arc PnL + ENS verification
```

**Real txs visible throughout.**

## Slide 8: Implementation Excellence

**Server Actions orchestrate real flow:**
```typescript
runCycle() → Privy.sign → AgentKit.payHBAR() → clobClient.order() → 
              hcsClient.log() → arcClient.openPosition() → ensClient.setText()
```

**Live metrics:**
- Resting bids count.
- Inventory (Up/Down shares).
- Flips today (spread captures).
- HBAR spent (agent budget).
- Arc PnL (settled USDC).[4]

## Slide 9: Sponsor Deep Dive

### **Arc: Prediction Markets**
```
USDC-native vault records every scalp:
openPosition(marketId=42, outcome=true, price=0.01, shares=15)
closePosition(positionId=1, exitPrice=0.02) → pnl = $0.15 USDC
```
*Matches "enterprise forecasting + auditability".*[3]

### **Hedera: Dual Track Winner**
```
No Solidity: HTS non-transferable token gates execution
Agentic: 0.001 HBAR paid per cycle (48x/hour)
```
*Team caps 3/2 → near-guaranteed.*[4]

### **ENS: Cryptographic Novelty**
```
keccak256(strategyParams) → policy.commitment text record
Live: agent.flips, agent.pnl, agent.inventory, agent.mode
```
*Judges love unseen patterns.*[4]

## Slide 10: Competitive Edge

```
✅ Concrete strategy (BTC 5m scalping)
✅ Frictionless UX (Privy email → funded)
✅ Live testnet (real CLOB + tx chain)  
✅ 3-slot optimization ($9,500 max)
✅ Extensible (strategy registry ready)
✅ Production stack (Next.js 16)
✅ Team caps advantage (Hedera)
```

## Slide 11: Call to Action

```
**Live Demo:** polyagents.vercel.app
**GitHub:** github.com/yourusername/polyagents
**Video:** 3min end-to-end (link)
**Booths:** ENS Sunday • Arc • Hedera

**PolyAgents = private, verifiable, profitable Polymarket liquidity.**
**$9,500 structured.**
```

**Repo includes:** Full source -  faucet guide -  contract addresses -  demo video -  architecture diagram.[1]

Sources
[1] VaultPilot_Tasks.csv https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/342456/4aa37e8e-ef9c-478e-a5fa-596eb84d9e54/VaultPilot_Tasks.csv
[2] ETHGlobal Cannes https://ethglobal.com/events/cannes/info/details
[3] VaultPilot_Pitch_v2.pptx https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/342456/6de65ee5-fe39-486b-bf3f-8c4bd1f7c88b/VaultPilot_Pitch_v2.pptx
[4] VaultPilot_Architecture.html https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/342456/05b71773-3c06-487f-8e27-f7a8c492aef0/VaultPilot_Architecture.html
