import { getCachedGeminiOutages } from '@/lib/cache/outages';
import { outageFixtures } from '@/lib/ingestion/__fixtures__/outages';
import { createOgImage, OG_CONTENT_TYPE, OG_SIZE } from '@/lib/seo/og-template';
import { findBarangayBySlug } from '@/lib/utils/barangay-slug';
import { deslugify } from '@/lib/utils/slugify';

const DEV = process.env.NODE_ENV !== 'production';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'TubigWatch barangay water advisory';

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  let location: { name: string; city: string } | undefined;
  try {
    const outages =
      DEV && process.env.GEMINI_API_KEY === undefined
        ? outageFixtures
        : (await getCachedGeminiOutages()).outages;
    location = findBarangayBySlug(slug, outages) ?? undefined;
  } catch {
    // A card with the slug label is still better than a broken preview.
  }

  const name = location?.name ?? deslugify(slug);
  const city = location?.city ?? '';

  return createOgImage(
    `${name}${city ? `, ${city}` : ''}`,
    'Live Metro Manila water service advisories',
  );
}
