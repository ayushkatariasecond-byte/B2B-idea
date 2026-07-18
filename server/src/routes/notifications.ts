import { Router } from 'express';
import { prisma } from '../db';
import { requireAuth, AuthedRequest } from '../middleware/auth';

export const notificationsRouter = Router();

notificationsRouter.get('/', requireAuth, async (req: AuthedRequest, res) => {
  const notifications = await prisma.notification.findMany({
    where: { recipientId: req.businessId! },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { actor: true },
  });

  res.json({
    notifications: notifications.map((n) => ({
      id: n.id,
      type: n.type,
      postId: n.postId,
      threadId: n.threadId,
      read: n.read,
      createdAt: n.createdAt,
      actor: n.actor ? { id: n.actor.id, name: n.actor.name, handle: n.actor.handle, avatarUrl: n.actor.avatarUrl } : null,
    })),
  });
});

notificationsRouter.get('/unread-count', requireAuth, async (req: AuthedRequest, res) => {
  const count = await prisma.notification.count({ where: { recipientId: req.businessId!, read: false } });
  res.json({ count });
});

notificationsRouter.post('/:id/read', requireAuth, async (req: AuthedRequest, res) => {
  const notification = await prisma.notification.findUnique({ where: { id: req.params.id } });
  if (!notification || notification.recipientId !== req.businessId) return res.status(404).json({ error: 'Notification not found' });
  await prisma.notification.update({ where: { id: notification.id }, data: { read: true } });
  res.json({ ok: true });
});

notificationsRouter.post('/read-all', requireAuth, async (req: AuthedRequest, res) => {
  await prisma.notification.updateMany({ where: { recipientId: req.businessId!, read: false }, data: { read: true } });
  res.json({ ok: true });
});
