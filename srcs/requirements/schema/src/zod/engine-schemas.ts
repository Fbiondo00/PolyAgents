import { z } from "zod";

export const strategyConfigSchema = z.object({
  enabled: z.boolean().default(true),
  entryPrice: z.number().default(0.20),
  exitPrice: z.number().default(0.25),
  orderSize: z.number().default(10),
  maxCapitalUsdc: z.number().optional(),
  maxTradesPerMarket: z.number().int().default(1),
  maxTradesPolicy: z.enum(["side", "global"]).default("side"),
  noNewEntriesLastSeconds: z.number().int().default(10),
  keepSellOrdersAfterExpirySeconds: z.number().int().default(10),
  reconcileIntervalCycles: z.number().int().default(8),
  minSpreadRequired: z.number().optional(),
  strictPassiveOnly: z.boolean().default(true),
  allowBothSides: z.boolean().default(true),
  cancelOpenBuysOnExpiry: z.boolean().default(true),
  autoReentryEnabled: z.boolean().default(false),
});

export type StrategyConfig = z.infer<typeof strategyConfigSchema>;

export const engineStartSchema = z.object({
  vaultId: z.string().min(1),
  configOverride: strategyConfigSchema.partial().optional(),
});

export const marketTickSchema = z.object({
  vaultId: z.string().min(1),
  event: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("book"), assetId: z.string(), bestBid: z.number().nullable(), bestAsk: z.number().nullable() }),
    z.object({ kind: z.literal("fill"), orderId: z.string(), filledQty: z.number() }),
    z.object({ kind: z.literal("cancel"), orderId: z.string() }),
    z.object({ kind: z.literal("error"), message: z.string() }),
  ]),
});
