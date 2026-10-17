import { z } from 'zod';

export const ConfidenceSchema = z.enum(['official', 'inferred']);
export type Confidence = z.infer<typeof ConfidenceSchema>;
