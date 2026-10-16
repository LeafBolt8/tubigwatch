import { z } from 'zod';

import { ConcessionaireSchema } from './concessionaire';

export const TankerScheduleSchema = z
  .object({
    id: z.string().min(1),
    concessionaire: ConcessionaireSchema,
    location: z.string().min(1),
    arrivalWindow: z.string().min(1),
    notes: z.string().optional(),
  })
  .strict();

export type TankerSchedule = z.infer<typeof TankerScheduleSchema>;
