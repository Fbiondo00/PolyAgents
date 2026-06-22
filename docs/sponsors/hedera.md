> **UN-IMPLEMENTED DESIGN DOC — DO NOT SUBMIT AS DONE.** This is a pre-hackathon step-by-step **plan** for a Hedera integration (HTS tokens, HCS audit topics, HBAR micropayments, HCS-14 agent identity, scheduled transactions, Mirror Node queries). **None of it was implemented.** There is no `src/hedera/` or `lib/hedera/` module, no `@hashgraph/sdk` usage, and no Hedera testnet calls in this repo (the Hedera integration was removed — see commit `66f74c8`). The code blocks below are reference sketches, not working code. Do not present this document as evidence of a completed Hedera bounty (neither "No Solidity Allowed" nor "AI & Agentic Payments"). It is retained only as a reference design.

---

Ecco il piano di esecuzione esatto, in ordine di implementazione. Copia-incolla ogni blocco nell'ordine dato — nessun passo dipende da qualcosa che non è ancora stato creato.
Implementazione Hedera — Esecuzione Step by Step
🔧 STEP 0 — Installa e Configura (5 minuti)
bash
\# Nella root del tuo progetto PolyAgents npm  install @hashgraph/sdk hedera-agent-kit dotenv
Aggiungi al tuo .env:
text
HEDERA\_OPERATOR\_ID=0.0.XXXXXX HEDERA\_OPERATOR\_KEY=302e020100300506032b657004220420... HEDERA_NETWORK=testnet
Ottieni le credenziali gratis su portal.hedera.com → "Create Testnet Account" → ti dà operator ID e chiave privata.
🔧 STEP 1 — Client Base (2 minuti)
Crea src/hedera/client.ts:
typescript
import  { Client, PrivateKey, AccountId }  from  "@hashgraph/sdk"; import  *  as dotenv from  "dotenv"; dotenv.config();   if  (!process.env.HEDERA\_OPERATOR\_ID  ||  !process.env.HEDERA\_OPERATOR\_KEY)  {  throw  new  Error("Hedera credentials missing in .env"); }   export  const hederaClient = Client.forTestnet(); hederaClient.setOperator(  AccountId.fromString(process.env.HEDERA\_OPERATOR\_ID),  PrivateKey.fromStringDer(process.env.HEDERA\_OPERATOR\_KEY) );   export  const operatorId = AccountId.fromString(process.env.HEDERA\_OPERATOR\_ID); export  const operatorKey = PrivateKey.fromStringDer(process.env.HEDERA\_OPERATOR\_KEY);
Verifica che funzioni:
typescript
// src/hedera/test-connection.ts import  { AccountBalanceQuery }  from  "@hashgraph/sdk"; import  { hederaClient, operatorId }  from  "./client";   const balance =  await  new  AccountBalanceQuery()  .setAccountId(operatorId)  .execute(hederaClient);   console.log(`✅ Connected. Balance: ${balance.hbars.toString()}`);
bash
npx ts-node src/hedera/test-connection.ts \# Output atteso: ✅ Connected. Balance: 100 ℏ
🔧 STEP 2 — HTS: Vault Token (15 minuti)
→ Copre: No Solidity Servizio #1 + Custom Fee (bonus)
Crea src/hedera/hts-vault.ts:
typescript
import  {  TokenCreateTransaction,  TokenMintTransaction,  TokenAssociateTransaction,  TokenType,  TokenSupplyType,  CustomFixedFee,  TokenId,  AccountId, Hbar }  from  "@hashgraph/sdk"; import  { hederaClient, operatorId, operatorKey }  from  "./client";   export  interface  VaultTokenResult  {  tokenId:  string;  tokenName:  string;  initialSupply:  number; }   export  async  function  createVaultToken(  vaultName:  string,  vaultId:  string ):  Promise<VaultTokenResult>  {  // Custom fee: 1 tinycent HBAR per trasferimento (punti extra bounty)  const customFee =  new  CustomFixedFee()  .setHbarAmount(new  Hbar(0.0001))  .setFeeCollectorAccountId(operatorId);    const tokenName =  PolyAgents-${vaultName};  const tokenSymbol =  "VPLT";    const createTx =  await  new  TokenCreateTransaction()  .setTokenName(tokenName)  .setTokenSymbol(tokenSymbol)  .setTokenType(TokenType.FungibleCommon)  .setDecimals(6)  .setInitialSupply(0)  .setTreasuryAccountId(operatorId)  .setSupplyType(TokenSupplyType.Infinite)  .setAdminKey(operatorKey.publicKey)  .setSupplyKey(operatorKey.publicKey)  .setCustomFees(
)  .setTokenMemo(PolyAgents vault token — ${vaultId})  .freezeWith(hederaClient)  .sign(operatorKey);    const response =  await createTx.execute(hederaClient);  const receipt =  await response.getReceipt(hederaClient);  const tokenId = receipt.tokenId!.toString();    console.log(✅ HTS Token created: ${tokenId});  return  { tokenId, tokenName, initialSupply:  0  }; }   export  async  function  mintVaultShares(  tokenId:  string,  sharesAmount:  number  // numero di quote (es. 1000) ):  Promise<void>  {  const mintTx =  await  new  TokenMintTransaction()  .setTokenId(TokenId.fromString(tokenId))  .setAmount(sharesAmount *  1_000_000)  // 6 decimali  .freezeWith(hederaClient)  .sign(operatorKey);    const response =  await mintTx.execute(hederaClient);  await response.getReceipt(hederaClient);  console.log(✅ Minted ${sharesAmount} vault shares for token ${tokenId}); }
🔧 STEP 3 — HCS: Audit Topic (15 minuti)
→ Copre: No Solidity Servizio #2 + AI Payments Bonus #1 (verifiable audit trail)
Crea src/hedera/hcs-logger.ts:
typescript
import  {  TopicCreateTransaction,  TopicMessageSubmitTransaction, TopicId }  from  "@hashgraph/sdk"; import  { hederaClient, operatorKey }  from  "./client";   // Persisti questo ID in .env dopo la prima esecuzione let activeTopicId: TopicId |  null  =  null;   export  async  function  createVaultAuditTopic(vaultId:  string):  Promise<string>  {  const createTx =  await  new  TopicCreateTransaction()  .setTopicMemo(PolyAgents Audit Log — ${vaultId})  .setSubmitKey(operatorKey.publicKey)  .setAdminKey(operatorKey.publicKey)  .freezeWith(hederaClient)  .sign(operatorKey);    const response =  await createTx.execute(hederaClient);  const receipt =  await response.getReceipt(hederaClient);  const topicId = receipt.topicId!;    activeTopicId = topicId;  console.log(✅ HCS Topic created: ${topicId.toString()});    // Salva in .env per riutilizzo  console.log(→ Add to .env: HEDERA\_TOPIC\_ID=${topicId.toString()});  return topicId.toString(); }   export  function  setActiveTopic(topicIdStr:  string):  void  {  activeTopicId = TopicId.fromString(topicIdStr); }   export  type  AuditEventType  =  |  "VAULT_INITIALIZED"  |  "LLM_CALL_AUTHORIZED"  |  "TRADE_ANALYZED"  |  "TRADE_EXECUTED"  |  "RISK_CHECK"  |  "REBALANCE_TRIGGERED"  |  "PAYMENT_MADE"  |  "SCHEDULE_CREATED"  |  "AGENT_STARTED"  |  "ERROR";   export  async  function  logToHCS(payload:  {  event: AuditEventType;  vault_id?:  string;
:  unknown; }):  Promise<string>  {  if  (!activeTopicId)  {  throw  new  Error("HCS topic not initialized. Call createVaultAuditTopic first.");  }    const message =  JSON.stringify({  ...payload,  agent:  "PolyAgents-v1",  network:  "hedera-testnet",  ts:  new  Date().toISOString()  });    const submitTx =  await  new  TopicMessageSubmitTransaction()  .setTopicId(activeTopicId)  .setMessage(message)  .setMaxChunks(10)  .freezeWith(hederaClient)  .sign(operatorKey);    const response =  await submitTx.execute(hederaClient);  const receipt =  await response.getReceipt(hederaClient);    console.log(`📝 HCS log:
seq#${receipt.topicSequenceNumber}`);  return receipt.topicSequenceNumber.toString(); }
🔧 STEP 4 — Micropagamento Autonomo (15 minuti)
→ Copre: AI & Agentic Payments — Requisito CORE ($3.000)
Crea src/hedera/agent-payment.ts:
typescript
import  {  TransferTransaction,  Hbar, TransactionId }  from  "@hashgraph/sdk"; import  { hederaClient, operatorId }  from  "./client"; import  { logToHCS }  from  "./hcs-logger";   export  interface  PaymentReceipt  {  txId:  string;  amount:  string;  consensusTimestamp:  string;  hashscanUrl:  string; }   export  async  function  payForLLMCall(  callContext:  string,  // es. "market_analysis", "risk_check", "trade_decision"  vaultId:  string ):  Promise<PaymentReceipt>  {  const amount =  new  Hbar(0.001);    const tx =  await  new  TransferTransaction()  .addHbarTransfer(operatorId, amount.negated())  .addHbarTransfer(operatorId, amount)  // self-pay per demo; in prod usa treasury separato  .setTransactionMemo(PolyAgents:${vaultId}:${callContext})  .execute(hederaClient);    const record =  await tx.getRecord(hederaClient);  const txId = tx.transactionId.toString();  const timestamp = record.consensusTimestamp.toDate().toISOString();    // Log immediato su HCS  await  logToHCS({  event:  "PAYMENT_MADE",  vault_id: vaultId,  amount_hbar:  "0.001",  call_context: callContext,  tx_id: txId,  consensus_timestamp: timestamp  });    const hashscanUrl =  https://hashscan.io/testnet/transaction/${txId};  console.log(`💸 Payment made for
→ ${hashscanUrl}`);    return  { txId, amount:  "0.001 ℏ", consensusTimestamp: timestamp, hashscanUrl }; }
Adesso wrappa ogni tua chiamata LLM esistente:
typescript
// Nel tuo agent loop — cerca dove chiami OpenAI/Llama/DeepSeek // PRIMA: const analysis =  await llm.invoke(prompt);   // DOPO (3 righe da aggiungere): await  payForLLMCall("market_analysis", vault.id);  // ← aggiunto const analysis =  await llm.invoke(prompt); await  logToHCS({ event:  "TRADE_ANALYZED", vault_id: vault.id, result: analysis.content });  // ← aggiunto
🔧 STEP 5 — HCS-14 Agent Identity (20 minuti)
→ Copre: AI Payments Bonus #2 — rarissimo, differenziante
Crea src/hedera/agent-identity.ts:
typescript
import  {  TopicCreateTransaction, TopicMessageSubmitTransaction }  from  "@hashgraph/sdk"; import  { hederaClient, operatorId, operatorKey }  from  "./client";   export  interface  AgentIdentity  {  topicId:  string;  uaid:  string;  registrationTxId:  string; }   export  async  function  registerHCS14Identity():  Promise<AgentIdentity>  {  // 1. Topic dedicato all'identità dell'agente  const topicTx =  await  new  TopicCreateTransaction()  .setTopicMemo("PolyAgents Agent Identity — HCS-14 UAID")  .setAdminKey(operatorKey.publicKey)  .freezeWith(hederaClient)  .sign(operatorKey);    const topicResponse =  await topicTx.execute(hederaClient);  const topicReceipt =  await topicResponse.getReceipt(hederaClient);  const topicId = topicReceipt.topicId!.toString();    // 2. Definizione HCS-14 completa  const agentDefinition =  {  p:  "hcs-14",  // protocollo  op:  "register",  t_id: topicId,  m:  {  name:  "PolyAgents",  description:  "Autonomous AI agent for prediction market vault management",  version:  "1.0.0",  type:  "financial-agent",  capabilities:
,  network:  "hedera-testnet",  operator: operatorId.toString(),  audit_topic: process.env.HEDERA_TOPIC_ID  ??  "pending",  created_at:  new  Date().toISOString()  }  };    // 3. Pubblica su HCS  const msgTx =  await  new  TopicMessageSubmitTransaction()  .setTopicId(topicReceipt.topicId!)  .setMessage(JSON.stringify(agentDefinition))  .freezeWith(hederaClient)  .sign(operatorKey);    const msgResponse =  await msgTx.execute(hederaClient);  const msgReceipt =  await msgResponse.getReceipt(hederaClient);    const uaid =  hcs14:hedera:testnet:${topicId};  const registrationTxId = msgResponse.transactionId.toString();    console.log(✅ HCS-14 Agent Identity registered);  console.log( UAID: ${uaid});  console.log( https://hashscan.io/testnet/topic/${topicId});    // Salva per .env  console.log(→ Add to .env: HEDERA\_AGENT\_TOPIC_ID=${topicId});    return  { topicId, uaid, registrationTxId }; }
🔧 STEP 6 — Scheduled Transaction (15 minuti)
→ Copre: AI Payments Bonus #3
Crea src/hedera/scheduler.ts:
typescript
import  {  ScheduleCreateTransaction,  ScheduleInfoQuery,  TransferTransaction,  ScheduleId,  Hbar, AccountId }  from  "@hashgraph/sdk"; import  { hederaClient, operatorId, operatorKey }  from  "./client"; import  { logToHCS }  from  "./hcs-logger";   export  async  function  scheduleVaultOperation(opts:  {  vaultId:  string;  memo:  string;  recipientId?:  string;  amountHbar?:  number; }):  Promise<string>  {  const recipient = opts.recipientId  ? AccountId.fromString(opts.recipientId)  : operatorId;  const amount = opts.amountHbar ??  0.001;    // Transazione che verrà eseguita in futuro  const innerTx =  new  TransferTransaction()  .addHbarTransfer(operatorId,  new  Hbar(-amount))  .addHbarTransfer(recipient,  new  Hbar(amount))  .setTransactionMemo(`PolyAgents scheduled: ${opts.vaultId}`);    const scheduleTx =  await  new  ScheduleCreateTransaction()  .setScheduledTransaction(innerTx)  .setScheduleMemo(`PolyAgents Rebalance — ${opts.vaultId}: ${opts.memo}`)  .setAdminKey(operatorKey.publicKey)  .setPayerAccountId(operatorId)  .freezeWith(hederaClient)  .sign(operatorKey);    const response =  await scheduleTx.execute(hederaClient);  const receipt =  await response.getReceipt(hederaClient);  const scheduleId = receipt.scheduleId!.toString();    console.log(`⏰ Scheduled TX created: ${scheduleId}`);  console.log(` https://hashscan.io/testnet/schedule/${scheduleId}`);    await  logToHCS({  event:  "SCHEDULE_CREATED",  vault_id: opts.vaultId,  schedule_id: scheduleId,  memo: opts.memo,  amount_hbar: amount.toString()  });    return scheduleId; }   export  async  function  getScheduleStatus(scheduleId:  string)  {  const info =  await  new  ScheduleInfoQuery()  .setScheduleId(ScheduleId.fromString(scheduleId))  .execute(hederaClient);    return  {  executed: info.executed !==  null,  deleted: info.deleted !==  null,  memo: info.scheduleMemo,  creator: info.creatorAccountId?.toString()  }; }
🔧 STEP 7 — Mirror Node API (15 minuti)
→ Copre: No Solidity Bonus + AI Payments Bonus (audit trail pubblico)
Crea src/hedera/mirror-node.ts:
typescript
const  BASE  =  "https://testnet.mirrornode.hedera.com/api/v1";   export  interface  HCSMessage  {  sequence_number:  number;  consensus_timestamp:  string;  message:  string;  // base64  parsed?: Record<string,  unknown>; }   export  async  function  getAuditLogs(topicId:  string):  Promise<HCSMessage
; }   export  async  function  getTokenInfo(tokenId:  string)  {  const res =  await  fetch(${BASE}/tokens/${tokenId});  return res.json(); }   export  async  function  getScheduleInfo(scheduleId:  string)  {  const res =  await  fetch(${BASE}/schedules/${scheduleId});  return res.json(); }   export  async  function  getAccountBalance(accountId:  string)  {  const res =  await  fetch(${BASE}/balances?account.id=${accountId});  return  (await res.json()).balances?.
??  null; }
🔧 STEP 8 — Orchestratore Unico (10 minuti)
→ Collega tutto in un'unica chiamata al boot del vault
Crea src/hedera/vault-init.ts:
typescript
import  { createVaultToken, mintVaultShares }  from  "./hts-vault"; import  { createVaultAuditTopic, setActiveTopic, logToHCS }  from  "./hcs-logger"; import  { registerHCS14Identity }  from  "./agent-identity"; import  { scheduleVaultOperation }  from  "./scheduler";   export  interface  HederaVaultConfig  {  vaultId:  string;  vaultName:  string;  strategy:  string;  policyHash:  string;  // keccak256 della policy — condividi con ENS  initialShares?:  number; }   export  interface  HederaVaultContext  {  tokenId:  string;  topicId:  string;  agentUaid:  string;  agentTopicId:  string;  scheduleId:  string; }   export  async  function  initHederaVault(  config: HederaVaultConfig ):  Promise<HederaVaultContext>  {  console.log(`\n🚀 Initializing Hedera for vault: ${config.vaultId}`);    // 1\. HTS Token  const  { tokenId }  =  await  createVaultToken(config.vaultName, config.vaultId);  if  (config.initialShares)  await  mintVaultShares(tokenId, config.initialShares);    // 2\. HCS Audit Topic  const topicId =  await  createVaultAuditTopic(config.vaultId);  setActiveTopic(topicId);    // 3\. HCS-14 Agent Identity  const  { topicId: agentTopicId, uaid: agentUaid }  =  await  registerHCS14Identity();    // 4\. Prima scheduled TX (rebalancing futuro)  const scheduleId =  await  scheduleVaultOperation({  vaultId: config.vaultId,  memo:  "Initial vault rebalance checkpoint"  });    // 5\. Log iniziale su HCS (evento 0)  await  logToHCS({  event:  "VAULT_INITIALIZED",  vault_id: config.vaultId,  token_id: tokenId,  topic_id: topicId,  agent_uaid: agentUaid,  strategy: config.strategy,  policy_hash: config.policyHash,  // ← usato anche da ENS  schedule_id: scheduleId  });    console.log(`\n✅ Hedera vault ready!`);  console.log(` Token:    https://hashscan.io/testnet/token/${tokenId}`);  console.log(` Audit:    https://hashscan.io/testnet/topic/${topicId}`);  console.log(` Agent ID: https://hashscan.io/testnet/topic/${agentTopicId}`);  console.log(` Schedule: https://hashscan.io/testnet/schedule/${scheduleId}`);    return  { tokenId, topicId, agentUaid, agentTopicId, scheduleId }; }
🔧 STEP 9 — Integra nel tuo Agent Loop Esistente (20 minuti)
Nel tuo file principale dell'agente PolyAgents, aggiungi questi tre hook:
typescript
import  { initHederaVault, HederaVaultContext }  from  "./hedera/vault-init"; import  { payForLLMCall }  from  "./hedera/agent-payment"; import  { logToHCS }  from  "./hedera/hcs-logger"; import  { setActiveTopic }  from  "./hedera/hcs-logger";   // ① Al boot del vault (una sola volta) let hederaCtx: HederaVaultContext;   async  function  onVaultCreated(vault: YourVaultType)  {  hederaCtx =  await  initHederaVault({  vaultId: vault.id,  vaultName: vault.name,  strategy: vault.strategy,  policyHash: vault.policyHash,  initialShares:  1000  });  // Passa topicId all'ENS writer se stai usando quel bounty  setActiveTopic(hederaCtx.topicId); }   // ② Prima di ogni chiamata LLM async  function  onBeforeLLMCall(context:  string, vaultId:  string)  {  await  payForLLMCall(context, vaultId);  // autonomous payment }   // ③ Dopo ogni decisione di trade async  function  onTradeDecision(decision: TradeDecision, vaultId:  string)  {  await  logToHCS({  event:  "TRADE_EXECUTED",  vault_id: vaultId,  market: decision.market,  direction: decision.direction,  amount_usdc: decision.amount,  confidence: decision.confidence,  arc_tx: decision.arcTxHash  }); }
🔧 STEP 10 — Endpoint API per la Dashboard (15 minuti)
Aggiungi a src/api/hedera.routes.ts:
typescript
import  { Router }  from  "express"; import  {  getAuditLogs,  getAccountPayments,  getTokenInfo, getScheduleInfo }  from  "../hedera/mirror-node";   const router =  Router();   // Audit log pubblico del vault router.get("/vault/:vaultId/audit",  async  (req, res)  =>  {  const topicId = req.query.topicId as  string;  const logs =  await  getAuditLogs(topicId);  res.json({ logs, count: logs.length }); });   // Pagamenti autonomi dell'agente router.get("/agent/payments",  async  (req, res)  =>  {  const payments =  await  getAccountPayments(process.env.HEDERA\_OPERATOR\_ID!);  res.json({ payments }); });   // Info token vault router.get("/vault/:vaultId/token",  async  (req, res)  =>  {  const tokenInfo =  await  getTokenInfo(req.query.tokenId as  string);  res.json(tokenInfo); });   // Status scheduled tx router.get("/schedule/:scheduleId",  async  (req, res)  =>  {  const status =  await  getScheduleInfo(req.params.scheduleId);  res.json(status); });   export  default router;
🔧 STEP 11 — README (30 minuti)
Struttura minima per GitHub che soddisfa entrambi i bounty:
text
# PolyAgents — AI Prediction Market Agent on Hedera   ## Hedera Services Used | Service | Role | Bounty | |---|---|---| | HTS (Token Service) | Vault share tokens with custom fee schedule | No Solidity | | HCS (Consensus Service) | Immutable agent audit trail | Both | | Scheduled Transactions | Recurring vault rebalancing | AI Payments | | HCS-14 UAID | On-chain agent identity | AI Payments | | Mirror Node REST API | Public audit dashboard | Both |   ## Setup 1. Clone repo 2. `npm install` 3. Copy .env.example → .env 4. Get free Hedera Testnet credentials at portal.hedera.com 5. `npx ts-node src/hedera/vault-init.ts` 6. `npm run dev`   ## Architecture
## Live Demo - Hashscan Token: https://hashscan.io/testnet/token/
- Hashscan Audit Topic: https://hashscan.io/testnet/topic/
- Agent Identity: https://hashscan.io/testnet/topic/
📋 Ordine di Esecuzione Finale
#
File da creare
Tempo
Bounty coperto
0
npm install + .env
5 min
—
1
src/hedera/client.ts
2 min
Base
2
src/hedera/hts-vault.ts
15 min
No Solidity #1
3
src/hedera/hcs-logger.ts
15 min
No Solidity #2 + AI
4
src/hedera/agent-payment.ts
15 min
AI $3K core
5
src/hedera/agent-identity.ts
20 min
AI Bonus #2
6
src/hedera/scheduler.ts
15 min
AI Bonus #3
7
src/hedera/mirror-node.ts
15 min
Entrambi bonus
8
src/hedera/vault-init.ts
10 min
Orchestratore
9
Hook nel loop agente
20 min
Tutto attivato
10
Route API dashboard
15 min
UX end-to-end
11
README + video
30 min
Submission
Totale: ~3 ore di implementazione per coprirti su **4.000 di bounty Hedera** (3.000 AI + 1.000 No Solidity). Il vantaggio critico è il **STEP 5 (HCS-14)** — quasi nessun altro team lo implementa, e il bounty AI lo lista esplicitamente come bonus. Con quello dentro il tuo submission è quasi imbattibile per il track da 3.000.hol+1
