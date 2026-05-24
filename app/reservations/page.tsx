'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  RefreshCw,
  Clock,
  Package,
  MapPin,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Boxes,
  Eye,
  LogOut
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatPrice, formatDate } from '@/lib/utils';

interface Reservation {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  status: 'PENDING' | 'CONFIRMED' | 'RELEASED' | 'EXPIRED';
  expiresAt: string;
  confirmedAt: string | null;
  releasedAt: string | null;
  createdAt: string;
  product: {
    id: string;
    name: string;
    sku: string;
    imageUrl: string | null;
    price: string;
  };
  warehouse: {
    id: string;
    name: string;
    location: string;
  };
  metadata?: any;
}

export default function ReservationsListPage() {
  const router = useRouter();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Session details
  const [session, setSession] = useState<{ email: string; role: string; name: string } | null>(null);

  const fetchSession = async () => {
    try {
      const res = await fetch('/api/auth/session');
      const data = await res.json();
      if (data.authenticated) {
        setSession(data.user);
      }
    } catch (err) {
      console.error('[ReservationsListPage] fetchSession error:', err);
    }
  };

  const handleSignOut = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
      router.refresh();
    } catch (err) {
      console.error('[ReservationsListPage] Sign out error:', err);
    }
  };

  const fetchReservations = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch('/api/reservations', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success) {
        setReservations(data.data);
      } else {
        throw new Error(data.message || 'Failed to fetch reservations');
      }
    } catch (err) {
      console.error('[ReservationsListPage] error:', err);
      setError('Failed to load your reservations. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSession();
    fetchReservations();
  }, []);

  const getStatusBadge = (status: Reservation['status']) => {
    switch (status) {
      case 'PENDING':
        return <Badge variant="warning" className="animate-pulse">Active Hold</Badge>;
      case 'CONFIRMED':
        return <Badge variant="success">Confirmed</Badge>;
      case 'RELEASED':
        return <Badge variant="secondary">Cancelled</Badge>;
      case 'EXPIRED':
        return <Badge variant="danger">Expired</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
              <a href="/" className="px-3.5 py-2 rounded-xl text-xs font-semibold text-white/60 hover:text-white hover:bg-white/5 transition-all">
                Catalog
              </a>
              <a href="/reservations" className="px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-violet-500/10 border border-violet-500/20">
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

      {/* Title */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white">My Reservations History</h1>
          <p className="text-sm text-white/40 mt-1">Track temporary locks, view order timelines, and access rescheduled delivery slots.</p>
        </div>
        <button
          onClick={fetchReservations}
          className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-4 p-5 bg-red-500/10 border border-red-500/30 rounded-xl mb-8">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm font-semibold text-red-400">{error}</p>
        </div>
      )}

      {/* Main List Table */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <RefreshCw className="w-8 h-8 animate-spin text-violet-400" />
          <p className="text-white/40 text-sm font-medium">Fetching history ledger...</p>
        </div>
      ) : reservations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center bg-[#111115] border border-white/8 rounded-2xl">
          <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
            <Clock className="w-8 h-8 text-white/20" />
          </div>
          <h2 className="text-lg font-semibold text-white/40 mb-2">No bookings found</h2>
          <p className="text-sm text-white/20 mb-6">You haven&apos;t reserved any products yet.</p>
          <a href="/" className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-xl text-sm transition-colors">
            Start Browsing
          </a>
        </div>
      ) : (
        <div className="bg-[#111115] border border-white/8 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-white/5 text-white/30 font-semibold">
                  <th className="py-3.5 px-4">Hold ID</th>
                  <th className="py-3.5 px-4">Product details</th>
                  <th className="py-3.5 px-4">Warehouse</th>
                  <th className="py-3.5 px-4">Reserved units</th>
                  <th className="py-3.5 px-4">Delivery slot</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {reservations.map((res) => {
                  const totalPrice = parseFloat(res.product.price) * res.quantity;
                  const metadata = (res.metadata as Record<string, any>) ?? {};
                  const isPending = res.status === 'PENDING';
                  const expireMs = new Date(res.expiresAt).getTime() - Date.now();
                  const countdown = isPending && expireMs > 0 ? `${Math.ceil(expireMs / 1000)}s left` : 'Expired';

                  return (
                    <tr key={res.id} className="hover:bg-white/2">
                      <td className="py-4 px-4 font-mono font-bold text-white">
                        #{res.id.slice(-8).toUpperCase()}
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          {res.product.imageUrl ? (
                            <img
                              src={res.product.imageUrl}
                              alt={res.product.name}
                              className="w-8 h-8 object-cover rounded-lg border border-white/10 shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 bg-white/5 rounded-lg flex items-center justify-center border border-white/10 shrink-0">
                              <Package className="w-4 h-4 text-white/30" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <span className="font-bold text-white block truncate max-w-[180px]">{res.product.name}</span>
                            <span className="text-[10px] text-white/30 font-mono">{res.product.sku}</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-white/30 shrink-0" />
                          <div>
                            <p className="font-semibold text-white">{res.warehouse.name}</p>
                            <p className="text-[10px] text-white/40">{res.warehouse.location}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="font-bold text-white">{res.quantity} unit{res.quantity > 1 ? 's' : ''}</div>
                        <div className="text-[10px] text-white/40 font-mono mt-0.5">{formatPrice(totalPrice)}</div>
                      </td>
                      <td className="py-4 px-4 text-white/60">
                        {metadata.deliveryDate ? (
                          <div>
                            <span className="font-semibold text-white/80">{metadata.deliveryDate}</span>
                            <span className="text-[10px] text-violet-400 block mt-0.5 font-mono">{metadata.deliverySlot}</span>
                          </div>
                        ) : (
                          <span className="text-white/20 italic">Not scheduled</span>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex flex-col gap-1 items-start">
                          {getStatusBadge(res.status)}
                          {isPending && (
                            <span className="text-[10px] text-amber-400/80 font-mono">{countdown}</span>
                          )}
                          {res.status === 'CONFIRMED' && metadata.fulfillmentState && (
                            <Badge variant="outline" className="border-violet-500/20 text-violet-400 bg-violet-500/5 text-[9px] py-0 px-1 font-mono">
                              🚢 {metadata.fulfillmentState}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-4 text-right">
                        <button
                          onClick={() => router.push(`/reservations/${res.id}`)}
                          className="h-8 px-3 text-[10px] font-bold border border-violet-500/20 text-violet-400 bg-violet-500/5 hover:bg-violet-500/10 rounded-lg flex items-center gap-1 ml-auto"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          View / Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
