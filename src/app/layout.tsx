import type { Metadata } from 'next';
import { Bricolage_Grotesque, Instrument_Sans } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';

const sans = Instrument_Sans({ subsets: ['latin'], variable: '--font-sans' });
const display = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-display' });

export const metadata: Metadata = {
  title: 'Opportunity Oasis',
  description: 'Jobs, internships, graduate positions and contests, ordered by deadline.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={cn('min-h-screen bg-background font-sans text-foreground antialiased', sans.variable, display.variable)}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
