/**
 * Normalizes a barangay label into a comparison key: drops a leading "Portions of" and any
 * "Brgy"/"Brgys" marker, strips every punctuation mark, collapses whitespace and lowercases.
 *
 * Used both as the dictionary lookup key and as the dedupe key, so it must stay stable: applying
 * it to both sides is what keeps punctuated entries ("Bel-Air", "Sto. Niño", "Doña Aurora") and
 * awkward source spellings ("Sta. Ana" / "Sta Ana", "Pinagbuhatan" / "PInagbuhatan") comparable.
 */
export function cleanBarangayName(name: string): string {
  return name
    .replace(/^portions?\s+of\s+/i, '')
    .replace(/brgys?\.?/gi, '')
    .replace(/[^a-z0-9\s]/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
