import { createOgImage, OG_CONTENT_TYPE, OG_SIZE } from '@/lib/seo/og-template';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'TubigWatch outage map';

export default async function Image() {
  return createOgImage('Outage Map', 'Visualize water outages across Metro Manila');
}
