import { createVaultToken, mintVaultShares } from './hts-vault'
import { createVaultAuditTopic, setActiveTopic, logToHCS } from './hcs-logger'
import { registerAgentIdentity } from './agent-identity'
import { scheduleVaultOperation } from './scheduler'
import { getTokenInfo } from './mirror-node'
import { getHederaClient } from './client'
import type { HederaVaultConfig, HederaContext, VaultTokenResult, AuditEventType } from '@polyagents/schema'

export async function initHederaVault(
  config: HederaVaultConfig
): Promise<HederaContext> {
  const { operatorId } = getHederaClient()
  const treasuryAccountId = operatorId.toString()

  console.log(`[init-vault] 1/8 creating HTS token`, { vaultName: config.vaultName, vaultId: config.vaultId })
  const tokenResult: VaultTokenResult = await createVaultToken(config.vaultName, config.vaultId)

  let sharesMinted = 0
  if (config.initialShares && config.initialShares > 0) {
    await mintVaultShares(tokenResult.tokenId, config.initialShares)
    sharesMinted = config.initialShares
  }

  const { topicId, hashscanUrl: topicHashscan } = await createVaultAuditTopic(config.vaultId)
  setActiveTopic(topicId)

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

  const agentIdentity = await registerAgentIdentity(topicId)

  await logToHCS({
    event: 'AGENT_REGISTERED' as AuditEventType,
    vault_id: config.vaultId,
    agent_uaid: agentIdentity.uaid,
    agent_topic_id: agentIdentity.topicId,
  })

  const scheduleResult = await scheduleVaultOperation({
    vaultId: config.vaultId,
    topicId,
    memo: 'Initial vault rebalance checkpoint',
  })

  await logToHCS({
    event: 'VAULT_INITIALIZED' as AuditEventType,
    vault_id: config.vaultId,
    token_id: tokenResult.tokenId,
    topic_id: topicId,
    agent_uaid: agentIdentity.uaid,
    schedule_id: scheduleResult.scheduleId,
  })

  try {
    const tokenInfo = await getTokenInfo(tokenResult.tokenId)
    console.log(`[init-vault] Mirror verify`, { verified: tokenInfo.token_id === tokenResult.tokenId })
  } catch {
    console.warn(`[init-vault] Mirror verify failed (propagation delay — non-blocking)`)
  }

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
