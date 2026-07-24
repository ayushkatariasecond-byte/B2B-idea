import { api } from './client';

export interface PromoCode {
  id: string;
  code: string;
  discountDescription: string;
  active: boolean;
  createdAt: string;
}

export interface PromoCodeStats {
  code: string;
  discountDescription: string;
  active: boolean;
  redemptionCount: number;
  redemptions: string[];
}

export function createPromoCode(input: { code: string; discountDescription: string }) {
  return api.post<{ promoCode: PromoCode }>('/promo-codes', input);
}

export function getPromoCodeStats(code: string) {
  return api.get<PromoCodeStats>(`/promo-codes/${encodeURIComponent(code)}/stats`);
}
