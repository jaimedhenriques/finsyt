import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'Finsyt - AI-Powered Financial Research',
  description:
    'Professional-grade financial research and intelligence platform. Get source-cited answers to complex financial questions.',
  keywords: [
    'financial research',
    'AI finance',
    'SEC filings',
    'market analysis',
    'investment research',
  ],
  authors: [{ name: 'Finsyt' }],
  openGraph: {
    title: 'Finsyt - AI-Powered Financial Research',
    description:
      'Professional-grade financial research and intelligence platform.',
    url: 'https://finsyt.com',
    siteName: 'Finsyt',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Finsyt - AI-Powered Financial Research',
    description:
      'Professional-grade financial research and intelligence platform.',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
