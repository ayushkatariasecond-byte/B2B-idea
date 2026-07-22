import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fetchAgencyByHandle, fetchCaseStudies, resolveMediaUrl } from '@/lib/api';
import { InquiryForm } from '@/components/InquiryForm';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const agency = await fetchAgencyByHandle(slug);
  if (!agency) return {};
  const description = agency.description || agency.bio || `${agency.name} is a ${agency.category} agency.`;
  return {
    title: agency.name,
    description,
    openGraph: {
      title: agency.name,
      description,
      images: agency.coverUrl
        ? [resolveMediaUrl(agency.coverUrl)]
        : agency.avatarUrl
          ? [resolveMediaUrl(agency.avatarUrl)]
          : [],
    },
  };
}

function formatBudgetFacts(agency: NonNullable<Awaited<ReturnType<typeof fetchAgencyByHandle>>>, caseStudyCount: number) {
  const facts: { label: string; value: string }[] = [];
  if (agency.foundedYear) facts.push({ label: 'Founded', value: String(agency.foundedYear) });
  if (agency.teamSize) facts.push({ label: 'Team size', value: agency.teamSize });
  if (agency.headquartersLocation) facts.push({ label: 'Location', value: agency.headquartersLocation });
  if (agency.minProjectBudget) facts.push({ label: 'Min. project', value: `$${agency.minProjectBudget.toLocaleString()}` });
  if (agency.hourlyRateMin) {
    facts.push({
      label: 'Hourly rate',
      value: `$${agency.hourlyRateMin}${agency.hourlyRateMax ? `–$${agency.hourlyRateMax}` : '+'}`,
    });
  }
  facts.push({ label: 'Case studies', value: String(caseStudyCount) });
  return facts;
}

export default async function AgencyProfilePage({ params }: Props) {
  const { slug } = await params;
  const agency = await fetchAgencyByHandle(slug);
  if (!agency) notFound();

  const caseStudies = await fetchCaseStudies(agency.id);
  const facts = formatBudgetFacts(agency, caseStudies.length);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ProfessionalService',
    name: agency.name,
    description: agency.description || agency.bio,
    url: agency.website || undefined,
    image: agency.avatarUrl ? resolveMediaUrl(agency.avatarUrl) : undefined,
    address: agency.headquartersLocation ? { '@type': 'PostalAddress', addressLocality: agency.headquartersLocation } : undefined,
    knowsAbout: agency.services?.map((s) => s.name),
  };

  return (
    <div className="container">
      {/* eslint-disable-next-line react/no-danger */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="profile-header">
        <Image
          className="avatar"
          src={agency.avatarUrl ? resolveMediaUrl(agency.avatarUrl) : '/agency-placeholder.svg'}
          alt=""
          width={80}
          height={80}
        />
        <div>
          <h1>
            {agency.name}
            {agency.verified && <span className="verified-badge"> · Verified</span>}
          </h1>
          <p className="agency-meta">
            {agency.category}
            {agency.website && (
              <>
                {' · '}
                <a href={agency.website} target="_blank" rel="noopener noreferrer nofollow">
                  Website
                </a>
              </>
            )}
          </p>
        </div>
      </div>

      <div className="two-col section">
        <div>
          {(agency.description || agency.bio) && <p>{agency.description || agency.bio}</p>}

          {facts.length > 0 && (
            <div className="profile-facts">
              {facts.map((fact) => (
                <div key={fact.label}>
                  <div className="fact-label">{fact.label}</div>
                  <div className="fact-value">{fact.value}</div>
                </div>
              ))}
            </div>
          )}

          {agency.services && agency.services.length > 0 && (
            <>
              <div className="fact-label" style={{ marginBottom: 8 }}>
                Services
              </div>
              <div className="tag-row" style={{ marginBottom: 20 }}>
                {agency.services.map((s) => (
                  <Link key={s.id} href={`/services/${s.slug}`} className="tag">
                    {s.name}
                  </Link>
                ))}
              </div>
            </>
          )}

          {agency.industries && agency.industries.length > 0 && (
            <>
              <div className="fact-label" style={{ marginBottom: 8 }}>
                Industries served
              </div>
              <div className="tag-row" style={{ marginBottom: 20 }}>
                {agency.industries.map((i) => (
                  <Link key={i.id} href={`/industries/${i.slug}`} className="tag">
                    {i.name}
                  </Link>
                ))}
              </div>
            </>
          )}

          <h2 className="section-title">Case studies</h2>
          {caseStudies.length === 0 ? (
            <p className="empty-state">No published case studies yet.</p>
          ) : (
            caseStudies.map((cs) => (
              <article key={cs.id} className="case-study">
                <h3>{cs.title}</h3>
                {cs.clientName && <p className="agency-meta">Client: {cs.clientName}</p>}
                <p>{cs.summary}</p>
                {cs.media.length > 0 && (
                  <div className="case-study-media">
                    {cs.media.map((m) =>
                      m.mediaType === 'video' ? (
                        <video
                          key={m.id}
                          src={resolveMediaUrl(m.mediaUrl)}
                          controls
                          poster={m.thumbnailUrl ? resolveMediaUrl(m.thumbnailUrl) : undefined}
                        />
                      ) : (
                        <div key={m.id} className="media-item">
                          <Image
                            src={resolveMediaUrl(m.mediaUrl)}
                            alt={cs.title}
                            fill
                            sizes="(max-width: 720px) 50vw, 220px"
                            style={{ objectFit: 'cover' }}
                          />
                        </div>
                      ),
                    )}
                  </div>
                )}
                {cs.results.length > 0 && (
                  <div className="results-row">
                    {cs.results.map((r) => (
                      <div key={r.id} className="result-stat">
                        <div className="fact-value">{r.metricValue}</div>
                        <div className="fact-label">{r.metricLabel}</div>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            ))
          )}
        </div>

        <InquiryForm agencyId={agency.id} agencyName={agency.name} />
      </div>
    </div>
  );
}
