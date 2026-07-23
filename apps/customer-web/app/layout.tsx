import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Quantum Parks · Continue securely',
  description: 'Secure digital journeys from the Quantum Parks receptionist.',
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
