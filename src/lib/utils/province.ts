import type { Province } from '@/lib/schemas/barangay';

/**
 * Derives a barangay's province from the city/municipality label an advisory row carries.
 *
 * Rows from Manila Water and Maynilad name the city only, and that name is often the sole
 * province signal available: "Antipolo, Rizal", "Dasmariñas", "Kawit". Municipalities whose
 * names do not contain their province ("Imus", "Bacoor", "Kawit", "Noveleta") are listed
 * explicitly, because no string match on "Cavite" would catch them.
 *
 * Defaults to Metro Manila: the capital region's cities name no province, and an unrecognised
 * name is far more likely to be one of them than an out-of-region city.
 */
export function deriveProvince(cityMunicipality: string): Province {
  const c = cityMunicipality.toLowerCase();

  if (c.includes('rizal') || c.includes('antipolo') || c.includes('taytay') || c.includes('rodriguez')) {
    return 'Rizal';
  }
  if (
    c.includes('cavite') ||
    c.includes('bacoor') ||
    c.includes('imus') ||
    c.includes('dasmariñas') ||
    c.includes('dasmarinas') ||
    c.includes('kawit') ||
    c.includes('noveleta')
  ) {
    return 'Cavite';
  }
  if (c.includes('laguna') || c.includes('calamba') || c.includes('santa rosa')) {
    return 'Laguna';
  }
  if (c.includes('bulacan') || c.includes('meycauayan') || c.includes('marilao')) {
    return 'Bulacan';
  }

  return 'Metro Manila';
}
