import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Allo Inventory — Multi-Warehouse Reservation System',
    template: '%s | Allo Inventory',
  },
  description:
    'Real-time inventory reservation system for multi-warehouse e-commerce. Reserve products, prevent overselling, and manage stock across distributed fulfilment centres.',
  keywords: ['inventory', 'reservation', 'warehouse', 'e-commerce', 'stock management'],
  authors: [{ name: 'Allo Engineering' }],
  openGraph: {
    type: 'website',
    title: 'Allo Inventory — Multi-Warehouse Reservation System',
    description: 'Concurrency-safe inventory reservation for multi-warehouse e-commerce.',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="noise-bg">
        {/* Background gradient orbs for visual depth */}
        <div className="gradient-orb-purple" style={{ top: '-100px', left: '-100px' }} />
        <div className="gradient-orb-blue" style={{ bottom: '0', right: '-50px' }} />



        {/* Main content */}
        <main className="relative z-10">
          {children}
        </main>

        {/* Footer */}
        <footer className="relative z-10 mt-24 border-t border-white/8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-xs text-white/20">
                Allo Engineering Take-Home — Concurrency-safe inventory reservation system
              </p>
              <p className="text-xs text-white/20">
                Built with Next.js · Prisma · PostgreSQL
              </p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
