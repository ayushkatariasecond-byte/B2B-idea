import { prisma } from '../db';
import { sendExpoPush } from './push';

type NotificationType = 'like' | 'comment' | 'follow' | 'message';

const MESSAGES: Record<NotificationType, (actorName: string) => string> = {
  like: (name) => `${name} liked your post`,
  comment: (name) => `${name} commented on your post`,
  follow: (name) => `${name} started following you`,
  message: (name) => `${name} sent you a message`,
};

interface NotifyInput {
  recipientId: string;
  actorId: string;
  type: NotificationType;
  postId?: string;
  threadId?: string;
}

/** Creates a notification row and best-effort pushes it. Never throws — a notification failure must not break the action that triggered it. */
export async function notify({ recipientId, actorId, type, postId, threadId }: NotifyInput): Promise<void> {
  if (recipientId === actorId) return;
  try {
    await prisma.notification.create({
      data: { recipientId, actorId, type, postId, threadId },
    });

    const [recipient, actor] = await Promise.all([
      prisma.business.findUnique({ where: { id: recipientId } }),
      prisma.business.findUnique({ where: { id: actorId } }),
    ]);
    if (recipient?.expoPushToken && actor) {
      void sendExpoPush(recipient.expoPushToken, 'Verve', MESSAGES[type](actor.name), { type, postId, threadId });
    }
  } catch {
    // notifications are best-effort; never let this break the caller
  }
}
