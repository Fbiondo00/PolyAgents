'use client'

import { useEffect, useState } from 'react'
import { PrivyProvider } from '@privy-io/react-auth'

/**
 * Client-only providers wrapper.
 *
 * The Privy provider throws if it initializes with an invalid app id. During
 * server-side rendering (and during `next build`'s prerender pass) the env may
 * be a placeholder, so we defer mounting Privy until after the component has
 * hydrated on the client, where the real NEXT_PUBLIC_PRIVY_APP_ID is present.
 *
 * The children must NEVER render before PrivyProvider is mounted. Every page
 * calls `usePrivy()`/`useWallets()` unconditionally at the top of its body, and
 * those hooks throw ('must be used within a PrivyProvider') when no provider is
 * in the context tree — the underlying context is internal to
 * @privy-io/react-auth and cannot be stubbed from the outside. Rendering the
 * children bare during that window (the previous behavior) therefore crashed
 * the whole app on first render / prerender.
 *
 * To keep those hooks safe, until the real provider has mounted we render a
 * minimal, provider-free placeholder (an empty shell) instead of the children.
 * Returning `null` guarantees no `useWallets()`/`usePrivy()` call executes
 * without a PrivyProvider ancestor. The mounted flag flips on the first
 * `useEffect` (post-hydration on the client), at which point the children
 * render inside the real PrivyProvider and the hooks resolve normally. The
 * brief empty shell is invisible to users and avoids the white-screen crash.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  if (!mounted) {
    // Provider-free shell: intentionally NOT rendering `children` here, because
    // they call Privy hooks that throw outside of a PrivyProvider.
    return null
  }

  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={{
        loginMethods: ['wallet', 'email', 'google', 'twitter'],
        appearance: {
          theme: 'dark',
          accentColor: '#00A8B5',
          logo: 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-VlVMoEHHdkmyfUe5dLKTvdGHkcEXao.png',
        },
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'users-without-wallets',
          },
        },
      }}
    >
      {children}
    </PrivyProvider>
  )
}
