import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from 'react-hot-toast';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXTAUTH_URL || 'http://localhost:3000'),
  title: 'CPG Review Analyzer',
  description: 'Scrape, analyze, and compare CPG product reviews across retailers',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
  },
  openGraph: {
    images: ['/og-image.png'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script src="https://apps.abacus.ai/chatllm/appllm-lib.js" />
      </head>
      <body className="bg-gray-50 text-gray-900 antialiased">
        <Toaster position="top-right" />
        {children}
      </body>
    </html>
  );
}
