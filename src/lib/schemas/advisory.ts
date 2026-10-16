import { z } from 'zod';

import { ConcessionaireSchema } from './concessionaire';
import { ISO_DATETIME_OPTIONS, SourceProvenanceSchema } from './outage';

export const AdvisoryCategorySchema = z.enum(['pressure', 'quality']);

export const AdvisorySchema = z
  .object({
    id: z.string().min(1),
    concessionaire: ConcessionaireSchema,
    category: AdvisoryCategorySchema,
    title: z.string().min(1).max(200),
    body: z
      .string()
      .max(2000)
      .refine((value) => !/[<>]/.test(value), { message: 'body must not contain HTML' }),
    issuedAt: z.string().datetime(ISO_DATETIME_OPTIONS),
    source: SourceProvenanceSchema,
  })
  .strict();

export type AdvisoryCategory = z.infer<typeof AdvisoryCategorySchema>;
export type Advisory = z.infer<typeof AdvisorySchema>;
