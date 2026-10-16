import { z } from 'zod';

import { AffectedAreaSchema } from './affected-area';
import { ConcessionaireSchema } from './concessionaire';
import { OutageStatusSchema } from './outage-status';

// Zod 3 rejects a trailing UTC offset unless `offset: true` is passed.
export const ISO_DATETIME_OPTIONS = { offset: true } as const;

export const SourceProvenanceSchema = z
  .object({
    url: z.string().url(),
    fetchedAt: z.string().datetime(ISO_DATETIME_OPTIONS),
    raw: z.string(),
  })
  .strict();

export const OutageConfidenceSchema = z.enum(['official', 'inferred']);

export const OutageSchema = z
  .object({
    id: z.string().min(1),
    concessionaire: ConcessionaireSchema,
    status: OutageStatusSchema,
    reason: z
      .string()
      .max(500)
      .refine((value) => !/[<>]/.test(value), { message: 'reason must not contain HTML' }),
    startsAt: z.string().datetime(ISO_DATETIME_OPTIONS),
    endsAt: z.string().datetime(ISO_DATETIME_OPTIONS).optional(),
    estimatedRestoration: z.string().datetime(ISO_DATETIME_OPTIONS).optional(),
    affectedAreas: z.array(AffectedAreaSchema),
    source: SourceProvenanceSchema,
    confidence: OutageConfidenceSchema,
  })
  .strict();

export type SourceProvenance = z.infer<typeof SourceProvenanceSchema>;
export type OutageConfidence = z.infer<typeof OutageConfidenceSchema>;
export type Outage = z.infer<typeof OutageSchema>;
