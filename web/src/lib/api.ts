import type { Agency, CaseStudy, DirectoryResponse, Industry, Service } from './types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

/** Every fetch here runs on the server (page components are Server Components by
 * default) except the inquiry form, which is a client component and calls this same
 * function from the browser — that's why the base URL is NEXT_PUBLIC_, not server-only. */
async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    next: { revalidate: 60 },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request to ${path} failed with ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export interface DirectoryFilters {
  q?: string;
  service?: string;
  industry?: string;
  maxBudget?: number;
  page?: number;
}

export async function fetchDirectory(filters: DirectoryFilters = {}): Promise<DirectoryResponse> {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.service) params.set('service', filters.service);
  if (filters.industry) params.set('industry', filters.industry);
  if (filters.maxBudget) params.set('maxBudget', String(filters.maxBudget));
  if (filters.page) params.set('page', String(filters.page));
  return apiFetch<DirectoryResponse>(`/businesses/directory?${params.toString()}`);
}

export async function fetchAgencyByHandle(handle: string): Promise<Agency | null> {
  try {
    const data = await apiFetch<{ business: Agency }>(`/businesses/handle/${encodeURIComponent(handle)}`);
    return data.business;
  } catch {
    return null;
  }
}

export async function fetchCaseStudies(agencyId: string): Promise<CaseStudy[]> {
  const data = await apiFetch<{ caseStudies: CaseStudy[] }>(`/businesses/${agencyId}/case-studies`);
  return data.caseStudies;
}

export async function fetchServices(): Promise<Service[]> {
  const data = await apiFetch<{ services: Service[] }>('/services');
  return data.services;
}

export async function fetchIndustries(): Promise<Industry[]> {
  const data = await apiFetch<{ industries: Industry[] }>('/industries');
  return data.industries;
}

export async function fetchServiceBySlug(slug: string): Promise<Service | null> {
  const services = await fetchServices();
  return services.find((s) => s.slug === slug) ?? null;
}

export async function fetchIndustryBySlug(slug: string): Promise<Industry | null> {
  const industries = await fetchIndustries();
  return industries.find((i) => i.slug === slug) ?? null;
}

export async function submitInquiry(input: {
  agencyId: string;
  name: string;
  email: string;
  company?: string;
  message: string;
  budget?: string;
}): Promise<void> {
  await apiFetch('/inquiries', { method: 'POST', body: JSON.stringify(input) });
}
