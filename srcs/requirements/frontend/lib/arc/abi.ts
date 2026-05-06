// Auto-generated from: forge inspect PolyAgentsMarket abi --json --root contracts/
// Regenerate after contract changes with:
//   forge inspect PolyAgentsMarket abi --root contracts/ --json > lib/arc/polyagents-abi.json

import polyagentsAbiJson from "./polyagents-abi.json";

export const POLYAGENTS_ABI = polyagentsAbiJson;

export type Outcome = 0 | 1 | 2 | 3; // UNRESOLVED | YES | NO | VOIDED
export const OUTCOME = {
  UNRESOLVED: 0 as Outcome,
  YES: 1 as Outcome,
  NO: 2 as Outcome,
  VOIDED: 3 as Outcome,
};
