import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Starter lists for the fixed Service/Industry taxonomy — edit freely, this is meant to be
// a reasonable default, not a definitive list. Idempotent (upsert by slug), safe to re-run.
const SERVICES = [
  'SEO',
  'Paid Search',
  'Paid Social',
  'Content Marketing',
  'Email Marketing',
  'Branding & Design',
  'Web Development',
  'App Development',
  'Video Production',
  'PR & Communications',
  'Influencer Marketing',
  'Marketing Strategy',
  'Conversion Rate Optimization',
  'Marketing Automation',
  'Social Media Management',
];

const INDUSTRIES = [
  'SaaS',
  'E-commerce',
  'Healthcare',
  'Real Estate',
  'Financial Services',
  'Education',
  'Hospitality & Travel',
  'Nonprofit',
  'Manufacturing',
  'Professional Services',
  'Retail',
  'Technology',
  'Legal',
  'Automotive',
  'Consumer Goods',
];

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

async function main() {
  for (const name of SERVICES) {
    const slug = slugify(name);
    await prisma.service.upsert({ where: { slug }, update: { name }, create: { name, slug } });
  }
  for (const name of INDUSTRIES) {
    const slug = slugify(name);
    await prisma.industry.upsert({ where: { slug }, update: { name }, create: { name, slug } });
  }
  console.log(`Seeded ${SERVICES.length} services and ${INDUSTRIES.length} industries.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
