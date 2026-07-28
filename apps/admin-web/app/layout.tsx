import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';
import './components.css';

export const metadata: Metadata = {
  title: { default: 'Quantum Parks Operations', template: '%s · Quantum Parks' },
  description:
    'Authoritative control, operations, and intelligence for the Quantum Parks voice receptionist.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <body>
        <Script
          id="quantum-parks-theme"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (() => {
                try {
                  const stored = localStorage.getItem('quantum-parks-theme');
                  const theme =
                    stored === 'dark' || stored === 'light'
                      ? stored
                      : matchMedia('(prefers-color-scheme: dark)').matches
                        ? 'dark'
                        : 'light';
                  document.documentElement.dataset.theme = theme;
                  document.documentElement.style.colorScheme = theme;
                } catch {
                  document.documentElement.dataset.theme = 'light';
                  document.documentElement.style.colorScheme = 'light';
                }
              })();
            `,
          }}
        />
        {children}
      </body>
    </html>
  );
}
