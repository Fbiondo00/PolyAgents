import { createClient } from "@supabase/supabase-js"
import type { Database } from "@polyagents/schema"

export type SupabaseClient = ReturnType<typeof createClient<Database>>

export function createServerClient(url?: string, key?: string): SupabaseClient {
  return createClient<Database>(
    url ?? process.env.SUPABASE_URL ?? "http://127.0.0.1:54321",
    key ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
  )
}

export function createBrowserClient(url?: string, key?: string): SupabaseClient {
  return createClient<Database>(
    url ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321",
    key ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
  )
}
