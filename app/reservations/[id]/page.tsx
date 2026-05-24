'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Package,
  MapPin,
  Hash,
  ArrowLeft,
  Loader2,
  AlertTriangle,
  Boxes,
  LogOut,
} from 'lucide-react';
import { ReservationCountdown } from '@/components/ReservationCountdown';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { formatPrice, formatDate, generateIdempotencyKey } from '@/lib/utils';

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
    description: string | null;
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

type ActionState = 'idle' | 'confirming' | 'releasing' | 'done';

const STATUS_CONFIG = {
  PENDING: {
    label: 'Pending',
    variant: 'warning' as const,
    description: 'Your reservation is active. Complete payment before the timer runs out.',
  },
  CONFIRMED: {
    label: 'Confirmed',
    variant: 'success' as const,
    description: 'Payment received. Your order is confirmed.',
  },
  RELEASED: {
    label: 'Cancelled',
    variant: 'danger' as const,
    description: 'This reservation was cancelled and stock has been released.',
  },
  EXPIRED: {
    label: 'Expired',
    variant: 'danger' as const,
    description: 'This reservation expired before payment was completed.',
  },
};

export default function ReservationPage() {
  const params = useParams();
  const router = useRouter();
  const reservationId = params.id as string;

  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [actionState, setActionState] = useState<ActionState>('idle');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const [deliveryDate, setDeliveryDate] = useState('');
  const [deliverySlot, setDeliverySlot] = useState('10:00 AM - 1:00 PM');
  const [isSubmittingDelivery, setIsSubmittingDelivery] = useState(false);

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
      console.error('[ReservationPage] fetchSession error:', err);
    }
  };

  const handleSignOut = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
      router.refresh();
    } catch (err) {
      console.error('[ReservationPage] Sign out error:', err);
    }
  };

  const fetchReservation = useCallback(async () => {
    try {
      const res = await fetch(`/api/reservations/${reservationId}`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message ?? `HTTP ${res.status}`);
      }
      const { data } = await res.json();
      setReservation(data);
      setFetchError(null);
    } catch (err) {
      setFetchError(
        err instanceof Error ? err.message : 'Failed to load reservation.',
      );
    } finally {
      setIsLoading(false);
    }
  }, [reservationId]);

  useEffect(() => {
    fetchSession();
    fetchReservation();
  }, [fetchReservation]);

  const handleConfirm = async () => {
    if (!reservation || actionState !== 'idle') return;
    setActionState('confirming');
    setActionError(null);
    setActionSuccess(null);

    const idempotencyKey = generateIdempotencyKey();

    try {
      const res = await fetch(`/api/reservations/${reservationId}/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({ paymentReference: `PAY-${Date.now()}` }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 410) {
          setActionError(
            'Your reservation expired before payment was completed. The held stock has been released.',
          );
          setReservation((prev) =>
            prev ? { ...prev, status: 'EXPIRED' } : prev,
          );
        } else {
          setActionError(data.message ?? 'Failed to confirm. Please try again.');
        }
        return;
      }

      setReservation(data.data);
      setActionSuccess(
        'Payment confirmed! Your order has been placed successfully.',
      );
    } catch {
      setActionError('Network error. Please check your connection.');
    } finally {
      setActionState('done');
    }
  };

  const handleRelease = async () => {
    if (!reservation || actionState !== 'idle') return;
    setActionState('releasing');
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await fetch(`/api/reservations/${reservationId}/release`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'USER_CANCELLED' }),
      });

      const data = await res.json();

      if (!res.ok) {
        setActionError(data.message ?? 'Failed to cancel. Please try again.');
        return;
      }

      setReservation(data.data);
      setActionSuccess('Reservation cancelled. Stock has been released.');
    } catch {
      setActionError('Network error. Please check your connection.');
    } finally {
      setActionState('done');
    }
  };

  const handleExpired = useCallback(() => {
    setReservation((prev) =>
      prev && prev.status === 'PENDING' ? { ...prev, status: 'EXPIRED' } : prev,
    );
    setActionError(
      'Your reservation timer ran out. The held units have been returned to stock.',
    );
  }, []);

  const handleExtend = async () => {
    if (!reservation || actionState !== 'idle') return;
    setActionState('confirming');
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await fetch(`/api/reservations/${reservationId}/extend`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to extend reservation.');
      }
      setReservation(data.data);
      setActionSuccess('Hold successfully extended by 5 minutes!');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Error extending hold.');
    } finally {
      setActionState('idle');
    }
  };

  const handleScheduleDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deliveryDate) return;
    setIsSubmittingDelivery(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await fetch(`/api/reservations/${reservationId}/delivery`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deliveryDate, deliverySlot }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to schedule delivery slot.');
      }
      setReservation(data.data);
      setActionSuccess('Delivery slot scheduled successfully!');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Error scheduling slot.');
    } finally {
      setIsSubmittingDelivery(false);
    }
  };

  // ——— Loading state —————————————————————————————————————————
  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
        <p className="text-white/40 text-sm">Loading reservation...</p>
      </div>
    );
  }

  if (fetchError || !reservation) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 flex flex-col items-center justify-center gap-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center">
          <XCircle className="w-8 h-8 text-red-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white mb-2">Reservation not found</h1>
          <p className="text-white/40 text-sm">{fetchError ?? 'Unknown error'}</p>
        </div>
        <Button variant="outline" onClick={() => router.push('/')}>
          <ArrowLeft className="w-4 h-4" />
          Back to products
        </Button>
      </div>
    );
  }

  const status = STATUS_CONFIG[reservation.status];
  const isPending = reservation.status === 'PENDING';
  const isTerminal =
    reservation.status === 'CONFIRMED' ||
    reservation.status === 'RELEASED' ||
    reservation.status === 'EXPIRED';
  const totalPrice =
    parseFloat(reservation.product.price) * reservation.quantity;

  const formatTimelineTime = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });
    } catch {
      return null;
    }
  };

  const getTimelineEvents = () => {
    if (!reservation) return [];

    const metadata = (reservation.metadata as Record<string, any>) ?? {};
    if (metadata.timeline && Array.isArray(metadata.timeline)) {
      return metadata.timeline.map((evt: any) => ({
        label: evt.event,
        timestamp: formatTimelineTime(evt.timestamp),
        description: evt.description,
        isCompleted: true,
        type: evt.event.toLowerCase().includes('confirm')
          ? ('confirmed' as const)
          : evt.event.toLowerCase().includes('cancel') || evt.event.toLowerCase().includes('expire')
            ? ('expired' as const)
            : ('created' as const),
      }));
    }

    const events: Array<{
      label: string;
      timestamp: string | null;
      description: string;
      isCompleted: boolean;
      type: 'created' | 'confirmed' | 'released' | 'expired' | 'pending';
    }> = [
      {
        label: 'Reservation Created',
        timestamp: formatTimelineTime(reservation.createdAt),
        description: 'Selected stock unit(s) temporarily locked for purchase.',
        isCompleted: true,
        type: 'created' as const,
      },
    ];

    if (reservation.status === 'CONFIRMED') {
      events.push({
        label: 'Payment Confirmed',
        timestamp: reservation.confirmedAt ? formatTimelineTime(reservation.confirmedAt) : null,
        description: 'Payment received. Physical inventory permanently decremented.',
        isCompleted: true,
        type: 'confirmed' as const,
      });
    } else if (reservation.status === 'RELEASED') {
      events.push({
        label: 'Reservation Cancelled',
        timestamp: reservation.releasedAt ? formatTimelineTime(reservation.releasedAt) : null,
        description: 'Hold cancelled early by user. Stock returned to available pool.',
        isCompleted: true,
        type: 'released' as const,
      });
    } else if (reservation.status === 'EXPIRED') {
      events.push({
        label: 'Reservation Expired',
        timestamp: reservation.releasedAt ? formatTimelineTime(reservation.releasedAt) : formatTimelineTime(reservation.expiresAt),
        description: '10-minute hold window expired. Stock returned to available pool.',
        isCompleted: true,
        type: 'expired' as const,
      });
    } else {
      // PENDING
      events.push({
        label: 'Payment Pending',
        timestamp: null,
        description: 'Awaiting checkout confirmation and payment capture.',
        isCompleted: false,
        type: 'pending' as const,
      });
    }

    return events;
  };

  const timelineEvents = getTimelineEvents();

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
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

      {/* Back link */}
      <button
        onClick={() => router.push('/reservations')}
        className="flex items-center gap-2 text-sm text-white/30 hover:text-white/60 transition-colors mb-8 group"
      >
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
        Back to Bookings
      </button>

      {/* Page header */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
            {isPending ? 'Complete Your Purchase' : 'Reservation Details'}
          </h1>
          <div className="flex items-center gap-2">
            <Badge variant={status.variant}>{status.label}</Badge>
            <span className="text-xs text-white/30 font-mono">
              #{reservation.id.slice(-8).toUpperCase()}
            </span>
          </div>
        </div>

        {isPending && (
          <div className="flex flex-col items-end gap-2 shrink-0">
            <ReservationCountdown
              expiresAt={reservation.expiresAt}
              onExpired={handleExpired}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={actionState !== 'idle' || ((reservation.metadata as any)?.extensionCount ?? 0) >= 1}
              onClick={handleExtend}
              className="text-[10px] h-7 px-2.5 border-violet-500/20 text-violet-400 hover:bg-violet-500/10 rounded-lg"
            >
              {((reservation.metadata as any)?.extensionCount ?? 0) >= 1 ? 'Extended once' : '+5m Extension'}
            </Button>
          </div>
        )}
      </div>

      {/* Status description */}
      <div
        className={`flex items-start gap-3 p-4 rounded-xl border mb-6 ${
          reservation.status === 'CONFIRMED'
            ? 'bg-emerald-500/10 border-emerald-500/30'
            : reservation.status === 'PENDING'
              ? 'bg-amber-500/10 border-amber-500/30'
              : 'bg-red-500/10 border-red-500/30'
        }`}
      >
        {reservation.status === 'CONFIRMED' ? (
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
        ) : reservation.status === 'PENDING' ? (
          <Clock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        ) : (
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
        )}
        <p
          className={`text-sm ${
            reservation.status === 'CONFIRMED'
              ? 'text-emerald-400'
              : reservation.status === 'PENDING'
                ? 'text-amber-400'
                : 'text-red-400'
          }`}
        >
          {status.description}
        </p>
      </div>

      {/* Action error banner */}
      {actionError && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30 mb-6 animate-fade-in">
          <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-400">{actionError}</p>
        </div>
      )}

      {/* Action success banner */}
      {actionSuccess && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 mb-6 animate-fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <p className="text-sm text-emerald-400">{actionSuccess}</p>
        </div>
      )}

      {/* Main card */}
      <div className="bg-[#111115] border border-white/8 rounded-2xl overflow-hidden">
        {/* Product section */}
        <div className="p-6">
          <h2 className="text-xs font-semibold text-white/30 uppercase tracking-wider mb-4">
            Reserved Item
          </h2>
          <div className="flex items-start gap-4">
            {reservation.product.imageUrl && (
              <div className="w-20 h-20 rounded-xl overflow-hidden shrink-0 bg-white/5">
                <img
                  src={reservation.product.imageUrl}
                  alt={reservation.product.name}
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-white text-lg leading-snug">
                    {reservation.product.name}
                  </h3>
                  <p className="text-xs font-mono text-white/30 mt-0.5">
                    {reservation.product.sku}
                  </p>
                </div>
              </div>
              {reservation.product.description && (
                <p className="text-xs text-white/40 mt-2 leading-relaxed line-clamp-2">
                  {reservation.product.description}
                </p>
              )}
            </div>
          </div>
        </div>

        <Separator />

        {/* Reservation details grid */}
        <div className="p-6">
          <h2 className="text-xs font-semibold text-white/30 uppercase tracking-wider mb-4">
            Reservation Details
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-white/30">
                <Package className="w-3.5 h-3.5" />
                <span className="text-[10px] uppercase tracking-wider font-semibold">Quantity</span>
              </div>
              <p className="text-lg font-bold text-white">
                {reservation.quantity} unit{reservation.quantity > 1 ? 's' : ''}
              </p>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-white/30">
                <MapPin className="w-3.5 h-3.5" />
                <span className="text-[10px] uppercase tracking-wider font-semibold">Warehouse</span>
              </div>
              <p className="text-base font-semibold text-white">{reservation.warehouse.name}</p>
              <p className="text-xs text-white/40">{reservation.warehouse.location}</p>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-white/30">
                <Hash className="w-3.5 h-3.5" />
                <span className="text-[10px] uppercase tracking-wider font-semibold">Reserved at</span>
              </div>
              <p className="text-sm text-white/70">
                {formatDate(reservation.createdAt)}
              </p>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-white/30">
                <Clock className="w-3.5 h-3.5" />
                <span className="text-[10px] uppercase tracking-wider font-semibold">
                  {reservation.status === 'CONFIRMED' ? 'Confirmed at' : 'Expires at'}
                </span>
              </div>
              <p className="text-sm text-white/70">
                {reservation.confirmedAt
                  ? formatDate(reservation.confirmedAt)
                  : formatDate(reservation.expiresAt)}
              </p>
            </div>
          </div>
        </div>

        <Separator />

        {/* Delivery Slot Scheduling */}
        <div className="p-6">
          <h2 className="text-xs font-semibold text-white/30 uppercase tracking-wider mb-4">
            Delivery Schedule Slot
          </h2>
          {reservation.status === 'RELEASED' || reservation.status === 'EXPIRED' ? (
            <p className="text-xs text-white/20 italic">Delivery scheduling is only available for active or confirmed reservations.</p>
          ) : (
            <div className="space-y-4">
              {((reservation.metadata as any)?.deliveryDate) && (
                <div className="bg-white/3 border border-white/5 p-3 rounded-xl flex items-center justify-between text-xs text-white/80">
                  <div>
                    <span className="text-white/40 block text-[9px] uppercase font-bold tracking-wide">Scheduled Delivery:</span>
                    <span className="font-bold">{(reservation.metadata as any).deliveryDate}</span> at <span className="font-mono text-violet-400">{(reservation.metadata as any).deliverySlot}</span>
                  </div>
                  <Badge variant="success">Scheduled</Badge>
                </div>
              )}

              <form onSubmit={handleScheduleDelivery} className="flex flex-col sm:flex-row items-end gap-3 bg-white/2 border border-white/5 p-4 rounded-xl">
                <div className="flex-1 w-full space-y-1">
                  <label className="text-[9px] font-bold text-white/40 uppercase tracking-wide">Choose Delivery Date</label>
                  <input
                    type="date"
                    required
                    min={new Date().toISOString().split('T')[0]}
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    className="w-full bg-[#111115] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500"
                  />
                </div>
                <div className="flex-1 w-full space-y-1">
                  <label className="text-[9px] font-bold text-white/40 uppercase tracking-wide">Delivery Slot</label>
                  <select
                    value={deliverySlot}
                    onChange={(e) => setDeliverySlot(e.target.value)}
                    className="w-full bg-[#111115] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500"
                  >
                    <option value="10:00 AM - 1:00 PM">10:00 AM - 1:00 PM (Morning)</option>
                    <option value="1:00 PM - 4:00 PM">1:00 PM - 4:00 PM (Afternoon)</option>
                    <option value="4:00 PM - 7:00 PM">4:00 PM - 7:00 PM (Evening)</option>
                  </select>
                </div>
                <Button
                  type="submit"
                  disabled={isSubmittingDelivery}
                  className="w-full sm:w-auto h-8 px-4 text-[10px] bg-violet-600 hover:bg-violet-700 text-white rounded-lg"
                >
                  {isSubmittingDelivery ? 'Scheduling...' : 'Set Slot'}
                </Button>
              </form>
            </div>
          )}
        </div>

        <Separator />

        {/* Price summary */}
        <div className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-white/30 uppercase tracking-wider font-semibold mb-1">
                Order Total
              </p>
              <p className="text-sm text-white/40">
                {reservation.quantity} &times; {formatPrice(reservation.product.price)}
              </p>
            </div>
            <p className="text-3xl font-extrabold text-white">
              {formatPrice(totalPrice)}
            </p>
          </div>
        </div>

        {/* Action buttons — only shown for PENDING reservations */}
        {isPending && actionState !== 'done' && (
          <>
            <Separator />
            <div className="p-6 flex flex-col sm:flex-row gap-3">
              <Button
                id="confirm-purchase-btn"
                onClick={handleConfirm}
                disabled={actionState !== 'idle'}
                className="flex-1 h-12 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold text-base rounded-xl shadow-lg shadow-emerald-500/20 transition-all duration-200"
              >
                {actionState === 'confirming' ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5" />
                    Confirm Purchase
                  </>
                )}
              </Button>

              <Button
                id="cancel-reservation-btn"
                onClick={handleRelease}
                disabled={actionState !== 'idle'}
                variant="outline"
                className="flex-1 h-12 border-white/10 text-white/60 hover:bg-white/5 hover:text-white rounded-xl font-semibold transition-all duration-200"
              >
                {actionState === 'releasing' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Cancelling...
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4" />
                    Cancel Reservation
                  </>
                )}
              </Button>
            </div>
          </>
        )}

        {/* Post-action navigation */}
        {(isTerminal && actionState === 'done') && (
          <>
            <Separator />
            <div className="p-6">
              <Button
                variant="outline"
                onClick={() => router.push('/')}
                className="w-full border-white/10 text-white/60 hover:bg-white/5 hover:text-white rounded-xl"
              >
                <ArrowLeft className="w-4 h-4" />
                Browse more products
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Activity Timeline */}
      <div className="mt-8 bg-[#111115] border border-white/8 rounded-2xl p-6">
        <h2 className="text-xs font-semibold text-white/30 uppercase tracking-wider mb-6">
          Reservation Activity Timeline
        </h2>
        <div className="relative border-l border-white/10 pl-6 ml-3 space-y-6">
          {timelineEvents.map((event, index) => (
            <div key={index} className="relative">
              {/* Dot */}
              <span className={`absolute -left-[33px] top-1.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border bg-[#0b0b0e] ${
                event.isCompleted 
                  ? event.type === 'confirmed' 
                    ? 'border-emerald-500 text-emerald-400' 
                    : event.type === 'released' || event.type === 'expired'
                      ? 'border-red-500 text-red-400'
                      : 'border-violet-500 text-violet-400'
                  : 'border-white/10 text-white/20'
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full ${
                  event.isCompleted 
                    ? event.type === 'confirmed' 
                      ? 'bg-emerald-400' 
                      : event.type === 'released' || event.type === 'expired'
                        ? 'bg-red-400'
                        : 'bg-violet-400'
                    : 'bg-white/10'
                }`} />
              </span>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className={`text-sm font-bold ${event.isCompleted ? 'text-white' : 'text-white/30'}`}>
                    {event.label}
                  </h3>
                  <p className="text-xs text-white/40 mt-0.5 leading-relaxed">{event.description}</p>
                </div>
                {event.timestamp && (
                  <span className="text-xs font-mono text-violet-400 bg-violet-500/10 rounded px-1.5 py-0.5 mt-1 sm:mt-0 self-start sm:self-center">
                    [{event.timestamp}]
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Reservation ID for reference */}
      <p className="text-center text-xs text-white/20 mt-6 font-mono">
        Reservation ID: {reservation.id}
      </p>
    </div>
  );
}
