import { z } from 'zod';

import { AffectedAreaSchema } from './affected-area';
import { ConcessionaireSchema } from './concessionaire';
import { OutageStatusSchema } from './outage-status';

// Timestamps are coerced to Date at parse time so downstream code never compares them lexically.
// z.coerce.date() accepts ISO strings (with or without offset) and rejects non-date text.

export const SourceProvenanceSchema = z
  .object({
    url: z.string().url(),
    fetchedAt: z.coerce.date(),
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
      .refine(
        (value) => !/<\s*[a-zA-Z/!]/.test(value),
        { message: 'reason must not contain HTML tags' },
      ),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date().optional(),
    estimatedRestoration: z.coerce.date().optional(),
    affectedAreas: z.array(AffectedAreaSchema),
    source: SourceProvenanceSchema,
    confidence: OutageConfidenceSchema,
  })
  .strict();

export type SourceProvenance = z.infer<typeof SourceProvenanceSchema>;
export type OutageConfidence = z.infer<typeof OutageConfidenceSchema>;
export type Outage = z.infer<typeof OutageSchema>;
export type OutageInput = Omit<Outage, 'id'> & { id?: string };
