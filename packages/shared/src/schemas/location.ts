import { z } from "zod";

export const locationInputSchema = z.object({
  name: z.string().min(1),
  parentId: z.string().nullable().optional(),
  photoUrl: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export type LocationInput = z.infer<typeof locationInputSchema>;
