import { prisma } from '../db';

/** Businesses that should be invisible to `businessId` — either it blocked them, or they blocked it. */
export async function getExcludedBusinessIds(businessId?: string): Promise<string[]> {
  if (!businessId) return [];
  const [blockedByMe, blockedMe] = await Promise.all([
    prisma.block.findMany({ where: { blockerId: businessId }, select: { blockedId: true } }),
    prisma.block.findMany({ where: { blockedId: businessId }, select: { blockerId: true } }),
  ]);
  return [...blockedByMe.map((b) => b.blockedId), ...blockedMe.map((b) => b.blockerId)];
}
