import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { OutageSchema } from '@/lib/schemas/outage';

export const GeminiOutagesSchema = z.object({
  outages: z.array(OutageSchema),
});

export type GeminiOutagesResponse = z.infer<typeof GeminiOutagesSchema>;

const rawSchema = zodToJsonSchema(GeminiOutagesSchema, { $refStrategy: 'none' });

function sanitizeForGemini(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(sanitizeForGemini);
  if (typeof schema !== 'object' || schema === null) return schema;

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    if (key === '$schema' || key === 'additionalProperties') continue;
    if (key === 'const') {
      result.enum = [value];
      continue;
    }
    result[key] = sanitizeForGemini(value);
  }
  return result;
}

export const GeminiOutagesJsonSchema = sanitizeForGemini(rawSchema);

export function validateGeminiOutagesPayload(value: unknown) {
  return GeminiOutagesSchema.safeParse(value);
}
