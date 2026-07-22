import type { MetadataRoute } from 'next';
import { fetchDirectory, fetchServices, fetchIndustries } from '@/lib/api';

const SITE_URL = process.env.SITE_URL || 'http://localhost:3000';

async function fetchAllAgencies() {
  const agencies = [];
  let page = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const result = await fetchDirectory({ page }).catch(() => ({ agencies: [], hasMore: false }));
    agencies.push(...result.agencies);
    if (!result.hasMore) break;
    page += 1;
  }
  return agencies;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [agencies, services, industries] = await Promise.all([
    fetchAllAgencies(),
    fetchServices().catch(() => []),
    fetchIndustries().catch(() => []),
  ]);

  const staticEntries: MetadataRoute.Sitemap = [
    { url: SITE_URL, priority: 1 },
    { url: `${SITE_URL}/agencies`, priority: 0.9 },
  ];

  const agencyEntries: MetadataRoute.Sitemap = agencies.map((agency) => ({
    url: `${SITE_URL}/agencies/${agency.handle}`,
    priority: 0.8,
  }));

  const serviceEntries: MetadataRoute.Sitemap = services.map((s) => ({
    url: `${SITE_URL}/services/${s.slug}`,
    priority: 0.6,
  }));

  const industryEntries: MetadataRoute.Sitemap = industries.map((i) => ({
    url: `${SITE_URL}/industries/${i.slug}`,
    priority: 0.6,
  }));

  return [...staticEntries, ...agencyEntries, ...serviceEntries, ...industryEntries];
}
