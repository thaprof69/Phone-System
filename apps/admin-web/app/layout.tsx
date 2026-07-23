import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Quantum Parks Operations', template: '%s · Quantum Parks' },
  description:
    'Authoritative control, operations, and intelligence for the Quantum Parks voice receptionist.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
