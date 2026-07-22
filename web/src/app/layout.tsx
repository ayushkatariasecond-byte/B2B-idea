import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Verve Agencies — Find the right marketing agency',
    template: '%s | Verve Agencies',
  },
  description: 'A directory of marketing agencies with real case studies, project media, and results — not just a listing.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="container">
            <Link href="/" className="wordmark">
              verve<span>agencies</span>
            </Link>
            <nav className="site-nav">
              <Link href="/agencies">Browse agencies</Link>
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          <div className="container">© {new Date().getFullYear()} Verve Agencies.</div>
        </footer>
      </body>
    </html>
  );
}
