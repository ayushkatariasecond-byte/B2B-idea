import Link from 'next/link';
import type { Agency } from '@/lib/types';

function formatBudget(agency: Agency): string | null {
  if (agency.minProjectBudget) return `$${agency.minProjectBudget.toLocaleString()}+ min project`;
  if (agency.hourlyRateMin) return `$${agency.hourlyRateMin}–$${agency.hourlyRateMax ?? agency.hourlyRateMin}/hr`;
  return null;
}

export function AgencyCard({ agency }: { agency: Agency }) {
  const budget = formatBudget(agency);
  return (
    <Link href={`/agencies/${agency.handle}`} className="agency-card">
      <div className="agency-card-top">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="avatar" src={agency.avatarUrl || '/agency-placeholder.svg'} alt="" />
        <div>
          <div className="agency-name">
            {agency.name}
            {agency.verified && <span className="verified-badge"> · Verified</span>}
          </div>
          <div className="agency-meta">{agency.headquartersLocation || agency.category}</div>
        </div>
      </div>
      {agency.services && agency.services.length > 0 && (
        <div className="tag-row">
          {agency.services.slice(0, 3).map((service) => (
            <span key={service.id} className="tag">
              {service.name}
            </span>
          ))}
        </div>
      )}
      {budget && <div className="agency-meta">{budget}</div>}
    </Link>
  );
}
