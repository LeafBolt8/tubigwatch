import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { AffectedAreaSchema } from '@/lib/schemas/affected-area';
import { type Outage } from '@/lib/schemas/outage';

export const GeminiRawOutageSchema = z.object({
  concessionaire: z.enum(['maynilad', 'manila-water']),
  status: z.enum(['scheduled', 'active', 'restored', 'cancelled', 'unknown']),
  reason: z.string().min(1),
  startsAt: z.string().min(1),
  endsAt: z.string().optional(),
  affectedAreas: z.array(AffectedAreaSchema),
  confidence: z.enum(['official', 'inferred']),
});

export type GeminiRawOutage = z.infer<typeof GeminiRawOutageSchema>;

export const GeminiRawOutagesSchema = z.object({
  outages: z.array(GeminiRawOutageSchema),
});

export type GeminiRawOutagesResponse = z.infer<typeof GeminiRawOutagesSchema>;

const rawSchema = zodToJsonSchema(GeminiRawOutagesSchema, { $refStrategy: 'none' });

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

export function validateGeminiRawPayload(value: unknown) {
  return GeminiRawOutagesSchema.safeParse(value);
}

export function hydrateGeminiOutage(raw: GeminiRawOutage, url: string, fetchedAt: Date): Outage | null {
  const startsAt = parseIsoDateTime(raw.startsAt);
  if (!startsAt) return null;

  const endsAt = parseOptionalIsoDateTime(raw.endsAt);

  // Stable-ish id based on the scraped content, similar in spirit to the Maynilad id scheme.
  const sortedBarangayNames = [
    ...new Set(
      raw.affectedAreas.flatMap((area) =>
        area.barangays.map((b) => b.name).filter(Boolean),
      ),
    ),
  ]
    .sort()
    .join('|');

  void sortedBarangayNames;
  const id = crypto.randomUUID();

  return {
    id,
    concessionaire: raw.concessionaire,
    status: raw.status,
    reason: raw.reason,
    startsAt,
    endsAt,
    affectedAreas: raw.affectedAreas,
    source: {
      url,
      fetchedAt,
      raw: JSON.stringify(raw),
    },
    confidence: 'inferred' as const,
  };
}

export function hydrateGeminiOutages(
  rawResponse: GeminiRawOutagesResponse,
  url: string,
  fetchedAt: Date,
): Array<Outage | null> {
  return rawResponse.outages.map((raw) => hydrateGeminiOutage(raw, url, fetchedAt));
}

function parseIsoDateTime(value: string): Date | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;

  return parsed;
}

function parseOptionalIsoDateTime(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (trimmed.toLowerCase() === 'unknown' || trimmed.length === 0) return undefined;

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return undefined;

  return parsed;
}
