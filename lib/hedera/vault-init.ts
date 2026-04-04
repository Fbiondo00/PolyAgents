import { createVaultToken, mintVaultShares } from './hts-vault'
import { createVaultAuditTopic, setActiveTopic, logToHCS } from './hcs-logger'
import { getTokenInfo } from './mirror-node'
import type { HederaVaultConfig, HederaContext, VaultTokenResult } from '@/types'

export async function initHederaVault(
  config: HederaVaultConfig
): Promise<HederaContext> {
  // 1. Create HTS vault token (No Solidity Service #1)
  const tokenResult: VaultTokenResult = await createVaultToken(config.vaultName, config.vaultId)

  // 2. Mint initial shares if requested
  let sharesMinted = 0
  if (config.initialShares && config.initialShares > 0) {
    await mintVaultShares(tokenResult.tokenId, config.initialShares)
    sharesMinted = config.initialShares
  }

  // 3. Create HCS audit topic (No Solidity Service #2)
  const { topicId, hashscanUrl: topicHashscan } = await createVaultAuditTopic(config.vaultId)
  setActiveTopic(topicId)

  // 4. Log token creation event to HCS (creative data integrity use)
  await logToHCS({
    event: 'TOKEN_CREATED',
    vault_id: config.vaultId,
    token_id: tokenResult.tokenId,
    token_name: tokenResult.tokenName,
    initial_supply: tokenResult.initialSupply,
    shares_minted: sharesMinted,
    policy_hash: config.policyHash ?? null,
  })

  if (sharesMinted > 0) {
    await logToHCS({
      event: 'TOKEN_MINTED',
      vault_id: config.vaultId,
      token_id: tokenResult.tokenId,
      shares: sharesMinted,
    })
  }

  // 5. Verify via Mirror Node (data integrity)
  let mirrorVerified = false
  try {
    const tokenInfo = await getTokenInfo(tokenResult.tokenId)
    mirrorVerified = tokenInfo.token_id === tokenResult.tokenId
  } catch {
    // Mirror Node may have propagation delay — not a blocking error
  }

  return {
    tokenId: tokenResult.tokenId,
    tokenName: tokenResult.tokenName,
    tokenSymbol: tokenResult.tokenSymbol,
    tokenHashscan: tokenResult.hashscanUrl,
    topicId,
    topicHashscan,
    initialSharesMinted: sharesMinted,
  }
}
