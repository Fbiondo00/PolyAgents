
Ora ho tutto ciò che serve su Arc. Ecco il piano completo.ethglobal+2
Implementazione Arc — Step by Step
Cos'è Arc (in 30 secondi)
Arc è la L1 EVM di Circle — USDC è il gas token nativo, non ETH. Deploy esattamente come Ethereum con Foundry/Hardhat, ma ogni fee è in dollari stabili. Per PolyAgents è perfetto: vault USDC, fee USDC, tutto denominato in dollari.bim+1
🔧 STEP 0 — Setup Rete e Wallet (10 minuti)
Aggiungi Arc Testnet a MetaMask:
Campo
Valore
Network Name
Arc Testnet
RPC URL
https://rpc.testnet.arc.network
Chain ID
1120
Symbol
USDC
Explorer
https://explorer.testnet.arc.network
Ottieni USDC testnet:
Vai su faucet.testnet.arc.network → incolla il tuo indirizzo → ricevi USDC testnet per il gas e per i test dei mercati.
Aggiungi al tuo .env:
text
\# Arc ARC\_TESTNET\_RPC_URL=https://rpc.testnet.arc.network ARC\_PRIVATE\_KEY=0x...         # chiave del deployer ARC\_USDC\_ADDRESS=0x...        # indirizzo USDC su Arc Testnet (dai docs) CIRCLE\_API\_KEY=...            # da console.circle.com
🔧 STEP 1 — Setup Foundry (5 minuti)
bash
\# Installa Foundry se non ce l'hai curl -L https://foundry.paradigm.xyz |  bash foundryup   \# Nella root del progetto mkdir contracts &&  cd contracts forge init --no-git
contracts/foundry.toml:
text
src = "src" out = "out" libs =
solc = "0.8.24"
arc_testnet = "${ARC_TESTNET_RPC_URL}"
arc_testnet = { key = "any", url = "https://explorer.testnet.arc.network/api" }
Installa OpenZeppelin:
bash
forge install OpenZeppelin/openzeppelin-contracts --no-git echo  "@openzeppelin/=lib/openzeppelin-contracts/"  > remappings.txt
🔧 STEP 2 — Prediction Market Contract (45 minuti)
Crea contracts/src/PolyAgentsMarket.sol — questo è il contratto core del bounty Arc:
text
// SPDX-License-Identifier: MIT pragma solidity ^0.8.24;   import "@openzeppelin/contracts/token/ERC20/IERC20.sol"; import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol"; import "@openzeppelin/contracts/access/Ownable.sol"; import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";   /**  * @title PolyAgentsMarket * @notice Binary prediction market nativo USDC su Arc * @dev AI agent (PolyAgents) crea e gestisce i mercati */ contract PolyAgentsMarket is Ownable, ReentrancyGuard {  using SafeERC20 for IERC20;   IERC20 public immutable usdc;   enum Outcome { UNRESOLVED, YES, NO, VOIDED }   struct Market { string question;          // "BTC > 100k entro fine mese?" string category;          // "crypto", "macro", "enterprise" uint256 resolutionTime;   // timestamp di scadenza uint256 totalYes;         // USDC totale su YES uint256 totalNo;          // USDC totale su NO Outcome outcome; bool resolved; address resolver;         // chi può risolvere (agent o owner) string hederaTopicId;     // HCS audit topic collegato string policyHash;        // hash policy vault (per ENS) }   struct Position { uint256 yesShares; uint256 noShares; bool claimed; }   uint256 public marketCount; uint256 public constant MIN_BET = 1e6;    // 1 USDC (6 decimali) uint256 public constant PROTOCOL_FEE = 50; // 0.5% in basis points (50/10000)   mapping(uint256 => Market) public markets; mapping(uint256 => mapping(address => Position)) public positions; mapping(address => bool) public authorizedAgents;   event MarketCreated( uint256 indexed marketId, string question, uint256 resolutionTime, string hederaTopicId ); event BetPlaced( uint256 indexed marketId, address indexed bettor, bool isYes, uint256 amount ); event MarketResolved( uint256 indexed marketId, Outcome outcome, uint256 totalPot ); event WinningsClaimed( uint256 indexed marketId, address indexed winner, uint256 amount );   constructor(address _usdc) Ownable(msg.sender) { usdc = IERC20(_usdc); authorizedAgents
= true; }   modifier onlyAgent() { require(authorizedAgents
, "Not authorized agent"); _; }   // ───────────────────────────────────────── // AGENT FUNCTIONS // ─────────────────────────────────────────   function authorizeAgent(address agent) external onlyOwner { authorizedAgents
= true; }   /** * @notice Crea un nuovo mercato predittivo * @param question La domanda del mercato * @param category Categoria (es. "crypto", "macro") * @param resolutionTime Unix timestamp di scadenza * @param hederaTopicId Topic HCS collegato per audit * @param policyHash Hash della policy vault */ function createMarket( string calldata question, string calldata category, uint256 resolutionTime, string calldata hederaTopicId, string calldata policyHash ) external onlyAgent returns (uint256 marketId) { require(resolutionTime > block.timestamp, "Resolution in past"); require(bytes(question).length > 0, "Empty question");   marketId = ++marketCount;   markets
= Market({ question: question, category: category, resolutionTime: resolutionTime, totalYes: 0, totalNo: 0, outcome: Outcome.UNRESOLVED, resolved: false, resolver: msg.sender, hederaTopicId: hederaTopicId, policyHash: policyHash });   emit MarketCreated(marketId, question, resolutionTime, hederaTopicId); }   /** * @notice Risolve un mercato con l'esito reale */ function resolveMarket( uint256 marketId, Outcome outcome ) external { Market storage market = markets
; require(!market.resolved, "Already resolved"); require( msg.sender == market.resolver || msg.sender == owner(), "Not authorized resolver" ); require(outcome != Outcome.UNRESOLVED, "Invalid outcome"); require( block.timestamp >= market.resolutionTime, "Too early to resolve" );   market.outcome = outcome; market.resolved = true;   emit MarketResolved( marketId, outcome, market.totalYes + market.totalNo ); }   // ───────────────────────────────────────── // USER FUNCTIONS // ─────────────────────────────────────────   /** * @notice Piazza una scommessa su YES o NO * @param marketId ID del mercato * @param isYes true = YES, false = NO * @param amount USDC da scommettere (6 decimali) */ function placeBet( uint256 marketId, bool isYes, uint256 amount ) external nonReentrant { Market storage market = markets
; require(!market.resolved, "Market resolved"); require(block.timestamp < market.resolutionTime, "Market closed"); require(amount >= MIN_BET, "Below minimum bet");   usdc.safeTransferFrom(msg.sender, address(this), amount);   Position storage pos = positions
;   if (isYes) { market.totalYes += amount; pos.yesShares += amount; } else { market.totalNo += amount; pos.noShares += amount; }   emit BetPlaced(marketId, msg.sender, isYes, amount); }   /** * @notice Riscuote le vincite dopo la risoluzione */ function claimWinnings(uint256 marketId) external nonReentrant { Market storage market = markets
; require(market.resolved, "Not resolved yet");   Position storage pos = positions
; require(!pos.claimed, "Already claimed"); pos.claimed = true;   uint256 payout = calculatePayout(marketId, msg.sender); require(payout > 0, "No winnings");   // Applica protocol fee uint256 fee = (payout * PROTOCOL_FEE) / 10000; uint256 netPayout = payout - fee;   usdc.safeTransfer(msg.sender, netPayout); usdc.safeTransfer(owner(), fee); // fee al treasury   emit WinningsClaimed(marketId, msg.sender, netPayout); }   // ───────────────────────────────────────── // VIEW FUNCTIONS // ─────────────────────────────────────────   function calculatePayout( uint256 marketId, address user ) public view returns (uint256) { Market storage market = markets
; Position storage pos = positions
;   if (market.outcome == Outcome.VOIDED) { return pos.yesShares + pos.noShares; // rimborso totale }   if (market.outcome == Outcome.YES && pos.yesShares > 0) { uint256 totalPot = market.totalYes + market.totalNo; return (pos.yesShares * totalPot) / market.totalYes; }   if (market.outcome == Outcome.NO && pos.noShares > 0) { uint256 totalPot = market.totalYes + market.totalNo; return (pos.noShares * totalPot) / market.totalNo; }   return 0; }   function getMarket(uint256 marketId) external view returns (Market memory) { return markets
; }   function getUserPosition(uint256 marketId, address user) external view returns (Position memory) { return positions
; }   function getOdds(uint256 marketId) external view returns (uint256 yesOdds, uint256 noOdds) { Market storage market = markets
; uint256 total = market.totalYes + market.totalNo; if (total == 0) return (5000, 5000); // 50/50 default   yesOdds = (market.totalYes * 10000) / total; noOdds = 10000 - yesOdds; } }
🔧 STEP 3 — Deploy su Arc Testnet (10 minuti)
Script di deploy contracts/script/Deploy.s.sol:
text
// SPDX-License-Identifier: MIT pragma solidity ^0.8.24;   import "forge-std/Script.sol"; import "../src/PolyAgentsMarket.sol";   contract DeployScript is Script {  // Indirizzo USDC su Arc Testnet — verifica su docs.arc.network address constant ARC\_TESTNET\_USDC = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;   function run() external { uint256 deployerKey = vm.envUint("ARC\_PRIVATE\_KEY"); vm.startBroadcast(deployerKey);   PolyAgentsMarket market = new PolyAgentsMarket(ARC\_TESTNET\_USDC);   console.log("PolyAgentsMarket deployed at:", address(market)); console.log("Explorer: https://explorer.testnet.arc.network/address/", address(market));   vm.stopBroadcast(); } }
Deploy:
bash
cd contracts   \# Compila prima forge build   \# Deploy forge script script/Deploy.s.sol \  --rpc-url $ARC\_TESTNET\_RPC_URL  \  --private-key $ARC\_PRIVATE\_KEY  \  --broadcast \ --verify   \# Output atteso: \# PolyAgentsMarket deployed at: 0xABCD... \# Explorer: https://explorer.testnet.arc.network/address/0xABCD...
Salva l'indirizzo nel .env:
text
POLYAGENTS_CONTRACT_ADDRESS=0xABCD...
🔧 STEP 4 — Backend TypeScript — Interazione col Contratto (30 minuti)
Crea src/arc/market-client.ts usando viem (che stai già usando):
typescript
import  {  createPublicClient,  createWalletClient,  http,  parseUnits,  formatUnits, getContract }  from  "viem"; import  { privateKeyToAccount }  from  "viem/accounts"; import  {  POLYAGENTS_ABI  }  from  "./abi";  // genera con: forge inspect PolyAgentsMarket abi   const arcTestnet =  {  id:  1120,  name:  "Arc Testnet",  nativeCurrency:  { name:  "USD Coin",  symbol:  "USDC", decimals:  6  },  rpcUrls:  {  default:  { http:
}  },  blockExplorers:  {  default:  { url:  "https://explorer.testnet.arc.network"  }  } }  as  const;   const account =  privateKeyToAccount(  process.env.ARC_PRIVATE_KEY  as  0x${string} );   export  const publicClient =  createPublicClient({  chain: arcTestnet,  transport:  http() });   export  const walletClient =  createWalletClient({  chain: arcTestnet,  account,  transport:  http() });   const contractAddress = process.env.POLYAGENTS_CONTRACT_ADDRESS  as  0x${string}; const usdcAddress = process.env.ARC_USDC_ADDRESS  as  0x${string};   // ── Crea mercato (chiamata dall'agent) ── export  async  function  createPredictionMarket(opts:  {  question:  string;  category:  string;  resolutionTime: Date;  hederaTopicId:  string;  policyHash:  string; }):  Promise<{ marketId: bigint; txHash:  string  }>  {  const resolutionTimestamp =  BigInt(  Math.floor(opts.resolutionTime.getTime()  /  1000)  );    const txHash =  await walletClient.writeContract({  address: contractAddress,  abi:  POLYAGENTS_ABI,  functionName:  "createMarket",  args:
});    const receipt =  await publicClient.waitForTransactionReceipt({ hash: txHash });    // Estrai marketId dall'evento  const event = receipt.logs
;  const marketId =  BigInt(event.topics
??  "0x1");    console.log(✅ Market created #${marketId} → ${txHash});  return  { marketId, txHash }; }   // ── Approve USDC + Piazza scommessa ── export  async  function  placeBet(opts:  {  marketId: bigint;  isYes:  boolean;  amountUsdc:  number;  // in USDC (es. 10 = 10 USDC) }):  Promise<string>  {  const amount =  parseUnits(opts.amountUsdc.toString(),  6);    // 1. Approve USDC al contratto  const approveTx =  await walletClient.writeContract({  address: usdcAddress,  abi:
,  outputs:
,  stateMutability:  "nonpayable"  }],  functionName:  "approve",  args:
});  await publicClient.waitForTransactionReceipt({ hash: approveTx });    // 2. Piazza la scommessa  const txHash =  await walletClient.writeContract({  address: contractAddress,  abi:  POLYAGENTS_ABI,  functionName:  "placeBet",  args:
});    await publicClient.waitForTransactionReceipt({ hash: txHash });  console.log(💰 Bet placed on market #${opts.marketId} → ${txHash});  return txHash; }   // ── Risolvi mercato ── export  async  function  resolveMarket(  marketId: bigint,  outcomeYes:  boolean ):  Promise<string>  {  const outcome = outcomeYes ?  1  :  2;  // 1=YES, 2=NO    const txHash =  await walletClient.writeContract({  address: contractAddress,  abi:  POLYAGENTS_ABI,  functionName:  "resolveMarket",  args:
});    await publicClient.waitForTransactionReceipt({ hash: txHash });  return txHash; }   // ── Read-only: stato mercato ── export  async  function  getMarketData(marketId: bigint)  {  const market =  await publicClient.readContract({  address: contractAddress,  abi:  POLYAGENTS_ABI,  functionName:  "getMarket",  args:
})  as  {  question:  string;  totalYes: bigint;  totalNo: bigint;  resolved:  boolean;  outcome:  number;  };    return  {  question: market.question,  totalYes:  formatUnits(market.totalYes,  6),  totalNo:  formatUnits(market.totalNo,  6),  resolved: market.resolved,  outcome:
}; }
🔧 STEP 5 — Integra l'Agent AI con Arc + Hedera (20 minuti)
Questo è il punto dove Arc + Hedera si collegano — ogni azione dell'agente tocca entrambe le chain:
typescript
// src/agent/vault-agent.ts import  { createPredictionMarket, placeBet, resolveMarket }  from  "../arc/market-client"; import  { payForLLMCall }  from  "../hedera/agent-payment"; import  { logToHCS }  from  "../hedera/hcs-logger";   export  async  function  agentAnalyzeAndBet(opts:  {  vaultId:  string;  hederaTopicId:  string;  policyHash:  string; })  {  // 1\. Paga Hedera prima della chiamata LLM  const payment =  await  payForLLMCall("market_analysis", opts.vaultId);    // 2\. Chiama il tuo LLM per analisi di mercato  const analysis =  await yourLLM.invoke(` Analyze current market conditions and suggest a binary prediction market question  for vault ${opts.vaultId}. Return JSON: { question, category, daysToResolution, confidence, position }  `);    const decision =  JSON.parse(analysis.content);    // 3\. Log decisione su HCS (immutabile)  await  logToHCS({  event:  "TRADE_ANALYZED",  vault_id: opts.vaultId,  question: decision.question,  confidence: decision.confidence,  llm\_payment\_tx: payment.txId  });    // 4\. Crea mercato su Arc  const resolutionTime =  new  Date();  resolutionTime.setDate(resolutionTime.getDate()  + decision.daysToResolution);    const  { marketId, txHash: createTx }  =  await  createPredictionMarket({  question: decision.question,  category: decision.category,  resolutionTime,  hederaTopicId: opts.hederaTopicId,  policyHash: opts.policyHash  });    // 5\. Piazza scommessa con il vault  const betTx =  await  placeBet({  marketId,  isYes: decision.position ===  "YES",  amountUsdc:  10  // importo dal vault  });    // 6\. Log finale su HCS  await  logToHCS({  event:  "TRADE_EXECUTED",  vault_id: opts.vaultId,  market_id: marketId.toString(),  arc\_market\_tx: createTx,  arc\_bet\_tx: betTx,  position: decision.position,  amount_usdc:  "10"  });    return  { marketId, createTx, betTx }; }
🔧 STEP 6 — Endpoint API Backend (15 minuti)
Aggiungi a src/api/arc.routes.ts:
typescript
import  { Router }  from  "express"; import  { createPredictionMarket, getMarketData, resolveMarket }  from  "../arc/market-client";   const router =  Router();   // Lista mercati attivi router.get("/markets",  async  (req, res)  =>  {  // Leggi da DB locale o direttamente dal contratto  res.json({ markets:  \
});  // popola dal tuo DB });   // Dettaglio singolo mercato router.get("/markets/:id",  async  (req, res)  =>  {  const data =  await  getMarketData(BigInt(req.params.id));  res.json(data); });   // Crea mercato (agent only — protetto da API key) router.post("/markets",  async  (req, res)  =>  {  const  { question, category, resolutionTime, hederaTopicId, policyHash }  = req.body;  const result =  await  createPredictionMarket({  question,  category,  resolutionTime:  new  Date(resolutionTime),  hederaTopicId, policyHash  });  res.json(result); });   // Risolvi mercato router.post("/markets/:id/resolve",  async  (req, res)  =>  {  const txHash =  await  resolveMarket(  BigInt(req.params.id),  req.body.outcome ===  "YES"  );  res.json({ txHash }); });   export  default router;
🔧 STEP 7 — Diagramma Architettura (Obbligatorio per il Bounty)
Il bounty Arc richiede esplicitamente un architecture diagram. Mettilo nel README:ethglobal
text
┌─────────────────────────────────────────────────────────┐ │                    PolyAgents                           │ │                                                         │ │  ┌──────────┐    ┌──────────────┐    ┌──────────────┐  │ │  │  React   │───▶│  Express API │───▶│  AI Agent    │  │ │  │ Frontend │◀───│   Backend    │◀───│  (LLM Loop)  │  │ │  └──────────┘    └──────┬───────┘    └──────┬───────┘  │ │                         │                   │           │ └─────────────────────────┼───────────────────┼───────────┘  │                   │ ┌────────────┼───────────────────┼─────────┐ │            ▼                   ▼         │ │   ┌────────────────┐  ┌──────────────┐   │ │   │  Arc Testnet   │  │   Hedera     │   │ │   │  (EVM L1)      │  │   Testnet    │   │ │   │                │  │              │   │ │   │ PolyAgentsMarkt│  │ HTS Token    │   │ │   │ \- createMarket │  │ HCS Audit    │   │ │   │ \- placeBet     │  │ HCS-14 UAID  │   │ │   │ \- resolveMarket│  │ Scheduled TX │   │ │   │ USDC gas token │  │ Mirror Node  │   │ │   └────────────────┘  └──────────────┘   │ └────────────────────────────────────────────┘ │ ┌────────────▼───────────┐ │  ENS (Sepolia)          │ │  vault.polyagents.eth   │ │  text: policy.commitment│ │  text: agent.lastTrade  │ └────────────────────────┘
🔧 STEP 8 — Test Smoke Contratto (10 minuti)
typescript
// src/arc/smoke-test.ts import  { createPredictionMarket, getMarketData, placeBet }  from  "./market-client";   async  function  arcSmokeTest()  {  console.log("🧪 Arc Smoke Test\n");    // 1\. Crea mercato  const  { marketId, txHash: createTx }  =  await  createPredictionMarket({  question:  "Will BTC close above $100k this week?",  category:  "crypto",  resolutionTime:  new  Date(Date.now()  +  7  *  24  *  60  *  60  *  1000),  hederaTopicId: process.env.HEDERA\_TOPIC\_ID!,  policyHash:  "0x"  +  "a".repeat(64)  });    console.log(`✅ Market #${marketId} created`);  console.log(` https://explorer.testnet.arc.network/tx/${createTx}\n`);    // 2\. Leggi stato  const data =  await  getMarketData(marketId);  console.log("📊 Market data:", data);    // 3\. Piazza scommessa  const betTx =  await  placeBet({ marketId, isYes:  true, amountUsdc:  1  });  console.log(`✅ Bet placed → https://explorer.testnet.arc.network/tx/${betTx}`); }   arcSmokeTest().catch(console.error);
bash
npx ts-node src/arc/smoke-test.ts
Checklist Bounty Arc $3.000
Requisito
Come lo soddisfi
Step
Deploy contratti su Arc
forge script deploy su Arc Testnet
3
MVP funzionante frontend + backend
React + Express + viem
4–6
Architecture diagram (obbligatorio)
Diagramma ASCII nel README
7
Video demo funzioni core
Mercato → Bet → Risoluzione
—
Documentazione dettagliata
README + NatSpec Solidity
2
USDC/EURC nativo
Gas in USDC, scommesse in USDC
2
Real-world utility (non solo speculazione)
AI agent con audit trail Hedera
5
Deterministic finality
Arc garantisce finality in ~2s bim
—
