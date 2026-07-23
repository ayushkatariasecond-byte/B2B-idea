import { Router } from 'express';
import { prisma } from '../db';

export const cuisinesRouter = Router();

cuisinesRouter.get('/', async (_req, res) => {
  const cuisines = await prisma.cuisine.findMany({ orderBy: { name: 'asc' } });
  res.json({ cuisines });
});
