/**
 * PolyAgents SDK — OOP Aggregated Interface
 *
 * Facade exposing all SDK modules as namespaced properties.
 */

import * as hedera from './hedera'
import * as arc from './arc'
import * as ens from './ens'
import * as engine from './engine'
import * as store from './store'

export class PolyAgentsImpl {
  public readonly hedera: typeof hedera
  public readonly arc: typeof arc
  public readonly ens: typeof ens
  public readonly engine: typeof engine
  public readonly store: typeof store

  constructor() {
    this.hedera = hedera
    this.arc = arc
    this.ens = ens
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
