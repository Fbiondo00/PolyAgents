/**
 * @polyagents/sdk — Barrel Exports
 */

// OOP facade
export { PolyAgentsImpl, PolyAgentsImpl as PolyAgents, createPolyAgents } from './modules/main'

// Schema re-export
export * from '@polyagents/schema'

// Modules (tree-shakeable)
export * from './modules/engine'
export * from './modules/store'

// Supabase (namespaced to avoid collision with engine/store functions)
export { createServerClient, createBrowserClient } from './modules/supabase'
export type { SupabaseClient } from './modules/supabase'
export * as supabaseQueries from './modules/supabase/queries'
