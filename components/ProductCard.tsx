'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ShoppingCart, MapPin, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StockBadge } from '@/components/StockBadge';
import { ReserveModal } from '@/components/ReserveModal';
import { formatPrice } from '@/lib/utils';

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
  isHot?: boolean;
  stocks: StockEntry[];
}

interface ProductCardProps {
  product: Product;
  isReadOnly?: boolean;
}

export function ProductCard({ product, isReadOnly = false }: ProductCardProps) {
  const [showModal, setShowModal] = useState(false);
  const [showAllWarehouses, setShowAllWarehouses] = useState(false);

  const totalAvailable = product.stocks.reduce(
    (sum, s) => sum + s.availableQuantity,
    0,
  );
  const isOutOfStock = totalAvailable === 0;
  const displayedStocks = showAllWarehouses ? product.stocks : product.stocks.slice(0, 2);

  return (
    <>
      <div className="group relative flex flex-col bg-[#111115] border border-white/8 rounded-2xl overflow-hidden hover:border-white/20 transition-all duration-300 hover:shadow-2xl hover:shadow-violet-500/5 hover:-translate-y-0.5 animate-fade-in">
        {/* Product image */}
        <div className="relative h-52 bg-gradient-to-br from-white/5 to-white/[0.02] overflow-hidden">
          {product.imageUrl ? (
            <Image
              src={product.imageUrl}
              alt={product.name}
              fill
              className="object-cover transition-transform duration-500 group-hover:scale-105"
              sizes="(max-width: 768px) 100vw, 33vw"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ShoppingCart className="w-12 h-12 text-white/10" />
            </div>
          )}
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#111115] via-transparent to-transparent opacity-80" />
          {/* SKU chip */}
          <div className="absolute top-3 left-3 flex items-center gap-1.5">
            <span className="text-[10px] font-mono text-white/40 bg-black/50 backdrop-blur-sm px-2 py-1 rounded-md border border-white/10">
              {product.sku}
            </span>
            {product.isHot && (
              <span className="text-[10px] font-bold text-red-400 bg-red-500/20 backdrop-blur-sm px-2.5 py-1 rounded-md border border-red-500/30 animate-pulse">
                🔥 Hot SKU
              </span>
            )}
          </div>
          {/* Out of stock overlay */}
          {isOutOfStock && (
            <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px] flex items-center justify-center">
              <span className="text-sm font-bold text-white/60 bg-black/60 px-4 py-2 rounded-full border border-white/10">
                Out of Stock
              </span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex flex-col flex-1 p-5">
          {/* Title + price */}
          <div className="flex items-start justify-between gap-3 mb-2">
            <h2 className="text-base font-bold text-white leading-snug flex-1">
              {product.name}
            </h2>
            <p className="text-lg font-bold text-white shrink-0">
              {formatPrice(product.price)}
            </p>
          </div>

          {/* Description */}
          {product.description && (
            <p className="text-xs text-white/40 leading-relaxed line-clamp-2 mb-4">
              {product.description}
            </p>
          )}

          {/* Warehouse stock list */}
          <div className="space-y-2 mb-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30">
              Stock by warehouse
            </p>
            {displayedStocks.map((stock) => (
              <div
                key={stock.warehouseId}
                className="flex items-center justify-between py-2 px-3 rounded-lg bg-white/[0.03] border border-white/5"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <MapPin className="w-3 h-3 text-white/30 shrink-0" />
                  <span className="text-xs text-white/60 truncate">
                    {stock.warehouseName}
                  </span>
                </div>
                <StockBadge
                  available={stock.availableQuantity}
                  total={stock.totalQuantity}
                />
              </div>
            ))}
            {product.stocks.length > 2 && (
              <button
                onClick={() => setShowAllWarehouses((v) => !v)}
                className="w-full flex items-center justify-center gap-1 text-xs text-white/30 hover:text-white/50 py-1 transition-colors"
              >
                {showAllWarehouses ? (
                  <><ChevronUp className="w-3 h-3" /> Show less</>
                ) : (
                  <><ChevronDown className="w-3 h-3" /> {product.stocks.length - 2} more warehouse{product.stocks.length - 2 !== 1 ? 's' : ''}</>
                )}
              </button>
            )}
          </div>

          {/* CTA */}
          <div className="mt-auto pt-3 border-t border-white/8">
            <Button
              id={`reserve-btn-${product.id}`}
              onClick={() => {
                if (!isReadOnly) setShowModal(true);
              }}
              disabled={isOutOfStock || isReadOnly}
              className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-semibold rounded-xl shadow-lg shadow-violet-500/10 disabled:from-white/10 disabled:to-white/10 disabled:text-white/20 disabled:shadow-none transition-all duration-200"
            >
              <ShoppingCart className="w-4 h-4" />
              {isReadOnly ? 'Read-only Access' : isOutOfStock ? 'Out of Stock' : 'Reserve Now'}
            </Button>
          </div>
        </div>
      </div>

      {/* Reserve modal */}
      {showModal && !isReadOnly && (
        <ReserveModal
          product={product}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
