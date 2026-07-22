import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fetchDirectory, fetchServiceBySlug, fetchServices, fetchDirectoryCombos } from '@/lib/api';
import { AgencyCard } from '@/components/AgencyCard';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const services = await fetchServices().catch(() => []);
  return services.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const service = await fetchServiceBySlug(slug);
  if (!service) return {};
  return {
    title: `${service.name} agencies`,
    description: `Marketing agencies specializing in ${service.name}, with real case studies and results.`,
  };
}

export default async function ServicePage({ params }: Props) {
  const { slug } = await params;
  const service = await fetchServiceBySlug(slug);
  if (!service) notFound();

  const [directory, combos] = await Promise.all([
    fetchDirectory({ service: slug }),
    fetchDirectoryCombos().catch(() => []),
  ]);
  const relatedIndustries = combos.filter((c) => c.serviceSlug === slug);

  return (
    <div className="container section">
      <div className="eyebrow">Service</div>
      <h1 className="section-title">{service.name} agencies</h1>

      {relatedIndustries.length > 0 && (
        <div className="pill-row" style={{ justifyContent: 'flex-start', marginBottom: 28 }}>
          {relatedIndustries.map((c) => (
            <Link key={c.industrySlug} href={`/agencies/${slug}/${c.industrySlug}`} className="pill">
              For {c.industryName}
            </Link>
          ))}
        </div>
      )}

      {directory.agencies.length === 0 ? (
        <p className="empty-state">No agencies listed for {service.name} yet.</p>
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
