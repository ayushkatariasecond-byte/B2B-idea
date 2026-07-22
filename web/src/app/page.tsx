import Link from 'next/link';
import { fetchServices, fetchIndustries } from '@/lib/api';

export default async function HomePage() {
  const [services, industries] = await Promise.all([
    fetchServices().catch(() => []),
    fetchIndustries().catch(() => []),
  ]);

  return (
    <>
      <section className="hero container">
        <h1>Find a marketing agency that&apos;s actually done the work before</h1>
        <p>Every profile here is built from real case studies — project media and results, not a static listing.</p>
        <form action="/agencies" method="GET" className="search-bar">
          <input type="text" name="q" placeholder="Search agencies by name or specialty" aria-label="Search agencies" />
          <button className="button" type="submit">
            Search
          </button>
        </form>
        {services.length > 0 && (
          <div className="pill-row">
            {services.slice(0, 8).map((service) => (
              <Link key={service.id} href={`/services/${service.slug}`} className="pill">
                {service.name}
              </Link>
            ))}
          </div>
        )}
      </section>

      {industries.length > 0 && (
        <section className="section container">
          <div className="eyebrow">Browse by industry</div>
          <h2 className="section-title">Agencies that know your market</h2>
          <div className="pill-row" style={{ justifyContent: 'flex-start' }}>
            {industries.map((industry) => (
              <Link key={industry.id} href={`/industries/${industry.slug}`} className="pill">
                {industry.name}
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
