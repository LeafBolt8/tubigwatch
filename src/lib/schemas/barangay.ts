import { z } from 'zod';

/**
 * Provinces a concessionaire actually serves. Metro Manila is the default because its cities
 * name no province; Rizal, Cavite, Laguna and Bulacan cover the outlying service areas
 * (Manila Water reaches Antipolo/Taytay/Rodriguez, Maynilad reaches Imus/Bacoor/Kawit).
 */
export const ProvinceSchema = z.enum(['Metro Manila', 'Rizal', 'Cavite', 'Laguna', 'Bulacan']);

export type Province = z.infer<typeof ProvinceSchema>;

export const BarangaySchema = z
  .object({
    name: z.string().min(1),
    city: z.string().min(1),
    province: ProvinceSchema,
    psgcCode: z.string().min(1).optional(),
  })
  .strict();

export type Barangay = z.infer<typeof BarangaySchema>;
