import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fetchDirectory, fetchIndustryBySlug, fetchIndustries, fetchDirectoryCombos } from '@/lib/api';
import { AgencyCard } from '@/components/AgencyCard';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const industries = await fetchIndustries().catch(() => []);
  return industries.map((i) => ({ slug: i.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const industry = await fetchIndustryBySlug(slug);
  if (!industry) return {};
  return {
    title: `Marketing agencies for ${industry.name}`,
    description: `Agencies experienced with ${industry.name} clients, with real case studies and results.`,
  };
}

export default async function IndustryPage({ params }: Props) {
  const { slug } = await params;
  const industry = await fetchIndustryBySlug(slug);
  if (!industry) notFound();

  const [directory, combos] = await Promise.all([
    fetchDirectory({ industry: slug }),
    fetchDirectoryCombos().catch(() => []),
  ]);
  const relatedServices = combos.filter((c) => c.industrySlug === slug);

  return (
    <div className="container section">
      <div className="eyebrow">Industry</div>
      <h1 className="section-title">Agencies for {industry.name}</h1>

      {relatedServices.length > 0 && (
        <div className="pill-row" style={{ justifyContent: 'flex-start', marginBottom: 28 }}>
          {relatedServices.map((c) => (
            <Link key={c.serviceSlug} href={`/agencies/${c.serviceSlug}/${slug}`} className="pill">
              {c.serviceName}
            </Link>
          ))}
        </div>
      )}

      {directory.agencies.length === 0 ? (
        <p className="empty-state">No agencies listed for {industry.name} yet.</p>
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
