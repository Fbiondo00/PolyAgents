Good changes. Let me work through all four questions using the prize data already pulled.
1. Is This Valid?
Yes, with one important clarification to check.
ETHGlobal allows submitting to multiple tracks within the same sponsor — Hedera has two separate judging panels for "No Solidity" and "AI & Agentic Payments." They evaluate different criteria and are funded separately. This is standard ETHGlobal practice. Your stack is valid.
One risk to flag: the document says "Both Hedera tracks count as 1 partner slot." This is wrong. ETHGlobal counts sponsor integrations, not tracks. Using Hedera for two tracks still counts as one sponsor. You have used 2 of 3 sponsor slots (Arc + Hedera). This is actually an advantage — you have a free slot for a third sponsor.
2. Prize Rules — Straight From the Page
Arc · Best Prediction Markets Built on Arc with Real-World Signal · $3,000
What they want: Prediction markets that go beyond speculation — forecasting, hedging, decision-making with USDC/EURC-native infrastructure, deterministic finality, and compliance-ready architecture. Institutional and enterprise credibility required.
Hard requirements:
  Functional MVP with working frontend and backend
  Architecture diagram (mandatory)
  Video demonstration outlining core functions
  Detailed documentation
  Link to GitHub/Replit repo
  Must deploy contracts to Arc
Your fit: Direct. Arc's brief lists "governance & enterprise forecasting with identity, compliance, auditability" — the exact framing of PolyAgents. USDC-native vault on Arc EVM is structural, not cosmetic.
Hedera · No Solidity Allowed · $1,000 each · up to 3 teams
What they want: A working app using only the Hedera JS/TS or Python SDK. No Solidity, no smart contracts. Must combine at least two native Hedera services.
Hard requirements:
  Use @hashgraph/sdk JS/TS or Python SDK only — zero Solidity anywhere in the codebase
  At least two native Hedera services combined (HTS + HCS qualifies perfectly)
  Public GitHub repo with README covering setup and usage
  ≤5-minute demo video showing the application in action
Bonus points (explicitly listed):
  Coherent end-to-end user experience
  Integration with Hedera Mirror Node REST API
  Creative use of HCS for data integrity or logging
  Use of Hedera Agent Kit for AI-driven workflows (counts as SDK usage)
Your fit: HTS token mint (service 1) + HCS topic per vault (service 2) + zero Solidity. Brief explicitly lists "Token-Gated Access" as a suggested project idea. 3-team cap.
Hedera · AI & Agentic Payments · $3,000 each · up to 2 teams
What they want: AI agents that move value autonomously on Hedera — sub-second finality, predictable sub-cent fees, native token operations without smart contract overhead.
Hard requirements:
  At least one autonomous payment, token transfer, or financial operation on Hedera Testnet
  Use one or more of: Hedera Agent Kit JS/TS or Python, OpenClaw ACP, x402, A2A, or Hedera SDKs directly
  Public GitHub repo with README covering setup, architecture, and how the payment flow works
  ≤5-minute demo video showing agent performing autonomous payment actions
Bonus points (explicitly listed):
  Verifiable payment audit trails using HCS ← you have this
  On-chain agent identity using HCS-14
  Scheduled or recurring payments via Hedera Scheduled Transactions
Your fit: Agent pays 0.001 HBAR before each LLM call autonomously. HCS logs every decision. Hedera Agent Kit TS. 2-team cap — near-guaranteed if you submit a working demo.
3. Third Bounty — ENS · Most Creative Use · $2,500
This is your free slot and the cleanest add to the existing stack.
Why ENS Most Creative and not something else:
Every other easy prize has a catch. Dynamic JS SDK requires using their auth flow which conflicts with your existing wallet setup. WalletConnect AppKit requires two non-EVM chain ecosystems and Arc + Hedera are both EVM-compatible. Unlink is Base Sepolia only, different chain from Arc. Chainlink Price Feeds may not be deployed on Arc yet.
ENS needs only viem which you're already using, and the "Most Creative" track has a genuinely high creative bar — meaning casual teams won't win it by just adding name resolution. Your use case is novel enough to win.
The creative use: Store a keccak256 hash of the vault's policy config as an ENS text record key policy.commitment on a vault subname (vault-abc.polyagents.eth). Anyone can verify the agent ran exactly the policy it was initialized with — without ever seeing the policy content. You also write live agent stats (agent.lastTrade, agent.pnl, agent.mode) as text records, turning the vault's ENS name into a public identity card readable by any ENS-aware tool. This is cryptographic commitment via text records — something ENS judges will not have seen before.
ENS Most Creative rules:
  ENS must clearly improve the product — not cosmetic
  Demo must be functional, no hard-coded values
  Submit with video or live demo link
  Must present at ENS booth in person Sunday morning — put this in your calendar now
Extra work required: ~2 hours. viem setText and getText are 10-line integrations. Register one subname on ENS app (5 minutes). Wire policy hash write on vault creation, stats write on each trade. Done.
Updated prize ceiling with ENS added: $9,500
4. Implementation Roadmap
Before You Arrive — Setup (2 hours)
Task
Tool
Output
Create Hedera testnet account
portal.hedera.com
Account ID + private key
Create Arc testnet wallet
MetaMask + Arc RPC
Funded testnet address
Get Arc testnet USDC
Arc Discord faucet
USDC balance
Register polyagents.eth subname
ENS app
ENS name ready
Init Next.js project with viem, @hashgraph/sdk, @hashgraph/hedera-agent-kit
npm
Repo scaffolded
Write vault Solidity contract locally (not deployed yet)
Hardhat
Contract ready
Day 1 — Morning · Core Infrastructure (4 hours)
Task
Tool
Time
Deploy vault contract to Arc testnet
Hardhat + viem
1.5h
Test openPosition / closePosition with testnet USDC
viem
30min
Create HCS topic for audit log
Hedera JS SDK
30min
Write logDecision(payload) helper to HCS
Hedera JS SDK
30min
Create HTS token definition (non-transferable operator token)
Hedera JS SDK
30min
Write mintOperatorToken(walletAddress) helper
Hedera JS SDK
30min
Day 1 — Afternoon · Agent Core (4 hours)
Task
Tool
Time
Polymarket API connector — read markets + odds
fetch
1h
LLM analysis call — prompt returns confidence score + reasoning
OpenAI / Anthropic API
1h
payAndInfer() — HBAR micropayment before each LLM call
Hedera Agent Kit TS
1h
Policy engine — check confidence + size + daily loss before executing
TypeScript class
1h
Day 1 — Evening · Frontend Skeleton (3 hours)
Route
What to build
Time
/
Hero + vault stats ticker + "Create Vault" CTA
45min
/vault/create
Policy form + wallet connect + mint token trigger
1h
/vault/\[id\]
Dashboard shell — status, budget, last trade, mode toggle
1h
Wire /vault/create submit → Arc deploy + Hedera token mint + ENS text record write
Backend API route
15min
Day 2 — Morning · Remaining Routes (3 hours)
Route
What to build
Time
/vault/\[id\]/markets
Polymarket list + confidence scores per market
45min
/vault/\[id\]/policy
Editable policy form + re-hash on save
30min
/vault/\[id\]/audit
HCS log feed + Arc positions + PnL timeline
1h
/vault/\[id\]/agent
HBAR balance + last payment tx + decision queue
30min
/vault/\[id\]/token
HTS token ID + mint tx hash + access level badge
15min
Day 2 — Afternoon · Integration + Polish (3 hours)
Task
Tool
Time
Wire full agent loop end-to-end: pay → analyze → log → execute
Node backend
1.5h
ENS text record writes: policy hash on create, stats on each trade
viem setText
45min
Advisory vs auto mode toggle — check HTS token balance before switching
Hedera JS SDK
30min
Error states + loading indicators on all routes
React
15min
Day 2 — Evening · Demo Prep (2 hours)
Task
Time
Full end-to-end run-through — catch any broken flows
45min
Fix anything broken
30min
Write README — setup instructions, architecture diagram, which SDK used where
30min
Record 3-minute demo video following the 5-beat script from Slide 8
15min
Day 3 — Morning · Submissions (2 hours)
Task
Priority
Submit to Arc on ETHGlobal — attach architecture diagram + video
First
Submit to Hedera No Solidity — attach video, confirm zero Solidity in repo
Second
Submit to Hedera Agentic Payments — attach video, highlight payment flow in README
Third
Submit to ENS Most Creative — attach video
Fourth
Go to ENS booth in person Sunday morning
Non-negotiable for ENS prize
Go to Arc, Hedera booths to introduce yourself
Strongly recommended
Full Timeline Summary
Period
Hours
Deliverable
Pre-arrival
2h
Accounts, scaffold, contract drafted
Day 1 morning
4h
Arc deployed + Hedera SDK wired
Day 1 afternoon
4h
Agent loop working
Day 1 evening
3h
Frontend skeleton live
Day 2 morning
3h
All 8 routes complete
Day 2 afternoon
3h
Full integration + ENS
Day 2 evening
2h
Demo prep + README + video
Day 3 morning
2h
Submissions + booth visits
Total
23h
4 prize submissions, 0 blockers
