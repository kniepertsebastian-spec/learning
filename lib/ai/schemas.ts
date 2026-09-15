import { z } from "zod";

export const localizedStringSchema = z.object({
  de: z.string().min(1),
  en: z.string().min(1),
});

export const localizedStringArraySchema = z.object({
  de: z.array(z.string().min(1)).min(2),
  en: z.array(z.string().min(1)).min(2),
});
