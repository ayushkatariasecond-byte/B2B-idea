import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth, optionalAuth, AuthedRequest } from '../middleware/auth';
import { upload, mediaTypeFromMime } from '../upload';
import { transcodeVideo } from '../utils/videoTranscode';
import { persistUpload } from '../storage';
import { containsBlockedContent } from '../utils/moderation';

export const caseStudiesRouter = Router();

const include = { media: { orderBy: { sortOrder: 'asc' as const } }, results: { orderBy: { sortOrder: 'asc' as const } } };

async function loadOwnedCaseStudy(id: string, businessId?: string) {
  const caseStudy = await prisma.caseStudy.findUnique({ where: { id } });
  if (!caseStudy || caseStudy.agencyId !== businessId) return null;
  return caseStudy;
}

const createSchema = z.object({
  title: z.string().min(1).max(200),
  clientName: z.string().max(120).optional(),
  summary: z.string().max(4000).default(''),
  status: z.enum(['draft', 'published']).optional().default('draft'),
});

caseStudiesRouter.post('/', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
  if (containsBlockedContent(parsed.data.summary) || containsBlockedContent(parsed.data.title)) {
    return res.status(400).json({ error: 'This case study violates our content guidelines' });
  }

  const caseStudy = await prisma.caseStudy.create({
    data: {
      agencyId: req.businessId!,
      title: parsed.data.title,
      clientName: parsed.data.clientName,
      summary: parsed.data.summary,
      status: parsed.data.status,
    },
    include,
  });
  res.status(201).json({ caseStudy });
});

caseStudiesRouter.get('/:id', optionalAuth, async (req: AuthedRequest, res) => {
  const caseStudy = await prisma.caseStudy.findUnique({ where: { id: req.params.id }, include });
  if (!caseStudy) return res.status(404).json({ error: 'Case study not found' });
  if (caseStudy.hidden && caseStudy.agencyId !== req.businessId) {
    return res.status(404).json({ error: 'Case study not found' });
  }
  if (caseStudy.status !== 'published' && caseStudy.agencyId !== req.businessId) {
    return res.status(404).json({ error: 'Case study not found' });
  }
  res.json({ caseStudy });
});

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  clientName: z.string().max(120).nullable().optional(),
  summary: z.string().max(4000).optional(),
  status: z.enum(['draft', 'published']).optional(),
});

caseStudiesRouter.patch('/:id', requireAuth, async (req: AuthedRequest, res) => {
  const existing = await loadOwnedCaseStudy(req.params.id, req.businessId);
  if (!existing) return res.status(404).json({ error: 'Case study not found' });

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
  if (parsed.data.summary !== undefined && containsBlockedContent(parsed.data.summary)) {
    return res.status(400).json({ error: 'This case study violates our content guidelines' });
  }

  const caseStudy = await prisma.caseStudy.update({
    where: { id: existing.id },
    data: parsed.data,
    include,
  });
  res.json({ caseStudy });
});

caseStudiesRouter.delete('/:id', requireAuth, async (req: AuthedRequest, res) => {
  const existing = await loadOwnedCaseStudy(req.params.id, req.businessId);
  if (!existing) return res.status(404).json({ error: 'Case study not found' });

  await prisma.$transaction([
    prisma.caseStudyMedia.deleteMany({ where: { caseStudyId: existing.id } }),
    prisma.caseStudyResult.deleteMany({ where: { caseStudyId: existing.id } }),
    prisma.review.updateMany({ where: { caseStudyId: existing.id }, data: { caseStudyId: null } }),
    prisma.caseStudy.delete({ where: { id: existing.id } }),
  ]);
  res.json({ ok: true });
});

caseStudiesRouter.post('/:id/media', requireAuth, upload.single('media'), async (req: AuthedRequest, res) => {
  const existing = await loadOwnedCaseStudy(req.params.id, req.businessId);
  if (!existing) return res.status(404).json({ error: 'Case study not found' });
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'A photo or video is required' });

  const mediaType = mediaTypeFromMime(file.mimetype);
  let filename = file.filename;
  if (mediaType === 'video') {
    try {
      filename = await transcodeVideo(file.filename);
    } catch {
      // Transcoding is a nice-to-have — fall back to the original upload rather than blocking.
    }
  }
  const mediaUrl = await persistUpload(filename);

  const sortOrder = typeof req.body.sortOrder === 'string' ? Number(req.body.sortOrder) || 0 : 0;
  const media = await prisma.caseStudyMedia.create({
    data: { caseStudyId: existing.id, mediaUrl, mediaType, sortOrder },
  });
  res.status(201).json({ media });
});

caseStudiesRouter.delete('/:id/media/:mediaId', requireAuth, async (req: AuthedRequest, res) => {
  const existing = await loadOwnedCaseStudy(req.params.id, req.businessId);
  if (!existing) return res.status(404).json({ error: 'Case study not found' });
  const media = await prisma.caseStudyMedia.findUnique({ where: { id: req.params.mediaId } });
  if (!media || media.caseStudyId !== existing.id) return res.status(404).json({ error: 'Media not found' });

  await prisma.caseStudyMedia.delete({ where: { id: media.id } });
  res.json({ ok: true });
});

const resultSchema = z.object({
  metricLabel: z.string().min(1).max(80),
  metricValue: z.string().min(1).max(40),
  sortOrder: z.number().int().optional().default(0),
});

caseStudiesRouter.post('/:id/results', requireAuth, async (req: AuthedRequest, res) => {
  const existing = await loadOwnedCaseStudy(req.params.id, req.businessId);
  if (!existing) return res.status(404).json({ error: 'Case study not found' });

  const parsed = resultSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });

  const result = await prisma.caseStudyResult.create({
    data: { caseStudyId: existing.id, ...parsed.data },
  });
  res.status(201).json({ result });
});

const resultUpdateSchema = z.object({
  metricLabel: z.string().min(1).max(80).optional(),
  metricValue: z.string().min(1).max(40).optional(),
  sortOrder: z.number().int().optional(),
});

caseStudiesRouter.patch('/:id/results/:resultId', requireAuth, async (req: AuthedRequest, res) => {
  const existing = await loadOwnedCaseStudy(req.params.id, req.businessId);
  if (!existing) return res.status(404).json({ error: 'Case study not found' });
  const result = await prisma.caseStudyResult.findUnique({ where: { id: req.params.resultId } });
  if (!result || result.caseStudyId !== existing.id) return res.status(404).json({ error: 'Result not found' });

  const parsed = resultUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });

  const updated = await prisma.caseStudyResult.update({ where: { id: result.id }, data: parsed.data });
  res.json({ result: updated });
});

caseStudiesRouter.delete('/:id/results/:resultId', requireAuth, async (req: AuthedRequest, res) => {
  const existing = await loadOwnedCaseStudy(req.params.id, req.businessId);
  if (!existing) return res.status(404).json({ error: 'Case study not found' });
  const result = await prisma.caseStudyResult.findUnique({ where: { id: req.params.resultId } });
  if (!result || result.caseStudyId !== existing.id) return res.status(404).json({ error: 'Result not found' });

  await prisma.caseStudyResult.delete({ where: { id: result.id } });
  res.json({ ok: true });
});
