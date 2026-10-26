import { createOgImage, OG_CONTENT_TYPE, OG_SIZE } from '@/lib/seo/og-template';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'TubigWatch — Metro Manila water outage tracker';

export default async function Image() {
  return createOgImage('TubigWatch', 'Real-time Metro Manila water outage advisories');
}
