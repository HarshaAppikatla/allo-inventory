'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Package, MapPin, Minus, Plus, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatPrice, generateIdempotencyKey } from '@/lib/utils';

interface StockEntry {
  warehouseId: string;
  warehouseName: string;
  warehouseLocation: string;
  availableQuantity: number;
  totalQuantity: number;
}

interface Product {
  id: string;
  name: string;
  sku: string;
  price: string;
  stocks: StockEntry[];
}

interface ReserveModalProps {
  product: Product;
  onClose: () => void;
}

export function ReserveModal({ product, onClose }: ReserveModalProps) {
  const router = useRouter();
  const availableStocks = product.stocks.filter((s) => s.availableQuantity > 0);
  const [selectedWarehouse, setSelectedWarehouse] = useState<StockEntry | null>(
    availableStocks[0] ?? null,
  );
  const [quantity, setQuantity] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const maxQty = selectedWarehouse
    ? Math.min(selectedWarehouse.availableQuantity, 10)
    : 1;

  const handleReserve = async () => {
    if (!selectedWarehouse) return;
    setIsLoading(true);
    setError(null);

    const idempotencyKey = generateIdempotencyKey();

    try {
      const res = await fetch('/api/reservations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          productId: product.id,
          warehouseId: selectedWarehouse.warehouseId,
          quantity,
          metadata: { source: 'web_checkout' },
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          setError(
            `Not enough stock available. Only ${
              selectedWarehouse.availableQuantity
            } unit(s) left at this warehouse.`,
          );
        } else {
          setError(data.message ?? 'Failed to create reservation. Please try again.');
        }
        return;
      }

      // Success — navigate to the checkout page
      router.push(`/reservations/${data.data.id}`);
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal panel */}
      <div className="relative w-full max-w-md bg-[#141418] border border-white/10 rounded-2xl shadow-2xl animate-slide-up overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center">
              <Package className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <h2 className="font-bold text-white text-lg leading-tight">{product.name}</h2>
              <p className="text-xs text-white/40 font-mono mt-0.5">{product.sku}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/30 hover:text-white/70 transition-colors p-1 -mr-1 -mt-1 rounded-lg hover:bg-white/5"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Warehouse selector */}
          <div>
            <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">
              Ship from warehouse
            </label>
            {availableStocks.length === 0 ? (
              <p className="text-sm text-red-400">No stock available at any warehouse.</p>
            ) : (
              <div className="space-y-2">
                {availableStocks.map((stock) => (
                  <button
                    key={stock.warehouseId}
                    onClick={() => {
                      setSelectedWarehouse(stock);
                      setQuantity(1);
                      setError(null);
                    }}
                    className={`w-full flex items-center justify-between p-3.5 rounded-xl border transition-all duration-200 text-left ${
                      selectedWarehouse?.warehouseId === stock.warehouseId
                        ? 'border-violet-500/60 bg-violet-500/10 ring-1 ring-violet-500/30'
                        : 'border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <MapPin className="w-4 h-4 text-white/40 shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-white">{stock.warehouseName}</p>
                        <p className="text-xs text-white/40">{stock.warehouseLocation}</p>
                      </div>
                    </div>
                    <span
                      className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                        stock.availableQuantity <= 3
                          ? 'bg-amber-500/20 text-amber-400'
                          : 'bg-emerald-500/20 text-emerald-400'
                      }`}
                    >
                      {stock.availableQuantity} left
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quantity selector */}
          {selectedWarehouse && (
            <div>
              <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">
                Quantity
              </label>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={quantity <= 1}
                  className="w-10 h-10 rounded-xl border border-white/10 flex items-center justify-center text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <div className="flex-1 text-center">
                  <span className="text-3xl font-bold text-white tabular-nums">{quantity}</span>
                  <p className="text-xs text-white/30 mt-0.5">unit{quantity > 1 ? 's' : ''}</p>
                </div>
                <button
                  onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
                  disabled={quantity >= maxQty}
                  className="w-10 h-10 rounded-xl border border-white/10 flex items-center justify-center text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Error banner */}
          {error && (
            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-red-500/10 border border-red-500/30">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Summary + CTA */}
          {selectedWarehouse && (
            <div className="pt-2 border-t border-white/10 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/50">Total to reserve</span>
                <span className="text-xl font-bold text-white">
                  {formatPrice(parseFloat(product.price) * quantity)}
                </span>
              </div>
              <p className="text-xs text-white/30 -mt-1">
                ⌚ Held for 10 minutes. Payment confirms the reservation.
              </p>
              <Button
                id="confirm-reserve-btn"
                onClick={handleReserve}
                disabled={isLoading || availableStocks.length === 0}
                className="w-full h-12 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-bold text-base rounded-xl shadow-lg shadow-violet-500/20 transition-all duration-200"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Creating reservation...
                  </>
                ) : (
                  `Reserve ${quantity} unit${quantity > 1 ? 's' : ''}`
                )}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
