import { z } from "zod";

export const itemTypeSchema = z.enum(["CONSUMABLE", "ASSET"]);
export const itemConditionSchema = z.enum(["NEW", "IN_USE", "NEEDS_REPAIR", "RETIRED"]);

export const itemInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  quantity: z.number().int().min(0).default(1),
  unit: z.string().nullable().optional(),
  locationId: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  minQuantity: z.number().int().min(0).nullable().optional(),
  purchaseDate: z.string().nullable().optional(),
  price: z.number().nullable().optional(),
  currency: z.string().nullable().optional(),
  expiryDate: z.string().nullable().optional(),
  warrantyExpiresAt: z.string().nullable().optional(),
  photoUrl: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  wanted: z.boolean().optional(),
  itemType: itemTypeSchema.default("CONSUMABLE"),
  condition: itemConditionSchema.nullable().optional(),
});

export const itemUpdateSchema = itemInputSchema.partial();

export const maintenanceRecordInputSchema = z.object({
  date: z.string().min(1),
  description: z.string().min(1),
  cost: z.number().nullable().optional(),
  currency: z.string().nullable().optional(),
});

export const quantityAdjustSchema = z.object({
  delta: z.number().int(),
  reason: z.enum(["RESTOCK", "CONSUME", "ADJUST"]).default("ADJUST"),
});

export const itemBulkUpdateSchema = z.object({
  itemIds: z.array(z.string()).min(1),
  locationId: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
});

export const itemBulkDeleteSchema = z.object({
  itemIds: z.array(z.string()).min(1),
});

export type ItemType = z.infer<typeof itemTypeSchema>;
export type ItemCondition = z.infer<typeof itemConditionSchema>;
export type ItemInput = z.infer<typeof itemInputSchema>;
export type ItemUpdateInput = z.infer<typeof itemUpdateSchema>;
export type MaintenanceRecordInput = z.infer<typeof maintenanceRecordInputSchema>;
export type QuantityAdjustInput = z.infer<typeof quantityAdjustSchema>;
export type ItemBulkUpdateInput = z.infer<typeof itemBulkUpdateSchema>;
export type ItemBulkDeleteInput = z.infer<typeof itemBulkDeleteSchema>;
