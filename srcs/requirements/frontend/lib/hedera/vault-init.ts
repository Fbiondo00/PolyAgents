import { createVaultToken, mintVaultShares } from './hts-vault'
import { createVaultAuditTopic, setActiveTopic, logToHCS } from './hcs-logger'
import { registerAgentIdentity } from './agent-identity'
import { scheduleVaultOperation } from './scheduler'
import { getTokenInfo } from './mirror-node'
import { getHederaClient } from './client'
import type { HederaVaultConfig, HederaContext, VaultTokenResult, AuditEventType } from '@/types'

export async function initHederaVault(
  config: HederaVaultConfig
): Promise<HederaContext> {
  // 0. Resolve treasury account from operator
  const { operatorId } = getHederaClient()
  const treasuryAccountId = operatorId.toString()

  // 1. Create HTS vault token (No Solidity Service #1)
  console.log(`[init-vault] 1/8 creating HTS token`, { vaultName: config.vaultName, vaultId: config.vaultId })
  const tokenResult: VaultTokenResult = await createVaultToken(config.vaultName, config.vaultId)
  console.log(`[init-vault] HTS token created`, { tokenId: tokenResult.tokenId, symbol: tokenResult.tokenSymbol })

  // 2. Mint initial shares if requested
  let sharesMinted = 0
  if (config.initialShares && config.initialShares > 0) {
    console.log(`[init-vault] 2/8 minting shares`, { amount: config.initialShares })
    await mintVaultShares(tokenResult.tokenId, config.initialShares)
    sharesMinted = config.initialShares
  } else {
    console.log(`[init-vault] 2/8 no shares to mint`)
  }

  // 3. Create HCS audit topic (No Solidity Service #2)
  console.log(`[init-vault] 3/8 creating HCS audit topic`)
  const { topicId, hashscanUrl: topicHashscan } = await createVaultAuditTopic(config.vaultId)
  setActiveTopic(topicId)
  console.log(`[init-vault] HCS topic created`, { topicId })

  // 4. Log token creation event to HCS
  await logToHCS({
    event: 'TOKEN_CREATED' as AuditEventType,
    vault_id: config.vaultId,
    token_id: tokenResult.tokenId,
    token_name: tokenResult.tokenName,
    initial_supply: tokenResult.initialSupply,
    shares_minted: sharesMinted,
    policy_hash: config.policyHash ?? null,
  })

  if (sharesMinted > 0) {
    await logToHCS({
      event: 'TOKEN_MINTED' as AuditEventType,
      vault_id: config.vaultId,
      token_id: tokenResult.tokenId,
      shares: sharesMinted,
    })
  }

  // 5. Register HCS-14 Agent Identity (AI Payments Bonus #2)
  console.log(`[init-vault] 4/8 registering HCS-14 agent identity`)
  const agentIdentity = await registerAgentIdentity(topicId)
  console.log(`[init-vault] Agent registered`, { uaid: agentIdentity.uaid, agentTopicId: agentIdentity.topicId })

  await logToHCS({
    event: 'AGENT_REGISTERED' as AuditEventType,
    vault_id: config.vaultId,
    agent_uaid: agentIdentity.uaid,
    agent_topic_id: agentIdentity.topicId,
  })

  // 6. Create first scheduled transaction (AI Payments Bonus #3)
  console.log(`[init-vault] 5/8 creating scheduled transaction`)
  const scheduleResult = await scheduleVaultOperation({
    vaultId: config.vaultId,
    topicId,
    memo: 'Initial vault rebalance checkpoint',
  })
  console.log(`[init-vault] Schedule created`, { scheduleId: scheduleResult.scheduleId })

  // 7. Log full initialization to HCS
  console.log(`[init-vault] 6/8 logging VAULT_INITIALIZED to HCS`)
  await logToHCS({
    event: 'VAULT_INITIALIZED' as AuditEventType,
    vault_id: config.vaultId,
    token_id: tokenResult.tokenId,
    topic_id: topicId,
    agent_uaid: agentIdentity.uaid,
    schedule_id: scheduleResult.scheduleId,
  })

  // 8. Verify via Mirror Node (data integrity)
  console.log(`[init-vault] 7/8 verifying via Mirror Node`, { tokenId: tokenResult.tokenId })
  let mirrorVerified = false
  try {
    const tokenInfo = await getTokenInfo(tokenResult.tokenId)
    mirrorVerified = tokenInfo.token_id === tokenResult.tokenId
    console.log(`[init-vault] Mirror verify`, { verified: mirrorVerified })
  } catch {
    console.warn(`[init-vault] Mirror verify failed (propagation delay — non-blocking)`)
  }

  console.log(`[init-vault] 8/8 done — returning context`)

  return {
    tokenId: tokenResult.tokenId,
    tokenName: tokenResult.tokenName,
    tokenSymbol: tokenResult.tokenSymbol,
    tokenHashscan: tokenResult.hashscanUrl,
    topicId,
    topicHashscan,
    initialSharesMinted: sharesMinted,
    agentTopicId: agentIdentity.topicId,
    agentUaid: agentIdentity.uaid,
    agentHashscan: agentIdentity.hashscanUrl,
    scheduleId: scheduleResult.scheduleId,
    scheduleHashscan: scheduleResult.hashscanUrl,
    treasuryAccountId,
    treasuryHashscan: `https://hashscan.io/testnet/account/${treasuryAccountId}`,
  }
}
