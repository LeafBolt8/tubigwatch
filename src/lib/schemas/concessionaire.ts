import { z } from 'zod';

export const ConcessionaireSchema = z.enum(['maynilad', 'manila-water']);

export type Concessionaire = z.infer<typeof ConcessionaireSchema>;
