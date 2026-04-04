import { NextResponse } from "next/server";

export async function GET() {
  // Vercel cron reconciliation endpoint
  // In localStorage mode, reconciliation runs client-side.
  // This route exists for the Vercel cron config and can be extended
  // when a backend (Supabase) is added later.
  return NextResponse.json({
    reconciled: 0,
    timestamp: Date.now(),
    mode: "localStorage",
    message: "Reconciliation runs client-side in hackathon mode",
  });
}
