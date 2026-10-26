import type { MetadataRoute } from 'next';

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://tubigwatch.vercel.app';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // `/admin` (no trailing slash) still matches the page itself; `/admin/` would not.
      disallow: ['/api/', '/admin'],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
