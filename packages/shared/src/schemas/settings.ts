import { z } from "zod";

export const settingUpdateSchema = z.object({
  value: z.string(),
});

export type SettingUpdateInput = z.infer<typeof settingUpdateSchema>;
