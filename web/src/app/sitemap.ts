import type { MetadataRoute } from 'next';
import { fetchDirectory, fetchServices, fetchIndustries, fetchDirectoryCombos } from '@/lib/api';

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
  const [agencies, services, industries, combos] = await Promise.all([
    fetchAllAgencies(),
    fetchServices().catch(() => []),
    fetchIndustries().catch(() => []),
    fetchDirectoryCombos().catch(() => []),
  ]);

  const staticEntries: MetadataRoute.Sitemap = [
    { url: SITE_URL, priority: 1 },
    { url: `${SITE_URL}/agencies`, priority: 0.9 },
  ];

  const agencyEntries: MetadataRoute.Sitemap = agencies.map((agency) => ({
    url: `${SITE_URL}/agency/${agency.handle}`,
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

  // Only combos with at least one matching agency — an empty niche page is thin
  // content that shouldn't be submitted to search engines (it still renders fine if
  // someone lands on it directly, just isn't promoted until it has something to show).
  const comboEntries: MetadataRoute.Sitemap = combos.map((c) => ({
    url: `${SITE_URL}/agencies/${c.serviceSlug}/${c.industrySlug}`,
    priority: 0.7,
  }));

  return [...staticEntries, ...agencyEntries, ...serviceEntries, ...industryEntries, ...comboEntries];
}
