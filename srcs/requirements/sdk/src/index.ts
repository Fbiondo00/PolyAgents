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
