import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { encodeSolidPng } from '../src/utils/png';

const prisma = new PrismaClient();
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function writePlaceholder(filename: string, rgb: [number, number, number], accent: [number, number, number]): string {
  const png = encodeSolidPng(360, 640, rgb, accent);
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), png);
  return `/uploads/${filename}`;
}

const GOLD: [number, number, number] = [212, 175, 100];

const BUSINESSES = [
  {
    handle: 'novarobotics',
    name: 'Nova Robotics',
    category: 'Industrial Automation',
    bio: "We build warehouse robots that don't take themselves too seriously. Based in Austin, shipping worldwide.",
    color: [40, 44, 52] as [number, number, number],
    posts: [
      { caption: 'We taught a warehouse arm to dance. Turns out efficiency looks good with rhythm.', tag: 'Product Launch' },
      { caption: 'Behind the scenes: calibrating 40 arms before the trade show floor opened.', tag: 'Behind the Build' },
    ],
  },
  {
    handle: 'fathomhq',
    name: 'Fathom Analytics',
    category: 'Data Analytics',
    bio: 'Dashboards your whole team will actually open. No SQL required.',
    color: [24, 58, 74] as [number, number, number],
    posts: [
      { caption: 'Our engineers rebuilt the dashboard live on stage in 40 minutes. No cuts.', tag: 'Behind the Build' },
      { caption: 'What happens when you give finance a real-time revenue graph? Chaos. Good chaos.', tag: 'Culture' },
    ],
  },
  {
    handle: 'loopfreight',
    name: 'Loop Logistics',
    category: 'Freight & Logistics',
    bio: 'Smarter routes, fewer empty miles. Freight software for people who hate spreadsheets.',
    color: [30, 66, 44] as [number, number, number],
    posts: [
      { caption: 'One client cut delivery time 30%. Here is the exact route we changed.', tag: 'Customer Story' },
    ],
  },
  {
    handle: 'cindercloud',
    name: 'Cinder Cloud',
    category: 'Cloud Infrastructure',
    bio: 'Infra that scales before your traffic spike, not after.',
    color: [70, 30, 26] as [number, number, number],
    posts: [
      { caption: 'Our on-call rotation now includes a trophy. Petty? Maybe. Effective? Very.', tag: 'Culture' },
      { caption: 'We migrated 12,000 containers with zero downtime. Here is the runbook.', tag: 'Case Study' },
    ],
  },
  {
    handle: 'buildops',
    name: 'BuildOps',
    category: 'Construction Tech',
    bio: 'Job site software for crews who would rather be building than filing paperwork.',
    color: [52, 52, 58] as [number, number, number],
    posts: [
      { caption: 'A foreman ran an entire crew schedule from his truck. No laptop. No office.', tag: 'Customer Story' },
    ],
  },
  {
    handle: 'anchoragefreight',
    name: 'Anchorage Freight',
    category: 'Freight & Logistics',
    bio: 'Cold-chain freight that actually stays cold.',
    color: [22, 48, 58] as [number, number, number],
    posts: [
      { caption: 'We strapped a thermal camera to a trailer for 2,000 miles. The footage surprised us.', tag: 'Product Launch' },
    ],
  },
];

const COMMENT_LINES = [
  'The transition at 0:12 is criminally good.',
  'Sending this to our whole marketing team.',
  "We need this energy. DM'ing you.",
  'Okay this actually made me want to buy from you.',
  'How long did this take to shoot?',
];

async function main() {
  const password = await bcrypt.hash('password123', 10);
  const created: { id: string; handle: string }[] = [];

  for (const biz of BUSINESSES) {
    const business = await prisma.business.upsert({
      where: { handle: biz.handle },
      update: {},
      create: {
        email: `${biz.handle}@verve.demo`,
        passwordHash: password,
        name: biz.name,
        handle: biz.handle,
        category: biz.category,
        bio: biz.bio,
        avatarUrl: writePlaceholder(`${biz.handle}-avatar.png`, biz.color, GOLD),
        coverUrl: writePlaceholder(`${biz.handle}-cover.png`, biz.color, GOLD),
      },
    });
    created.push({ id: business.id, handle: business.handle });

    let i = 0;
    for (const p of biz.posts) {
      i += 1;
      await prisma.post.create({
        data: {
          businessId: business.id,
          mediaUrl: writePlaceholder(`${biz.handle}-post-${i}.png`, biz.color, GOLD),
          mediaType: 'image',
          caption: p.caption,
          tag: p.tag,
        },
      });
    }
  }

  const allPosts = await prisma.post.findMany();
  const byId = (handle: string) => created.find((c) => c.handle === handle)!.id;

  // Cross-follows so a fresh signup sees an active Following feed once they follow a couple pages.
  const followPairs: [string, string][] = [
    ['fathomhq', 'novarobotics'],
    ['loopfreight', 'novarobotics'],
    ['cindercloud', 'fathomhq'],
    ['buildops', 'loopfreight'],
    ['novarobotics', 'cindercloud'],
    ['anchoragefreight', 'loopfreight'],
  ];
  for (const [follower, followee] of followPairs) {
    await prisma.follow
      .create({ data: { followerId: byId(follower), followeeId: byId(followee) } })
      .catch(() => undefined);
  }

  // Likes + comments spread across posts so scores/trending and analytics have real signal.
  let commentCursor = 0;
  for (const post of allPosts) {
    const likers = created.filter((c) => c.id !== post.businessId).slice(0, 3 + (post.caption.length % 3));
    for (const liker of likers) {
      await prisma.like.create({ data: { postId: post.id, businessId: liker.id } }).catch(() => undefined);
    }
    const commenters = created.filter((c) => c.id !== post.businessId).slice(0, 2);
    for (const commenter of commenters) {
      await prisma.comment.create({
        data: { postId: post.id, businessId: commenter.id, text: COMMENT_LINES[commentCursor % COMMENT_LINES.length] },
      });
      commentCursor += 1;
    }
    // Backdated views over the last 8 weeks so weekly charts + 30d deltas are non-trivial.
    for (let w = 0; w < 8; w++) {
      const viewsThisWeek = 5 + ((w * 7 + post.caption.length) % 20);
      for (let v = 0; v < viewsThisWeek; v++) {
        const daysAgo = w * 7 + (v % 7);
        await prisma.postView.create({
          data: {
            postId: post.id,
            createdAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
          },
        });
      }
    }
  }

  // A couple of seeded conversations.
  const [a, b] = [byId('novarobotics'), byId('anchoragefreight')].sort();
  const thread1 = await prisma.thread.upsert({
    where: { participantAId_participantBId: { participantAId: a, participantBId: b } },
    update: {},
    create: { participantAId: a, participantBId: b },
  });
  await prisma.message.create({ data: { threadId: thread1.id, senderId: byId('anchoragefreight'), text: 'Can your team demo at our booth?' } });

  const [c, d] = [byId('fathomhq'), byId('buildops')].sort();
  const thread2 = await prisma.thread.upsert({
    where: { participantAId_participantBId: { participantAId: c, participantBId: d } },
    update: {},
    create: { participantAId: c, participantBId: d },
  });
  await prisma.message.create({ data: { threadId: thread2.id, senderId: byId('fathomhq'), text: 'Thanks for the shoutout on stream.' } });

  console.log(`Seeded ${created.length} businesses and ${allPosts.length} posts.`);
  console.log('Demo login: any handle+"@verve.demo" (e.g. novarobotics@verve.demo) / password123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
