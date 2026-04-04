import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getVaultHederaContext } from '@/lib/server/vault-registry'

const MIRROR_BASE = 'https://testnet.mirrornode.hedera.com/api/v1'

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip /vault/create — has its own flow
  if (pathname === '/vault/create') return NextResponse.next()

  // Only gate /vault/[id]/* routes
  const match = pathname.match(/^\/vault\/([^/]+)/)
  if (!match) return NextResponse.next()

  const vaultId = match[1]

  // 1. Look up vault hedera context from server-side registry
  const hederaCtx = getVaultHederaContext(vaultId)
  if (!hederaCtx) {
    // No Hedera context (demo vault or not yet deployed) — allow access
    return NextResponse.next()
  }

  // 2. Verify the vault's HTS token still exists on-chain (treasury holds supply)
  try {
    const res = await fetch(
      `${MIRROR_BASE}/balances?account.id=${hederaCtx.treasuryAccountId}`,
    )
    if (!res.ok) {
      // Mirror Node unreachable — fail open
      return NextResponse.next()
    }
    const data = await res.json()
    const tokenEntry = data.balances?.[0]?.tokens?.find(
      (t: { token_id: string }) => t.token_id === hederaCtx.tokenId,
    )
    if (!tokenEntry || tokenEntry.balance <= 0) {
      // Token burned or supply wiped — vault is inactive
      return NextResponse.redirect(new URL('/', request.url))
    }
  } catch {
    // Mirror Node error — fail open
    return NextResponse.next()
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/vault/:path*'],
}
