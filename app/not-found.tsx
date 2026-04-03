import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Home } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#081216] text-[#E1F5FE] gap-6 px-4">
      <div className="text-center space-y-2">
        <p className="text-6xl font-mono font-bold text-[#00A8B5]">404</p>
        <h1 className="font-heading text-2xl font-bold">Page not found</h1>
        <p className="text-[#B0BEC5]">The vault or page you&apos;re looking for doesn&apos;t exist.</p>
      </div>
      <Link href="/">
        <Button className="bg-[#00A8B5] hover:bg-[#4DD0E1] text-[#081216] font-semibold gap-2">
          <Home className="h-4 w-4" />
          Back to Home
        </Button>
      </Link>
    </div>
  )
}
