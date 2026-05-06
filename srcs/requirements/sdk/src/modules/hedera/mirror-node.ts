import type { HCSMessage, TokenInfo } from '@polyagents/schema'

const BASE_URL = 'https://testnet.mirrornode.hedera.com/api/v1'

export async function getAuditLogs(
  topicId: string,
  limit: number = 50
): Promise<HCSMessage[]> {
  const res = await fetch(
    `${BASE_URL}/topics/${topicId}/messages?limit=${limit}&order=desc`
  )
  if (!res.ok) throw new Error(`Mirror Node error: ${res.status} ${await res.text()}`)
  const data = await res.json()

  return (data.messages ?? []).map((msg: HCSMessage) => {
    try {
      const decoded = atob(msg.message)
      const parsed = JSON.parse(decoded)
      return { ...msg, parsed }
    } catch {
      return msg
    }
  })
}

export async function getTokenInfo(tokenId: string): Promise<TokenInfo> {
  const res = await fetch(`${BASE_URL}/tokens/${tokenId}`)
  if (!res.ok) throw new Error(`Mirror Node error: ${res.status} ${await res.text()}`)
  return res.json()
}

export async function getAccountBalance(
  accountId: string
): Promise<{ balance: number; tokens: Array<{ token_id: string; balance: number }> } | null> {
  const res = await fetch(`${BASE_URL}/balances?account.id=${accountId}`)
  if (!res.ok) throw new Error(`Mirror Node error: ${res.status} ${await res.text()}`)
  const data = await res.json()
  return data.balances?.[0] ?? null
}

export async function getTopicInfo(
  topicId: string
): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE_URL}/topics/${topicId}`)
  if (!res.ok) throw new Error(`Mirror Node error: ${res.status} ${await res.text()}`)
  return res.json()
}
