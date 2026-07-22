import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fetchDirectory, fetchServiceBySlug, fetchIndustryBySlug } from '@/lib/api';
import { AgencyCard } from '@/components/AgencyCard';

interface Props {
  params: Promise<{ service: string; industry: string }>;
}

// Deliberately no generateStaticParams here: with 15 services x 17 industries already
// (and growing), pre-building every combination at deploy time doesn't scale the way it
// does for the ~30 single-dimension hub pages. These render on demand and are cached via
// the fetch-level revalidate in lib/api.ts instead.

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { service: serviceSlug, industry: industrySlug } = await params;
  const [service, industry] = await Promise.all([fetchServiceBySlug(serviceSlug), fetchIndustryBySlug(industrySlug)]);
  if (!service || !industry) return {};

  const title = `${service.name} agencies for ${industry.name}`;
  const description = `Marketing agencies offering ${service.name} with real experience working with ${industry.name} clients — case studies and results, not a static listing.`;
  const directory = await fetchDirectory({ service: serviceSlug, industry: industrySlug });

  return {
    title,
    description,
    openGraph: { title, description },
    // Thin/empty combo pages shouldn't be indexed — they'd read as low-value duplicate
    // content to search engines. The page itself still renders normally either way.
    robots: directory.agencies.length === 0 ? { index: false, follow: true } : undefined,
  };
}

export default async function ServiceIndustryComboPage({ params }: Props) {
  const { service: serviceSlug, industry: industrySlug } = await params;
  const [service, industry] = await Promise.all([fetchServiceBySlug(serviceSlug), fetchIndustryBySlug(industrySlug)]);
  if (!service || !industry) notFound();

  const directory = await fetchDirectory({ service: serviceSlug, industry: industrySlug });
  const siteUrl = process.env.SITE_URL || 'http://localhost:3000';

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${service.name} agencies for ${industry.name}`,
    itemListElement: directory.agencies.map((agency, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: `${siteUrl}/agency/${agency.handle}`,
      name: agency.name,
    })),
  };

  return (
    <div className="container section">
      {/* eslint-disable-next-line react/no-danger */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="eyebrow">
        {service.name} · {industry.name}
      </div>
      <h1 className="section-title">
        {service.name} agencies for {industry.name}
      </h1>
      <p className="agency-meta" style={{ marginBottom: 28 }}>
        {directory.total} {directory.total === 1 ? 'agency' : 'agencies'} offering {service.name}, experienced with{' '}
        {industry.name} clients.
      </p>
      {directory.agencies.length === 0 ? (
        <p className="empty-state">
          No {service.name} agencies serving {industry.name} yet — check back soon.
        </p>
      ) : (
        <div className="agency-grid">
          {directory.agencies.map((agency) => (
            <AgencyCard key={agency.id} agency={agency} />
          ))}
        </div>
      )}
    </div>
  );
}
