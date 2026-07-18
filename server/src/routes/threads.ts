import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { notify } from '../utils/notifications';

export const threadsRouter = Router();

function otherParticipant(thread: { participantAId: string; participantBId: string; participantA: any; participantB: any }, meId: string) {
  return thread.participantAId === meId ? thread.participantB : thread.participantA;
}

async function assertParticipant(threadId: string, businessId: string) {
  const thread = await prisma.thread.findUnique({ where: { id: threadId } });
  if (!thread) return null;
  if (thread.participantAId !== businessId && thread.participantBId !== businessId) return null;
  return thread;
}

threadsRouter.get('/', requireAuth, async (req: AuthedRequest, res) => {
  const meId = req.businessId!;
  const threads = await prisma.thread.findMany({
    where: { OR: [{ participantAId: meId }, { participantBId: meId }] },
    include: {
      participantA: true,
      participantB: true,
      messages: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });

  const withUnread = await Promise.all(
    threads.map(async (t) => {
      const other = otherParticipant(t, meId);
      const unreadCount = await prisma.message.count({
        where: { threadId: t.id, senderId: { not: meId }, readAt: null },
      });
      const last = t.messages[0];
      return {
        id: t.id,
        business: { id: other.id, name: other.name, handle: other.handle, avatarUrl: other.avatarUrl },
        lastMessage: last ? { text: last.text, createdAt: last.createdAt, senderId: last.senderId } : null,
        unread: unreadCount > 0,
        updatedAt: last ? last.createdAt : t.createdAt,
      };
    })
  );

  withUnread.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  res.json({ threads: withUnread });
});

const startSchema = z.object({ businessId: z.string().min(1) });

threadsRouter.post('/', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = startSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'businessId is required' });
  const meId = req.businessId!;
  const otherId = parsed.data.businessId;
  if (otherId === meId) return res.status(400).json({ error: "You can't message your own page" });

  const other = await prisma.business.findUnique({ where: { id: otherId } });
  if (!other) return res.status(404).json({ error: 'Business not found' });

  const blocked = await prisma.block.findFirst({
    where: {
      OR: [
        { blockerId: meId, blockedId: otherId },
        { blockerId: otherId, blockedId: meId },
      ],
    },
  });
  if (blocked) return res.status(403).json({ error: "You can't message this business" });

  const [a, b] = [meId, otherId].sort();
  let thread = await prisma.thread.findUnique({ where: { participantAId_participantBId: { participantAId: a, participantBId: b } } });
  if (!thread) {
    thread = await prisma.thread.create({ data: { participantAId: a, participantBId: b } });
  }
  res.status(201).json({ threadId: thread.id });
});

threadsRouter.get('/:id/messages', requireAuth, async (req: AuthedRequest, res) => {
  const meId = req.businessId!;
  const thread = await assertParticipant(req.params.id, meId);
  if (!thread) return res.status(404).json({ error: 'Thread not found' });

  const messages = await prisma.message.findMany({ where: { threadId: thread.id }, orderBy: { createdAt: 'asc' } });

  await prisma.message.updateMany({
    where: { threadId: thread.id, senderId: { not: meId }, readAt: null },
    data: { readAt: new Date() },
  });

  res.json({
    messages: messages.map((m) => ({ id: m.id, text: m.text, senderId: m.senderId, createdAt: m.createdAt, mine: m.senderId === meId })),
  });
});

const sendSchema = z.object({ text: z.string().min(1).max(2000) });

threadsRouter.post('/:id/messages', requireAuth, async (req: AuthedRequest, res) => {
  const meId = req.businessId!;
  const parsed = sendSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Message text is required' });

  const thread = await assertParticipant(req.params.id, meId);
  if (!thread) return res.status(404).json({ error: 'Thread not found' });

  const message = await prisma.message.create({ data: { threadId: thread.id, senderId: meId, text: parsed.data.text } });
  const recipientId = thread.participantAId === meId ? thread.participantBId : thread.participantAId;
  void notify({ recipientId, actorId: meId, type: 'message', threadId: thread.id });
  res.status(201).json({ message: { id: message.id, text: message.text, senderId: message.senderId, createdAt: message.createdAt, mine: true } });
});
