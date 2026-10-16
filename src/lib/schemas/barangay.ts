import { z } from 'zod';

export const BarangaySchema = z
  .object({
    name: z.string().min(1),
    city: z.string().min(1),
    province: z.literal('Metro Manila'),
    psgcCode: z.string().min(1).optional(),
  })
  .strict();

export type Barangay = z.infer<typeof BarangaySchema>;
