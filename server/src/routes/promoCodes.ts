import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth, optionalAuth, rejectGuest, AuthedRequest } from '../middleware/auth';
import { promoRedeemLimiter } from '../security';

export const promoCodesRouter = Router();

/** Codes are stored/looked-up uppercased so "save10", "Save10", and "SAVE10" all hit the
 * same row — customers redeeming a code out loud or from a printed flyer shouldn't have
 * to match case exactly. */
function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase();
}

const createSchema = z.object({
  code: z
    .string()
    .trim()
    .min(3, 'Code must be at least 3 characters')
    .max(20, 'Code must be at most 20 characters')
    .regex(/^[A-Za-z0-9_-]+$/, 'Code can only contain letters, numbers, hyphens, and underscores'),
  discountDescription: z.string().trim().min(1, 'A discount description is required').max(200),
});

// Not in the original spec's endpoint list, but the two spec'd endpoints (redeem, stats)
// are unusable without some way for a restaurant to originate a code in the first place —
// this is the minimum plumbing needed to make the requested feature actually work, not a
// new feature in its own right. Restaurant-only, same ownership model as everything else
// a business manages about itself.
promoCodesRouter.post('/', requireAuth, rejectGuest, async (req: AuthedRequest, res) => {
  const business = await prisma.business.findUnique({ where: { id: req.businessId! } });
  if (!business?.isRestaurant) {
    return res.status(403).json({ error: 'Only restaurant accounts can create promo codes' });
  }

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
  const code = normalizeCode(parsed.data.code);

  const existing = await prisma.promoCode.findUnique({ where: { code } });
  if (existing) return res.status(409).json({ error: 'That code is already taken' });

  const promoCode = await prisma.promoCode.create({
    data: { code, discountDescription: parsed.data.discountDescription, restaurantId: req.businessId! },
  });
  res.status(201).json({ promoCode });
});

const redeemSchema = z.object({
  code: z.string().trim().min(1, 'A code is required').max(20),
});

// Public and unauthenticated by design: a real-world redemption often happens at a
// register with no app login involved (spec: "someone could redeem by just entering a
// code... this is manually tracked in real life, the endpoint just logs it"). Duplicate
// redemptions of the same code are allowed on purpose — see the schema comment on
// PromoCode for the reasoning (shared code, no reliable identity to dedupe against for
// anonymous callers anyway).
promoCodesRouter.post('/redeem', promoRedeemLimiter, optionalAuth, async (req: AuthedRequest, res) => {
  const parsed = redeemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
  const code = normalizeCode(parsed.data.code);

  // Wrapped in a transaction so the "is it still active" check and the redemption insert
  // read/write against the same transactional snapshot, rather than as two independent
  // statements a concurrent deactivation could land in between.
  const result = await prisma.$transaction(async (tx) => {
    const promoCode = await tx.promoCode.findUnique({ where: { code } });
    if (!promoCode || !promoCode.active) return { ok: false as const };
    const redemption = await tx.redemption.create({
      data: { promoCodeId: promoCode.id, userId: req.businessId ?? null },
    });
    return { ok: true as const, redemption };
  });

  if (!result.ok) return res.status(400).json({ error: 'Invalid or inactive promo code' });
  res.status(201).json({ ok: true, redeemedAt: result.redemption.redeemedAt });
});

promoCodesRouter.get('/:code/stats', requireAuth, async (req: AuthedRequest, res) => {
  const code = normalizeCode(req.params.code);
  const promoCode = await prisma.promoCode.findUnique({ where: { code } });
  if (!promoCode) return res.status(404).json({ error: 'Promo code not found' });
  if (promoCode.restaurantId !== req.businessId!) {
    return res.status(403).json({ error: "You don't own this promo code" });
  }

  const redemptions = await prisma.redemption.findMany({
    where: { promoCodeId: promoCode.id },
    orderBy: { redeemedAt: 'desc' },
    select: { redeemedAt: true },
  });
  res.json({
    code: promoCode.code,
    discountDescription: promoCode.discountDescription,
    active: promoCode.active,
    redemptionCount: redemptions.length,
    redemptions: redemptions.map((r) => r.redeemedAt),
  });
});
