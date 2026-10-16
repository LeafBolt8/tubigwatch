import { z } from 'zod';

export const OutageStatusSchema = z.enum([
  'scheduled',
  'active',
  'restored',
  'cancelled',
  'unknown',
]);

export type OutageStatus = z.infer<typeof OutageStatusSchema>;
