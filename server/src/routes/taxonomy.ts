import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth, requireAdmin } from '../middleware/auth';

export const taxonomyRouter = Router();

const createSchema = z.object({ name: z.string().min(2).max(60) });

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

taxonomyRouter.get('/services', async (_req, res) => {
  const services = await prisma.service.findMany({ orderBy: { name: 'asc' } });
  res.json({ services });
});

taxonomyRouter.post('/services', requireAuth, requireAdmin, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
  const slug = slugify(parsed.data.name);
  const service = await prisma.service.upsert({
    where: { slug },
    update: {},
    create: { name: parsed.data.name, slug },
  });
  res.status(201).json({ service });
});

taxonomyRouter.get('/industries', async (_req, res) => {
  const industries = await prisma.industry.findMany({ orderBy: { name: 'asc' } });
  res.json({ industries });
});

taxonomyRouter.post('/industries', requireAuth, requireAdmin, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
  const slug = slugify(parsed.data.name);
  const industry = await prisma.industry.upsert({
    where: { slug },
    update: {},
    create: { name: parsed.data.name, slug },
  });
  res.status(201).json({ industry });
});
