export const POLYAGENTS_ABI = [] as const

export type Outcome = 0 | 1 | 2 | 3
export const OUTCOME = {
  UNRESOLVED: 0 as Outcome,
  YES: 1 as Outcome,
  NO: 2 as Outcome,
  VOIDED: 3 as Outcome,
}
