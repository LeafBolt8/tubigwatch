import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { OutageSchema } from '@/lib/schemas/outage';

export const GeminiOutagesSchema = z.object({
  outages: z.array(OutageSchema),
});

export type GeminiOutagesResponse = z.infer<typeof GeminiOutagesSchema>;

export const GeminiOutagesJsonSchema = zodToJsonSchema(GeminiOutagesSchema);

export function validateGeminiOutagesPayload(value: unknown) {
  return GeminiOutagesSchema.safeParse(value);
}
