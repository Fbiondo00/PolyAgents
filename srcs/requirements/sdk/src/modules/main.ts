/**
 * PolyAgents SDK — OOP Aggregated Interface
 *
 * Facade exposing all SDK modules as namespaced properties.
 */

import * as engine from './engine'
import * as store from './store'

export class PolyAgentsImpl {
  public readonly engine: typeof engine
  public readonly store: typeof store

  constructor() {
    this.engine = engine
    this.store = store
  }

  static create(): PolyAgentsImpl {
    return new PolyAgentsImpl()
  }
}

export function createPolyAgents(): PolyAgentsImpl {
  return new PolyAgentsImpl()
}
