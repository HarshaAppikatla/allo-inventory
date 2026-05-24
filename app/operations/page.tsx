'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  RefreshCw,
  Warehouse,
  Boxes,
  Truck,
  Plus,
  AlertTriangle,
  ArrowLeftRight,
  Package,
  User,
  Info,
  CheckCircle2,
  AlertOctagon,
  FileText,
  LogOut
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { formatDate } from '@/lib/utils';

// Interfaces
interface StockEntry {
  productId: string;
  productName: string;
  productSku: string;
  totalQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
}

interface WarehouseStats {
  id: string;
  name: string;
  location: string;
  totalQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  utilization: number;
  stocks: StockEntry[];
}

interface Reservation {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  status: 'PENDING' | 'CONFIRMED' | 'RELEASED' | 'EXPIRED';
  expiresAt: string;
  confirmedAt: string | null;
  createdAt: string;
  metadata: {
    deliveryDate?: string;
    deliverySlot?: string;
    fulfillmentState?: 'PACKED' | 'DISPATCHED' | 'DELIVERED';
  } | null;
  product: {
    name: string;
    sku: string;
  };
  warehouse: {
    name: string;
  };
}

interface ProductAdmin {
  id: string;
  name: string;
  sku: string;
  isActive: boolean;
  archivedAt: string | null;
  inventoryStocks: Array<{
    id: string;
    warehouseId: string;
  }>;
}

interface AdminStats {
  warehouses: WarehouseStats[];
  recentReservations: Reservation[];
  products: ProductAdmin[];
  healthAlerts: Array<{
    id: string;
    message: string;
    severity: string;
  }>;
}

export default function OperationsPortal() {
  const router = useRouter();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Session details
  const [session, setSession] = useState<{ email: string; role: string; name: string } | null>(null);

  // Active section Tab
  const [activeSubTab, setActiveSubTab] = useState<'fulfillment' | 'inventory' | 'transfers'>('fulfillment');

  // Modals & Form States
  const [showAdjustStock, setShowAdjustStock] = useState<{ stockId: string; productName: string; warehouseName: string; currentQty: number } | null>(null);
  const [stockAdjustment, setStockAdjustment] = useState({ quantityChange: '', action: 'RESTOCK' as 'RESTOCK' | 'DAMAGE' | 'CORRECTION', reason: '', adminName: 'OpsTeam' });
  const [isAdjustingStock, setIsAdjustingStock] = useState(false);

  const [stockTransfer, setStockTransfer] = useState({ productId: '', sourceWarehouseId: '', destinationWarehouseId: '', quantity: '', reason: '', adminName: 'OpsTeam' });
  const [isTransferringStock, setIsTransferringStock] = useState(false);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/session');
      const data = await res.json();
      if (data.authenticated) {
        setSession(data.user);
      }
    } catch (err) {
      console.error('[OperationsPortal] fetchSession error:', err);
    }
  }, []);

  const fetchStats = useCallback(async (silent = false) => {
    if (!silent) setIsRefreshing(true);
    try {
      const res = await fetch('/api/admin/stats', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success) {
        setStats(data.stats);
      } else {
        throw new Error(data.error || 'Failed to fetch operations stats');
      }
    } catch (err) {
      console.error('[OperationsPortal] error:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  const handleSignOut = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/operations/login');
      router.refresh();
    } catch (err) {
      console.error('[OperationsPortal] Sign out error:', err);
    }
  };

  useEffect(() => {
    fetchSession();
    fetchStats();
  }, [fetchStats, fetchSession]);

  // Fulfillment State changes
  const handleUpdateFulfillment = async (resId: string, state: 'PACKED' | 'DISPATCHED' | 'DELIVERED') => {
    setActioningId(resId);
    try {
      const res = await fetch(`/api/operations/reservations/${resId}/fulfillment`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state }),
      });
      const data = await res.json();
      if (data.success) {
        showNotification('success', `Order advanced to: ${state.toLowerCase()}.`);
        fetchStats(true);
      } else {
        throw new Error(data.error || 'Failed to update order fulfillment.');
      }
    } catch (err) {
      showNotification('error', err instanceof Error ? err.message : 'Error changing shipment status.');
    } finally {
      setActioningId(null);
    }
  };

  // Stock adjustments
  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showAdjustStock || !stockAdjustment.quantityChange) return;

    const change = parseInt(stockAdjustment.quantityChange);
    if (isNaN(change)) {
      showNotification('error', 'Please enter a valid numeric value.');
      return;
    }

    setIsAdjustingStock(true);
    try {
      const finalChange = stockAdjustment.action === 'DAMAGE' ? -Math.abs(change) : change;
      const res = await fetch(`/api/admin/inventory/${showAdjustStock.stockId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quantityChange: finalChange,
          action: stockAdjustment.action,
          reason: stockAdjustment.reason || undefined,
          adminName: stockAdjustment.adminName || undefined,
        }),
      });

      const data = await res.json();
      if (data.success) {
        showNotification('success', data.message || 'Inventory updated.');
        setShowAdjustStock(null);
        setStockAdjustment({ quantityChange: '', action: 'RESTOCK', reason: '', adminName: 'OpsTeam' });
        fetchStats(true);
      } else {
        throw new Error(data.error || 'Failed to adjust inventory stock.');
      }
    } catch (err) {
      showNotification('error', err instanceof Error ? err.message : 'Error adjusting stock.');
    } finally {
      setIsAdjustingStock(false);
    }
  };

  // Stock relocations
  const handleTransferStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stockTransfer.productId || !stockTransfer.sourceWarehouseId || !stockTransfer.destinationWarehouseId || !stockTransfer.quantity) {
      showNotification('error', 'Ensure all transfer fields are selected.');
      return;
    }

    const qty = parseInt(stockTransfer.quantity);
    if (isNaN(qty) || qty <= 0) {
      showNotification('error', 'Quantity must be a positive integer.');
      return;
    }

    setIsTransferringStock(true);
    try {
      const res = await fetch('/api/admin/inventory/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: stockTransfer.productId,
          sourceWarehouseId: stockTransfer.sourceWarehouseId,
          destinationWarehouseId: stockTransfer.destinationWarehouseId,
          quantity: qty,
          reason: stockTransfer.reason || undefined,
          adminName: stockTransfer.adminName || undefined,
        }),
      });

      const data = await res.json();
      if (data.success) {
        showNotification('success', data.message || 'Relocation processed successfully.');
        setStockTransfer({ productId: '', sourceWarehouseId: '', destinationWarehouseId: '', quantity: '', reason: '', adminName: 'OpsTeam' });
        fetchStats(true);
      } else {
        throw new Error(data.error || 'Failed to relocate stock.');
      }
    } catch (err) {
      showNotification('error', err instanceof Error ? err.message : 'Error executing transfer request.');
    } finally {
      setIsTransferringStock(false);
    }
  };

  const getContentionColorClass = (ratio: number) => {
    if (ratio > 0.8) return 'text-red-400 bg-red-500/10 border-red-500/20';
    if (ratio > 0.4) return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
    return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
  };

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 flex flex-col items-center justify-center gap-4">
        <RefreshCw className="w-10 h-10 animate-spin text-violet-400" />
        <p className="text-white/40 text-sm font-medium">Booting provider telemetry systems...</p>
      </div>
    );
  }

  // Filter confirmed orders that require shipping workflows
  const confirmedReservations = stats?.recentReservations.filter(r => r.status === 'CONFIRMED') ?? [];

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
          <a href="/" className="px-3.5 py-2 rounded-xl text-xs font-semibold text-white/60 hover:text-white hover:bg-white/5 transition-all">
            Storefront Catalog (Read-only)
          </a>
          <a href="/operations" className="px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-violet-500/10 border border-violet-500/20">
            Operations Portal
          </a>
          {session?.role === 'ADMIN' && (
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

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
              <Truck className="w-4 h-4 text-violet-400" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white">Operations & Fulfillment</h1>
          </div>
          <p className="text-sm text-white/40 mt-1">Manage physical inventory stocks, pack incoming shipments, and process relocations.</p>
        </div>
        <button
          onClick={() => fetchStats()}
          disabled={isRefreshing}
          className="bg-violet-600 hover:bg-violet-700 text-white rounded-xl h-10 px-4 flex items-center gap-1.5 self-start sm:self-center font-bold text-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Notification banner */}
      {notification && (
        <div className={`flex items-center gap-3 p-4 rounded-xl border mb-6 animate-fade-in ${
          notification.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'
        }`}>
          {notification.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertOctagon className="w-5 h-5" />}
          <p className="text-sm font-semibold">{notification.message}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sidebar / Left column */}
        <div className="space-y-6 lg:col-span-1">
          <div className="bg-[#111115] border border-white/8 rounded-2xl p-5">
            <h2 className="text-xs font-bold text-white/40 uppercase tracking-widest mb-4">Operations Menu</h2>
            <div className="flex flex-col gap-1">
              <button
                onClick={() => setActiveSubTab('fulfillment')}
                className={`flex items-center justify-between p-3 rounded-xl text-left text-xs font-bold transition-all ${
                  activeSubTab === 'fulfillment' ? 'bg-violet-600 text-white shadow-lg shadow-violet-500/10' : 'text-white/60 hover:bg-white/5 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Truck className="w-4 h-4" /> Shipments Queue
                </span>
                <Badge className={activeSubTab === 'fulfillment' ? 'bg-white/20 text-white' : 'bg-white/5 text-white/60'}>
                  {confirmedReservations.length}
                </Badge>
              </button>

              <button
                onClick={() => setActiveSubTab('inventory')}
                className={`flex items-center justify-between p-3 rounded-xl text-left text-xs font-bold transition-all ${
                  activeSubTab === 'inventory' ? 'bg-violet-600 text-white shadow-lg shadow-violet-500/10' : 'text-white/60 hover:bg-white/5 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Warehouse className="w-4 h-4" /> Replenish Stock
                </span>
              </button>

              <button
                onClick={() => setActiveSubTab('transfers')}
                className={`flex items-center justify-between p-3 rounded-xl text-left text-xs font-bold transition-all ${
                  activeSubTab === 'transfers' ? 'bg-violet-600 text-white shadow-lg shadow-violet-500/10' : 'text-white/60 hover:bg-white/5 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-2">
                  <ArrowLeftRight className="w-4 h-4" /> Move Inventory
                </span>
              </button>
            </div>
          </div>

          {/* Low Stock Warners */}
          {stats && (
            <div className="bg-[#111115] border border-white/8 rounded-2xl p-5">
              <h2 className="text-xs font-bold text-white/40 uppercase tracking-widest mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" /> Stock Warnings
              </h2>
              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {stats.healthAlerts.length === 0 ? (
                  <div className="text-[11px] text-emerald-400 bg-emerald-500/5 border border-emerald-500/10 p-2.5 rounded-xl font-semibold">
                    ✓ All warehouse shelves report optimal levels.
                  </div>
                ) : (
                  stats.healthAlerts.map((alert, idx) => (
                    <div key={idx} className="text-[10px] bg-white/2 border border-white/5 p-2 rounded-xl text-white/70 leading-relaxed">
                      {alert.message}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Content column */}
        <div className="lg:col-span-3">
          {/* TAB A: FULFILLMENT PIPELINE */}
          {activeSubTab === 'fulfillment' && (
            <div className="bg-[#111115] border border-white/8 rounded-2xl p-6">
              <h2 className="font-extrabold text-white text-base mb-2 flex items-center gap-2">
                <Truck className="w-4 h-4 text-violet-400" /> Incoming Shipments fulfillment Queue
              </h2>
              <p className="text-xs text-white/40 mb-6">Confirmed orders requiring packing, dispatching, and tracking updates.</p>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-white/5 text-white/30 font-semibold">
                      <th className="py-3 px-2">Order ID</th>
                      <th className="py-3 px-2">Product Name</th>
                      <th className="py-3 px-2">Fulfillment Node</th>
                      <th className="py-3 px-2">Quantity</th>
                      <th className="py-3 px-2">Scheduled slot</th>
                      <th className="py-3 px-2">Shipment State</th>
                      <th className="py-3 px-2 text-right">Progress Workflow</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {confirmedReservations.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-8 text-white/20 font-medium">
                          No confirmed shipments needing fulfillment right now.
                        </td>
                      </tr>
                    ) : (
                      confirmedReservations.map((res) => {
                        const metadata = res.metadata ?? {};
                        const currentFulfillment = metadata.fulfillmentState || 'Awaiting Packing';
                        return (
                          <tr key={res.id} className="hover:bg-white/2">
                            <td className="py-4 px-2 font-mono font-bold text-white">
                              #{res.id.slice(-8).toUpperCase()}
                            </td>
                            <td className="py-4 px-2">
                              <div className="font-semibold text-white">{res.product.name}</div>
                              <div className="text-[10px] text-white/30 font-mono mt-0.5">{res.product.sku}</div>
                            </td>
                            <td className="py-4 px-2 text-white/60">{res.warehouse.name}</td>
                            <td className="py-4 px-2 font-mono text-white/70 font-bold">{res.quantity}</td>
                            <td className="py-4 px-2 text-white/50">
                              {metadata.deliveryDate ? (
                                <div>
                                  <p className="font-semibold">{metadata.deliveryDate}</p>
                                  <p className="text-[10px] text-violet-400 font-mono">{metadata.deliverySlot}</p>
                                </div>
                              ) : (
                                <span className="text-white/20 italic">Not scheduled</span>
                              )}
                            </td>
                            <td className="py-4 px-2">
                              <Badge variant="outline" className="border-violet-500/20 text-violet-400 bg-violet-500/5 text-[9px] py-0 px-1 font-mono">
                                {currentFulfillment}
                              </Badge>
                            </td>
                            <td className="py-4 px-2 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {!metadata.fulfillmentState && (
                                  <Button
                                    size="sm"
                                    disabled={actioningId === res.id}
                                    onClick={() => handleUpdateFulfillment(res.id, 'PACKED')}
                                    className="h-7 text-[10px] bg-violet-600 hover:bg-violet-700 text-white rounded-lg px-2.5 font-bold"
                                  >
                                    Mark Packed
                                  </Button>
                                )}
                                {metadata.fulfillmentState === 'PACKED' && (
                                  <Button
                                    size="sm"
                                    disabled={actioningId === res.id}
                                    onClick={() => handleUpdateFulfillment(res.id, 'DISPATCHED')}
                                    className="h-7 text-[10px] bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-2.5 font-bold"
                                  >
                                    Mark Dispatched
                                  </Button>
                                )}
                                {metadata.fulfillmentState === 'DISPATCHED' && (
                                  <Button
                                    size="sm"
                                    disabled={actioningId === res.id}
                                    onClick={() => handleUpdateFulfillment(res.id, 'DELIVERED')}
                                    className="h-7 text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-2.5 font-bold"
                                  >
                                    Mark Delivered
                                  </Button>
                                )}
                                {metadata.fulfillmentState === 'DELIVERED' && (
                                  <span className="text-emerald-400 font-semibold flex items-center gap-1 text-[10px] mr-2">
                                    ✓ Completed
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB B: INVENTORY REPLENISHMENT */}
          {activeSubTab === 'inventory' && stats && (
            <div className="bg-[#111115] border border-white/8 rounded-2xl p-6">
              <h2 className="font-extrabold text-white text-base mb-2 flex items-center gap-2">
                <Warehouse className="w-4 h-4 text-violet-400" /> Physical Stock replenishment & Damage Reporting
              </h2>
              <p className="text-xs text-white/40 mb-6">Coordinate regular restocks, report damaged inventory stock, or correct count discrepancies.</p>

              <div className="space-y-6">
                {stats.warehouses.map((wh) => (
                  <div key={wh.id} className="border border-white/5 rounded-xl bg-white/2 p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-white/5 pb-3 mb-4 gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm">{wh.name}</span>
                        <span className="text-[10px] text-white/30 font-mono">({wh.location})</span>
                      </div>
                      <Badge variant="outline" className="border-white/10 text-white/40 text-[9px] font-mono py-0 px-1 bg-white/2">
                        Occupancy: {wh.utilization}%
                      </Badge>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {wh.stocks.map((stock) => {
                        const heldRatio = stock.totalQuantity > 0 ? stock.reservedQuantity / stock.totalQuantity : 0;
                        const matchedProduct = stats.products.find(p => p.id === stock.productId);
                        const matchedStockRecord = matchedProduct?.inventoryStocks.find(s => s.warehouseId === wh.id);
                        const stockRecordId = matchedStockRecord?.id || '';

                        return (
                          <div key={stock.productId} className="bg-white/2 border border-white/5 p-3 rounded-lg flex flex-col justify-between gap-3 text-left">
                            <div className="min-w-0">
                              <span className="font-bold text-white text-xs block truncate">{stock.productName}</span>
                              <span className="text-[9px] text-white/30 font-mono block mt-0.5">{stock.productSku}</span>
                            </div>

                            <div className="flex justify-between items-center text-[10px] text-white/40 font-mono">
                              <span>Total: {stock.totalQuantity}</span>
                              <span>Avail: {stock.availableQuantity}</span>
                            </div>

                            <div className="pt-2 border-t border-white/5 flex items-center justify-end">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => stockRecordId && setShowAdjustStock({
                                  stockId: stockRecordId,
                                  productName: stock.productName,
                                  warehouseName: wh.name,
                                  currentQty: stock.totalQuantity
                                })}
                                className="h-7 text-[10px] border-violet-500/20 text-violet-400 hover:bg-violet-500/10 rounded-lg flex items-center gap-1"
                              >
                                <Plus className="w-3.5 h-3.5" /> Adjust
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB C: INVENTORY TRANSFERS */}
          {activeSubTab === 'transfers' && stats && (
            <div className="bg-[#111115] border border-white/8 rounded-2xl p-6">
              <h2 className="font-extrabold text-white text-base mb-2 flex items-center gap-2">
                <ArrowLeftRight className="w-4 h-4 text-violet-400" /> Relocate Physical Stock
              </h2>
              <p className="text-xs text-white/40 mb-6">Move units between warehouses to balance regional client booking demand. All locking handles CUID sorting to avoid deadlocks.</p>

              <form onSubmit={handleTransferStock} className="space-y-4 max-w-lg">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-white/40 uppercase tracking-wide">Select Product SKU *</label>
                  <select
                    required
                    value={stockTransfer.productId}
                    onChange={(e) => setStockTransfer({ ...stockTransfer, productId: e.target.value })}
                    className="w-full bg-[#111115] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                  >
                    <option value="">-- Choose Product --</option>
                    {stats.products.filter(p => p.archivedAt === null).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-wide">Source Warehouse *</label>
                    <select
                      required
                      value={stockTransfer.sourceWarehouseId}
                      onChange={(e) => setStockTransfer({ ...stockTransfer, sourceWarehouseId: e.target.value })}
                      className="w-full bg-[#111115] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                    >
                      <option value="">-- Source Node --</option>
                      {stats.warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-wide">Destination Warehouse *</label>
                    <select
                      required
                      value={stockTransfer.destinationWarehouseId}
                      onChange={(e) => setStockTransfer({ ...stockTransfer, destinationWarehouseId: e.target.value })}
                      className="w-full bg-[#111115] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                    >
                      <option value="">-- Destination Node --</option>
                      {stats.warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-wide">Relocation Quantity *</label>
                    <input
                      type="number"
                      required
                      min="1"
                      placeholder="e.g. 50"
                      value={stockTransfer.quantity}
                      onChange={(e) => setStockTransfer({ ...stockTransfer, quantity: e.target.value })}
                      className="w-full bg-white/3 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-violet-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-wide">Operator Name *</label>
                    <input
                      type="text"
                      required
                      value={stockTransfer.adminName}
                      onChange={(e) => setStockTransfer({ ...stockTransfer, adminName: e.target.value })}
                      className="w-full bg-white/3 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-white/40 uppercase tracking-wide">Relocation Reason</label>
                  <input
                    type="text"
                    placeholder="e.g. Stock balancing across regions"
                    value={stockTransfer.reason}
                    onChange={(e) => setStockTransfer({ ...stockTransfer, reason: e.target.value })}
                    className="w-full bg-white/3 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-violet-500"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={isTransferringStock}
                  className="w-full h-10 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-bold"
                >
                  {isTransferringStock ? 'Relocating...' : 'Execute Stock Transfer'}
                </Button>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* ADJUST STOCK MODAL */}
      {showAdjustStock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#111115] border border-white/10 rounded-2xl max-w-md w-full p-6 space-y-4 animate-fade-in text-left">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <h3 className="font-bold text-white text-base">Adjust Warehouse Stock Level</h3>
              <button onClick={() => setShowAdjustStock(null)} className="text-white/40 hover:text-white/70">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-white/3 p-3.5 border border-white/5 rounded-xl text-xs text-white/50 space-y-1">
              <p>Product: <span className="font-bold text-white">{showAdjustStock.productName}</span></p>
              <p>Warehouse: <span className="font-bold text-white">{showAdjustStock.warehouseName}</span></p>
              <p>Current Total Stock: <span className="font-mono font-bold text-violet-400">{showAdjustStock.currentQty} units</span></p>
            </div>

            <form onSubmit={handleAdjustStock} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-white/40 uppercase tracking-wide">Action Type *</label>
                  <select
                    value={stockAdjustment.action}
                    onChange={(e) => setStockAdjustment({ ...stockAdjustment, action: e.target.value as any })}
                    className="w-full bg-[#111115] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                  >
                    <option value="RESTOCK">RESTOCK (+)</option>
                    <option value="DAMAGE">DAMAGE (-)</option>
                    <option value="CORRECTION">CORRECTION (+/-)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-white/40 uppercase tracking-wide">Quantity Delta *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="e.g. 10"
                    value={stockAdjustment.quantityChange}
                    onChange={(e) => setStockAdjustment({ ...stockAdjustment, quantityChange: e.target.value })}
                    className="w-full bg-white/3 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-violet-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1 col-span-2">
                  <label className="text-[9px] font-bold text-white/40 uppercase tracking-wide">Operator Name *</label>
                  <input
                    type="text"
                    required
                    value={stockAdjustment.adminName}
                    onChange={(e) => setStockAdjustment({ ...stockAdjustment, adminName: e.target.value })}
                    className="w-full bg-white/3 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-bold text-white/40 uppercase tracking-wide">Reason / Details</label>
                <input
                  type="text"
                  placeholder="e.g. Broken packaging / Warehouse inventory count check"
                  value={stockAdjustment.reason}
                  onChange={(e) => setStockAdjustment({ ...stockAdjustment, reason: e.target.value })}
                  className="w-full bg-white/3 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-violet-500"
                />
              </div>

              <div className="flex gap-2.5 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowAdjustStock(null)}
                  className="flex-1 rounded-xl h-10 border-white/10 text-white"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isAdjustingStock}
                  className="flex-1 h-10 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-bold"
                >
                  {isAdjustingStock ? 'Applying...' : 'Apply Stock Change'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Inline fallback SVG component
function XCircle(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="m15 9-6 6" />
      <path d="m9 9 6 6" />
    </svg>
  );
}
