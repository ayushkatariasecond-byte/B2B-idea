import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

const CUISINES = ['Italian', 'Thai', 'Mexican', 'Japanese', 'American', 'Indian', 'Chinese', 'Mediterranean', 'Other'];

async function main() {
  for (const name of CUISINES) {
    await prisma.cuisine.upsert({
      where: { slug: slugify(name) },
      update: { name },
      create: { name, slug: slugify(name) },
    });
  }
  console.log(`Seeded ${CUISINES.length} cuisines.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
