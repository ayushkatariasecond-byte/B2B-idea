/**
 * One-off data fix: lowercase every stored Business/BusinessMember email so existing accounts
 * (created before email lookups were normalized) can actually be found by a case-insensitive
 * login. Safe to re-run — a no-op once emails are already normalized. Skips (and reports) any
 * row whose normalized email would collide with another row, rather than risking data loss.
 */
import { prisma } from '../src/db';

async function normalizeTable<T extends { id: string; email: string }>(
  label: string,
  findMany: () => Promise<T[]>,
  update: (id: string, email: string) => Promise<unknown>
) {
  const rows = await findMany();
  const lowerCounts = new Map<string, number>();
  for (const row of rows) {
    const lower = row.email.trim().toLowerCase();
    lowerCounts.set(lower, (lowerCounts.get(lower) ?? 0) + 1);
  }

  let updated = 0;
  let skipped = 0;
  for (const row of rows) {
    const lower = row.email.trim().toLowerCase();
    if (lowerCounts.get(lower)! > 1) {
      console.warn(`[${label}] SKIPPED (collision): ${row.email} -> ${lower} (id ${row.id})`);
      skipped++;
      continue;
    }
    if (row.email !== lower) {
      await update(row.id, lower);
      updated++;
    }
  }
  console.log(`[${label}] normalized ${updated} row(s), skipped ${skipped} collision(s), ${rows.length} total`);
}

async function main() {
  await normalizeTable(
    'Business',
    () => prisma.business.findMany({ select: { id: true, email: true } }),
    (id, email) => prisma.business.update({ where: { id }, data: { email } })
  );
  await normalizeTable(
    'BusinessMember',
    () => prisma.businessMember.findMany({ select: { id: true, email: true } }),
    (id, email) => prisma.businessMember.update({ where: { id }, data: { email } })
  );
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
