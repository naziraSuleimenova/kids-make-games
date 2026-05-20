import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import BricksLogo from '@/components/BricksLogo';

export const metadata: Metadata = {
  title: 'Kids Make Games — AI Game Maker for Kids',
  description: 'Type any game idea and play it in seconds. No code needed!',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#f5f5f7]">
        <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-black/[0.06]">
          <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
              <BricksLogo className="w-9 h-7" />
              <span className="font-extrabold text-[17px] tracking-tight text-[#1d1d1f]">
                Kids Make Games
              </span>
            </Link>

            <nav className="flex items-center gap-2">
              <Link
                href="/games"
                className="text-sm font-semibold text-[#6e6e73] hover:text-[#1d1d1f] px-3 py-2 rounded-xl hover:bg-black/[0.04] transition-all"
              >
                Gallery
              </Link>
              <Link
                href="/create"
                className="text-sm font-bold text-white px-5 py-2 rounded-xl bg-[#FF6B00] hover:bg-[#e55a00] active:scale-95 transition-all"
              >
                Create ✦
              </Link>
            </nav>
          </div>
        </header>

        <main>{children}</main>

        <footer className="mt-24 py-8 border-t border-black/[0.06] text-center text-[#aeaeb2] text-sm">
          Kids Make Games
        </footer>
      </body>
    </html>
  );
}
