import { execSync } from 'child_process';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { TEST_DATABASE_URL } from './testDbUrl';

// Fixed starter taxonomy — kept in sync with prisma/seedCuisines.ts. Tests need these
// rows to exist (every restaurant signup references a cuisineSlug), but db push --force-reset
// wipes the schema clean, so this is the one place to seed reference data before any test runs.
const CUISINES = ['Italian', 'Thai', 'Mexican', 'Japanese', 'American', 'Indian', 'Chinese', 'Mediterranean', 'Other'];

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export default async function globalSetup(): Promise<void> {
  execSync('npx prisma db push --force-reset --accept-data-loss --skip-generate', {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'inherit',
  });

  const prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });
  try {
    await prisma.cuisine.createMany({
      data: CUISINES.map((name) => ({ name, slug: slugify(name) })),
    });
  } finally {
    await prisma.$disconnect();
  }
}
