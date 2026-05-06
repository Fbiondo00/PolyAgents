import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  // Pass through — no chain-based gating
  return NextResponse.next()
}

export const config = {
  matcher: ['/vault/:path*'],
}
