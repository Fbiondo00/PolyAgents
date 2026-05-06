import { Client, PrivateKey, AccountId, AccountBalanceQuery } from '@hashgraph/sdk'

let _client: Client | null = null
let _operatorId: AccountId | null = null
let _operatorKey: PrivateKey | null = null

export function getHederaClient() {
  if (_client && _operatorId && _operatorKey) {
    return { client: _client, operatorId: _operatorId, operatorKey: _operatorKey }
  }

  const operatorIdStr = process.env.HEDERA_OPERATOR_ID
  const operatorKeyStr = process.env.HEDERA_OPERATOR_KEY
  const network = process.env.HEDERA_NETWORK || 'testnet'

  if (!operatorIdStr || !operatorKeyStr) {
    throw new Error('Missing HEDERA_OPERATOR_ID or HEDERA_OPERATOR_KEY in environment variables')
  }

  _operatorId = AccountId.fromString(operatorIdStr)

  try {
    _operatorKey = PrivateKey.fromStringDer(operatorKeyStr)
  } catch {
    try {
      _operatorKey = PrivateKey.fromString(operatorKeyStr)
    } catch {
      throw new Error('Failed to parse HEDERA_OPERATOR_KEY. Ensure it is in DER or raw format.')
    }
  }

  _client = network === 'mainnet' ? Client.forMainnet() : Client.forTestnet()
  _client.setOperator(_operatorId, _operatorKey)

  return { client: _client, operatorId: _operatorId, operatorKey: _operatorKey }
}

export async function checkHederaConnection() {
  const { client, operatorId } = getHederaClient()
  const balance = await new AccountBalanceQuery()
    .setAccountId(operatorId)
    .execute(client)
  return {
    connected: true,
    balance: balance.hbars.toString(),
    accountId: operatorId.toString(),
  }
}
