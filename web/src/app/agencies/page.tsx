import type { Metadata } from 'next';
import Link from 'next/link';
import { fetchDirectory, fetchServices, fetchIndustries } from '@/lib/api';
import { AgencyCard } from '@/components/AgencyCard';

export const metadata: Metadata = {
  title: 'Browse agencies',
  description: 'Search and filter marketing agencies by service, industry, and budget.',
};

interface Props {
  searchParams: Promise<{ q?: string; service?: string; industry?: string; maxBudget?: string; page?: string }>;
}

export default async function AgenciesPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const [directory, services, industries] = await Promise.all([
    fetchDirectory({
      q: params.q,
      service: params.service,
      industry: params.industry,
      maxBudget: params.maxBudget ? Number(params.maxBudget) : undefined,
      page,
    }),
    fetchServices().catch(() => []),
    fetchIndustries().catch(() => []),
  ]);

  function pageHref(nextPage: number) {
    const next = new URLSearchParams();
    if (params.q) next.set('q', params.q);
    if (params.service) next.set('service', params.service);
    if (params.industry) next.set('industry', params.industry);
    if (params.maxBudget) next.set('maxBudget', params.maxBudget);
    next.set('page', String(nextPage));
    return `/agencies?${next.toString()}`;
  }

  return (
    <div className="container section">
      <h1 className="section-title">Browse agencies</h1>

      <form action="/agencies" method="GET" className="filters">
        <input type="text" name="q" placeholder="Search" defaultValue={params.q} aria-label="Search agencies" />
        <select name="service" defaultValue={params.service || ''} aria-label="Filter by service">
          <option value="">All services</option>
          {services.map((s) => (
            <option key={s.id} value={s.slug}>
              {s.name}
            </option>
          ))}
        </select>
        <select name="industry" defaultValue={params.industry || ''} aria-label="Filter by industry">
          <option value="">All industries</option>
          {industries.map((i) => (
            <option key={i.id} value={i.slug}>
              {i.name}
            </option>
          ))}
        </select>
        <input
          type="number"
          name="maxBudget"
          placeholder="Max budget ($)"
          defaultValue={params.maxBudget}
          aria-label="Maximum project budget"
        />
        <button className="button secondary" type="submit">
          Apply filters
        </button>
      </form>

      {directory.agencies.length === 0 ? (
        <p className="empty-state">No agencies match those filters yet.</p>
      ) : (
        <div className="agency-grid">
          {directory.agencies.map((agency) => (
            <AgencyCard key={agency.id} agency={agency} />
          ))}
        </div>
      )}

      {(page > 1 || directory.hasMore) && (
        <div className="pagination">
          {page > 1 && (
            <Link href={pageHref(page - 1)} className="button secondary">
              Previous
            </Link>
          )}
          {directory.hasMore && (
            <Link href={pageHref(page + 1)} className="button secondary">
              Next
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
