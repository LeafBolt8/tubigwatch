// Barangay-name normalization for Maynilad's observed forms.
//
// Observed forms (verbatim from recon round 2):
//   - "Brgy. Holy Spirit"                              -> ["Holy Spirit"]
//   - "Brgys. 160, 162 and 163"                        -> ["160","162","163"]
//   - "Brgys. Anabu II-C to Anabu II-E, ... and ..."   -> keep raw as ONE inferred barangay
//
// Rule: split only when the result is clean and unambiguous. When the cell is a range (" to ")
// or an "and"-joined multi-word phrase, do NOT fabricate multiple barangay names — keep the
// original cell as a single inferred barangay with confidence: "inferred".
// Never fabricate a barangay.

import type { OutageConfidence } from '@/lib/schemas/outage';

/** Normalized barangay name + how confident we are in the split. */
export type NormalizedBarangay = { name: string; confidence: OutageConfidence };

const BRGY_PREFIX_RE = /^(Brgy\.?|Brgys\.?)\s+/i;

/**
 * Normalize a Maynilad barangay cell into one or more normalized names.
 *
 * Handles the forms observed verbatim in recon:
 *   - "Brgy. Holy Spirit"            -> [{ name: "Holy Spirit", confidence: "official" }]
 *   - "Brgys. 160, 162 and 163"      -> [
 *                                        { name: "160", confidence: "official" },
 *                                        { name: "162", confidence: "official" },
 *                                        { name: "163", confidence: "official" },
 *                                      ]
 *   - range + comma + and forms       -> [{ name: <original cell>, confidence: "inferred" }]
 *
 * Trailing ", <City>" is stripped first when the cell mixed area + city (observed once:
 * "at Don Jose Street, Quezon City"). When the cell is ambiguous we keep the original cell
 * as a single inferred barangay — never fabricate multiple names.
 */
export function normalizeBarangays(raw: string): NormalizedBarangay[] {
  // Strip any trailing ", <City>" if the cell mixed Specific Area + City (observed once:
  // "at Don Jose Street, Quezon City" in the emergency fragment).
  const stripped = raw.replace(/\s*,\s*[A-Za-z .-]+City$/i, '').trim();
  if (!stripped) return [];

  // Remove a leading "Brgy."/"Brgys." prefix so the list logic works on the names.
  const body = stripped.replace(BRGY_PREFIX_RE, '').trim();
  if (!body) return [];

  // "Brgy. Holy Spirit" -> body = "Holy Spirit"

  // If there is a " to " range OR an " and " that joins two multi-word ranges, splitting is
  // unreliable without a barangay lexicon — keep raw.
  if (/\bto\b/i.test(body) || /\band\b/.test(body) && body.includes(',')) {
    return [{ name: raw.trim(), confidence: 'inferred' }];
  }

  // "Brgys. 160, 162 and 163" -> parts = ["160","162","163"]
  const parts = body.split(/,|\band\b/).map((p) => p.trim()).filter(Boolean);

  // Each part is a simple token. Validate it looks like a real barangay name/number.
  const out: NormalizedBarangay[] = [];
  for (const p of parts) {
    // Single-token numeric or short named barangay -> official.
    if (/^\d+[A-Za-z]?$/.test(p) || /^[A-Za-z][A-Za-z .'-]{0,20}$/.test(p)) {
      out.push({ name: p, confidence: 'official' });
    } else {
      // Ambiguous token -> fall back to inferred for the whole cell.
      return [{ name: raw.trim(), confidence: 'inferred' } as NormalizedBarangay];
    }
  }
  return out;
}
