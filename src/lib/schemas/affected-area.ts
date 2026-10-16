import { z } from 'zod';

import { BarangaySchema } from './barangay';

export const AffectedAreaSchema = z
  .object({
    barangays: z.array(BarangaySchema),
    streets: z.array(z.string()).optional(),
    notes: z.string().optional(),
  })
  .strict();

export type AffectedArea = z.infer<typeof AffectedAreaSchema>;
