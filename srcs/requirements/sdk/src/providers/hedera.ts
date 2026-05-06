import { getHederaConfig } from '@polyagents/schema'

let _client: any = null

export async function getProvider() {
  if (_client) return _client
  const { Client, AccountId, PrivateKey } = await import('@hashgraph/sdk')
  const config = getHederaConfig()
  _client = Client.forTestnet()
  _client.setOperator(
    AccountId.fromString(config.operatorId),
    PrivateKey.fromStringED25519(config.operatorKey),
  )
  return _client
}
