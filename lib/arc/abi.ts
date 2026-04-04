// Auto-generated from: forge inspect VaultPilotMarket abi --json --root contracts/
// Regenerate after contract changes with:
//   forge inspect VaultPilotMarket abi --root contracts/ --json > lib/arc/vaultpilot-abi.json

import vaultPilotAbiJson from "./vaultpilot-abi.json";

export const VAULTPILOT_ABI = vaultPilotAbiJson;

export type Outcome = 0 | 1 | 2 | 3; // UNRESOLVED | YES | NO | VOIDED
export const OUTCOME = {
  UNRESOLVED: 0 as Outcome,
  YES: 1 as Outcome,
  NO: 2 as Outcome,
  VOIDED: 3 as Outcome,
};
