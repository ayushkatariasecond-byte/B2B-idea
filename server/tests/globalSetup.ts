import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

export default function globalSetup(): void {
  const dbPath = path.join(__dirname, '..', 'prisma', 'test.db');
  for (const p of [dbPath, `${dbPath}-journal`]) {
    if (fs.existsSync(p)) fs.rmSync(p);
  }
  execSync('npx prisma migrate deploy', {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: 'file:./test.db' },
    stdio: 'inherit',
  });
}
