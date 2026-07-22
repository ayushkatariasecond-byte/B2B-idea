import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fetchDirectory, fetchIndustryBySlug, fetchIndustries } from '@/lib/api';
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

  const directory = await fetchDirectory({ industry: slug });

  return (
    <div className="container section">
      <div className="eyebrow">Industry</div>
      <h1 className="section-title">Agencies for {industry.name}</h1>
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
