import { z } from "zod";

export const barcodeSymbologySchema = z.enum([
  "EAN13",
  "UPCA",
  "CODE128",
  "QR",
  "DATA_MATRIX",
  "OTHER",
]);

export const barcodeSourceSchema = z.enum(["GENERATED", "EXISTING", "MATTER", "SERIAL"]);

export const barcodeInputSchema = z.object({
  value: z.string().min(1),
  symbology: barcodeSymbologySchema.default("OTHER"),
  source: barcodeSourceSchema.default("EXISTING"),
  isPrimary: z.boolean().optional(),
});

export const scanInputSchema = z.object({
  barcodeValue: z.string().min(1),
  delta: z
    .number()
    .int()
    .refine((n) => n !== 0, { message: "delta must not be zero" })
    .default(1),
});

export type BarcodeInput = z.infer<typeof barcodeInputSchema>;
export type ScanInput = z.infer<typeof scanInputSchema>;
