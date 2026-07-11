import { z } from "zod";

export const categoryInputSchema = z.object({
  name: z.string().min(1),
  parentId: z.string().nullable().optional(),
});

export type CategoryInput = z.infer<typeof categoryInputSchema>;
