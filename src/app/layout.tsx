import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import { QueryProvider } from '@/components/query-provider';
import { SessionProvider } from '@/components/auth/session-provider';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'Finsyt - AI-Powered Financial Research',
  description: 'Intelligent financial research and analytics platform powered by AI. Get instant insights on stocks, markets, and financial data.',
  keywords: ['finance', 'AI', 'research', 'analytics', 'stocks', 'market data'],
  authors: [{ name: 'Finsyt Team' }],
  openGraph: {
    title: 'Finsyt - AI-Powered Financial Research',
    description: 'Intelligent financial research and analytics platform powered by AI.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
        <SessionProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem
            disableTransitionOnChange
          >
            <QueryProvider>
              {children}
              <Toaster position="bottom-right" />
            </QueryProvider>
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
