import {
  TokenCreateTransaction,
  TokenMintTransaction,
  TokenType,
  TokenSupplyType,
  CustomFixedFee,
  Hbar,
  TokenId,
} from '@hashgraph/sdk'
import { getHederaClient } from './client'
import type { VaultTokenResult } from '@polyagents/schema'

export async function createVaultToken(
  vaultName: string,
  vaultId: string
): Promise<VaultTokenResult> {
  const { client, operatorId, operatorKey } = getHederaClient()

  const customFee = new CustomFixedFee()
    .setHbarAmount(new Hbar(0.0001))
    .setFeeCollectorAccountId(operatorId)

  const tokenName = `PolyAgents-${vaultName}`
  const tokenSymbol = 'VPLT'

  const tx = await new TokenCreateTransaction()
    .setTokenName(tokenName)
    .setTokenSymbol(tokenSymbol)
    .setTokenType(TokenType.FungibleCommon)
    .setDecimals(6)
    .setInitialSupply(0)
    .setTreasuryAccountId(operatorId)
    .setSupplyType(TokenSupplyType.Infinite)
    .setAdminKey(operatorKey.publicKey)
    .setSupplyKey(operatorKey.publicKey)
    .setCustomFees([customFee])
    .setTokenMemo(`PolyAgents vault token — ${vaultId}`)
    .freezeWith(client)
    .sign(operatorKey)

  const response = await tx.execute(client)
  const receipt = await response.getReceipt(client)
  const tokenId = receipt.tokenId!

  return {
    tokenId: tokenId.toString(),
    tokenName,
    tokenSymbol,
    initialSupply: 0,
    hashscanUrl: `https://hashscan.io/testnet/token/${tokenId}`,
  }
}

export async function mintVaultShares(
  tokenId: string,
  sharesAmount: number
): Promise<string> {
  const { client, operatorKey } = getHederaClient()

  const tx = await new TokenMintTransaction()
    .setTokenId(TokenId.fromString(tokenId))
    .setAmount(sharesAmount * 1_000_000)
    .freezeWith(client)
    .sign(operatorKey)

  const response = await tx.execute(client)
  const receipt = await response.getReceipt(client)
  return response.transactionId?.toString() ?? ''
}
