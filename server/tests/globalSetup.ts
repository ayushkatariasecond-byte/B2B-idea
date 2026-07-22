import { execSync } from 'child_process';
import path from 'path';
import { TEST_DATABASE_URL } from './testDbUrl';

export default function globalSetup(): void {
  execSync('npx prisma db push --force-reset --accept-data-loss --skip-generate', {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'inherit',
  });
}
