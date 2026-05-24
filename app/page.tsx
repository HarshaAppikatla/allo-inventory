'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Package, AlertCircle, Boxes, LogOut } from 'lucide-react';
import { ProductCard } from '@/components/ProductCard';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

interface StockEntry {
  warehouseId: string;
  warehouseName: string;
  warehouseLocation: string;
  totalQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
}

interface Product {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  imageUrl: string | null;
  price: string;
  stocks: StockEntry[];
}

function ProductCardSkeleton() {
  return (
    <div className="bg-[#111115] border border-white/8 rounded-2xl overflow-hidden">
      <Skeleton className="h-52 w-full rounded-none" />
      <div className="p-5 space-y-4">
        <div className="flex justify-between gap-3">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-5 w-16" />
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <div className="space-y-2">
          <Skeleton className="h-9 w-full rounded-lg" />
          <Skeleton className="h-9 w-full rounded-lg" />
        </div>
        <Skeleton className="h-10 w-full rounded-xl" />
      </div>
    </div>
  );
}

export default function HomePage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  
  // Session details
  const [session, setSession] = useState<{ email: string; role: string; name: string } | null>(null);

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/session');
      const data = await res.json();
      if (data.authenticated) {
        setSession(data.user);
      }
    } catch (err) {
      console.error('[HomePage] fetchSession error:', err);
    }
  }, []);

  const fetchProducts = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch('/api/products', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { data } = await res.json();
      setProducts(data);
      setLastRefreshed(new Date());
    } catch (err) {
      setError('Failed to load products. Please try again.');
      console.error('[HomePage] fetchProducts error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleSignOut = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
      router.refresh();
    } catch (err) {
      console.error('[HomePage] Sign out error:', err);
    }
  };

  useEffect(() => {
    fetchSession();
    fetchProducts();
    // Auto-refresh every 30 seconds to keep stock levels accurate
    const interval = setInterval(fetchProducts, 30_000);
    return () => clearInterval(interval);
  }, [fetchProducts, fetchSession]);

  const totalAvailableProducts = products.filter((p) =>
    p.stocks.some((s) => s.availableQuantity > 0),
  ).length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
      {/* Navigation Header */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6 mb-12">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-violet-600 flex items-center justify-center">
            <Boxes className="w-4 h-4 text-white" />
          </div>
          <span className="font-extrabold text-white text-lg tracking-tight">Allo Inventory</span>
        </div>
        <nav className="flex flex-wrap items-center gap-1.5">
          {(!session || session.role === 'USER' || session.role === 'ADMIN') && (
            <>
              <a href="/" className="px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-violet-500/10 border border-violet-500/20">
                Catalog
              </a>
              <a href="/reservations" className="px-3.5 py-2 rounded-xl text-xs font-semibold text-white/60 hover:text-white hover:bg-white/5 transition-all">
                My Reservations
              </a>
            </>
          )}
          {session && (session.role === 'SERVICE_PROVIDER' || session.role === 'ADMIN') && (
            <>
              {session.role === 'SERVICE_PROVIDER' && (
                <a href="/" className="px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-white/5 border border-white/10">
                  Storefront (Read-only)
                </a>
              )}
              <a href="/operations" className="px-3.5 py-2 rounded-xl text-xs font-semibold text-white/60 hover:text-white hover:bg-white/5 transition-all">
                Operations Portal
              </a>
            </>
          )}
          {session && session.role === 'ADMIN' && (
            <a href="/admin" className="px-3.5 py-2 rounded-xl text-xs font-semibold text-white/60 hover:text-white hover:bg-white/5 transition-all">
              Admin Dashboard
            </a>
          )}
          {session && (
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1 px-3.5 py-2 rounded-xl text-xs font-semibold text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-all border border-transparent hover:border-red-500/20"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          )}
        </nav>
      </header>

      {/* Read-Only Warning Banner for Operations Role */}
      {session?.role === 'SERVICE_PROVIDER' && (
        <div className="flex items-start gap-4 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl mb-8 animate-fade-in">
          <AlertCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-bold text-white">Operations Operator Mode</h3>
            <p className="text-xs text-white/60 mt-1">
              You are currently viewing the storefront in <strong>Read-only Catalog Mode</strong>. You can inspect stock configurations across warehouses, but reservation capability is restricted to Customer accounts. Proceed to your <a href="/operations" className="text-emerald-400 hover:underline font-semibold">Operations Portal</a> to process pending orders or relocate stock.
            </p>
          </div>
        </div>
      )}

      {/* Hero section */}
      <div className="mb-12">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-6 h-6 rounded-md bg-violet-500/20 flex items-center justify-center">
            <Boxes className="w-3.5 h-3.5 text-violet-400" />
          </div>
          <span className="text-xs font-semibold text-violet-400 uppercase tracking-widest">
            Multi-Warehouse Inventory
          </span>
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold text-white mb-4 leading-tight">
          Reserve before it&apos;s gone
        </h1>
        <p className="text-lg text-white/40 max-w-2xl leading-relaxed">
          Browse live stock across all warehouses. Reserve your units at checkout &mdash; held
          for 10 minutes while you complete payment.
        </p>

        {/* Stats bar */}
        {!isLoading && !error && (
          <div className="flex flex-wrap items-center gap-6 mt-8">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-sm text-white/50">
                <span className="font-bold text-white">{products.length}</span> products
              </span>
            </div>
            <div className="w-px h-4 bg-white/10" />
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-violet-400" />
              <span className="text-sm text-white/50">
                <span className="font-bold text-white">{totalAvailableProducts}</span> in stock
              </span>
            </div>
            <div className="w-px h-4 bg-white/10" />
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-400" />
              <span className="text-sm text-white/50">
                3 warehouses
              </span>
            </div>
            <div className="w-px h-4 bg-white/10" />
            <button
              onClick={fetchProducts}
              className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              Last updated {lastRefreshed.toLocaleTimeString()}
            </button>
          </div>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-start gap-4 p-5 bg-red-500/10 border border-red-500/30 rounded-xl mb-8 animate-fade-in">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-400">{error}</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={fetchProducts}
            className="border-red-500/30 text-red-400 hover:bg-red-500/10"
          >
            Retry
          </Button>
        </div>
      )}

      {/* Product grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
            <Package className="w-8 h-8 text-white/20" />
          </div>
          <h2 className="text-lg font-semibold text-white/40 mb-2">No products found</h2>
          <p className="text-sm text-white/20 mb-6">
            The database may not be seeded yet.
          </p>
          <Button variant="outline" onClick={fetchProducts}>
            Refresh
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.map((product) => (
            <ProductCard 
              key={product.id} 
              product={product} 
              isReadOnly={session?.role === 'SERVICE_PROVIDER'}
            />
          ))}
        </div>
      )}
    </div>
  );
}
