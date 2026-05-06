import type { Metadata, Viewport } from 'next'
import { Inter, Sora } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { Toaster } from 'sonner'
import { Providers } from './providers'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

const sora = Sora({
  subsets: ['latin'],
  variable: '--font-sora',
  weight: ['400', '500', '600', '700', '800'],
})

export const metadata: Metadata = {
  title: 'PolyAgents — Autonomous Trading Vaults',
  description: 'AI-powered prediction market trading agents. Deploy vaults, automate strategies, and earn yield with PolyAgents.',
  generator: 'v0.app',
  manifest: '/manifest.json',
  keywords: ['polymarket', 'trading', 'AI', 'prediction markets', 'vault'],
  authors: [{ name: 'PolyAgents' }],
  openGraph: {
    title: 'PolyAgents — Autonomous Trading Vaults',
    description: 'AI-powered prediction market trading agents.',
    type: 'website',
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#00A8B5',
  width: 'device-width',
  initialScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${inter.variable} ${sora.variable}`}>
      <body className="font-sans antialiased bg-[#081216] text-[#E1F5FE] min-h-screen">
        <Providers>
          {children}
          <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#0E1B27',
              border: '1px solid #1A3C50',
              color: '#E1F5FE',
            },
          }}
        />
        <Analytics />
        </Providers>
      </body>
    </html>
  )
}
