import type { Metadata } from 'next'
import './globals.css'
import '@21st-sdk/react/styles.css'
import { MagicChatBubble } from '@/components/MagicChatBubble'

export const metadata: Metadata = {
  title: 'Finsyt — Financial Intelligence Platform',
  description: 'AI-powered financial intelligence for founders, operators and analysts.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet" />
      </head>
      <body>
        {children}
        <MagicChatBubble />
      </body>
    </html>
  )
}
