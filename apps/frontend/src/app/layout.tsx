import type { Metadata } from 'next';
import { Inter, IBM_Plex_Mono } from 'next/font/google';
import type { ReactNode } from 'react';

import './globals.css';

const inter = Inter({
  display: 'swap',
  subsets: ['latin'],
  variable: '--font-sans',
});

const plexMono = IBM_Plex_Mono({
  weight: ['400', '500'],
  preload: false,
  display: 'swap',
  subsets: ['latin'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  description: 'Plataforma de inteligência e gestão de consórcios',
  title: {
    default: 'Larcarvalho Intelligence',
    template: '%s | Larcarvalho Intelligence',
  },
};

interface RootLayoutProps {
  readonly children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html className={`${inter.variable} ${plexMono.variable}`} lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
