import { z } from 'zod';
import { ConcessionaireSchema } from './concessionaire';
import { OutageStatusSchema } from './outage-status';
import { AffectedAreaSchema } from './affected-area';
import { ConfidenceSchema } from './confidence';

const htmlTagRE = /<\s*\/?[a-zA-Z][^>]*>/;
const htmlCommentRE = /<!--[\s\S]*?-->/;

export const SourceProvenanceSchema = z.object({
  url: z.string(),
  fetchedAt: z.coerce.date(),
  raw: z.string().optional(),
});

export const OutageSchema = z
  .object({
    id: z.string(),
    concessionaire: ConcessionaireSchema,
    status: OutageStatusSchema,
    reason: z
      .string()
      .min(1)
      .refine(
        (value) => {
          if (htmlCommentRE.test(value)) return false;
          if (htmlTagRE.test(value)) return false;
          return true;
        },
        { message: 'reason must not contain HTML tags or comments' },
      ),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date().optional(),
    estimatedRestoration: z.coerce.date().optional(),
    affectedAreas: z.array(AffectedAreaSchema),
    source: SourceProvenanceSchema,
    confidence: ConfidenceSchema,
    scheduled: z.boolean().optional(),
    city: z.string().optional(),
    barangays: z.array(AffectedAreaSchema).optional(),
  })
  .strict();

export type Outage = z.infer<typeof OutageSchema>;

export const OutageConfidence = ConfidenceSchema;
export type OutageConfidence = z.infer<typeof ConfidenceSchema>;
