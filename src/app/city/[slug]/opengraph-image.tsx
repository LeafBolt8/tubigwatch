import { createOgImage, OG_CONTENT_TYPE, OG_SIZE } from '@/lib/seo/og-template';
import { canonicalCityName } from '@/lib/utils/city-name';
import { deslugify } from '@/lib/utils/slugify';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'TubigWatch water outage advisory';

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const cityName = canonicalCityName(slug) ?? deslugify(slug);

  return createOgImage(
    `Water Outages in ${cityName}`,
    'Live Metro Manila water service advisories',
  );
}
