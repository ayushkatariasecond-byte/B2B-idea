export interface Service {
  id: string;
  name: string;
  slug: string;
}

export interface Industry {
  id: string;
  name: string;
  slug: string;
}

export interface Agency {
  id: string;
  name: string;
  handle: string;
  category: string;
  bio: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  verified: boolean;
  description: string;
  foundedYear: number | null;
  teamSize: string | null;
  headquartersLocation: string | null;
  website: string | null;
  minProjectBudget: number | null;
  hourlyRateMin: number | null;
  hourlyRateMax: number | null;
  services?: Service[];
  industries?: Industry[];
}

export interface CaseStudyMedia {
  id: string;
  mediaUrl: string;
  mediaType: 'image' | 'video';
  thumbnailUrl: string | null;
  sortOrder: number;
}

export interface CaseStudyResult {
  id: string;
  metricLabel: string;
  metricValue: string;
  sortOrder: number;
}

export interface CaseStudy {
  id: string;
  agencyId: string;
  title: string;
  clientName: string | null;
  summary: string;
  status: 'draft' | 'published';
  createdAt: string;
  media: CaseStudyMedia[];
  results: CaseStudyResult[];
}

export interface DirectoryResponse {
  agencies: Agency[];
  page: number;
  hasMore: boolean;
  total: number;
}
