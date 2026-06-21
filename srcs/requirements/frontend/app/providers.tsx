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
 * Until then we render the children bare — pages are all 'use client' and gate
 * their own auth UI, so the brief un-wrapped render is a no-op shell.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  if (!mounted) {
    return <>{children}</>
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
