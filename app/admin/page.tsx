'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  RefreshCw,
  ArrowLeft,
  Shield,
  Package,
  ShoppingCart,
  Timer,
  AlertOctagon,
  CheckCircle2,
  Warehouse,
  History,
  Trash2,
  TrendingUp,
  Flame,
  AlertTriangle,
  Server,
  Database,
  Clock,
  Gauge,
  Percent,
  History as TimelineIcon,
  XCircle,
  HelpCircle,
  Plus,
  ArrowLeftRight,
  Eye,
  EyeOff,
  FileText,
  User,
  ArrowUpRight,
  ArrowDownLeft,
  Info,
  Boxes,
  LogOut,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { formatDate, formatPrice } from '@/lib/utils';

// Types & Interfaces
interface StockEntry {
  productId: string;
  productName: string;
  productSku: string;
  productPrice: string;
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

interface TimelineEvent {
  event: string;
  timestamp: string;
  actor: 'Customer' | 'Admin' | 'System';
  description: string;
}

interface ReservationLog {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  status: 'PENDING' | 'CONFIRMED' | 'RELEASED' | 'EXPIRED';
  expiresAt: string;
  confirmedAt: string | null;
  releasedAt: string | null;
  createdAt: string;
  metadata: {
    timeline?: TimelineEvent[];
  } | null;
  product: {
    name: string;
    sku: string;
  };
  warehouse: {
    name: string;
  };
}

interface HealthAlert {
  id: string;
  type: 'critical_stock' | 'low_stock' | 'high_contention' | 'expired_spike';
  severity: 'high' | 'medium' | 'info';
  message: string;
  timestamp: string;
}

interface ContentionProduct {
  id: string;
  name: string;
  sku: string;
  attempts: number;
  totalQuantityRequested: number;
}

interface InventoryAdjustmentLog {
  id: string;
  stockId: string;
  action: 'RESTOCK' | 'DAMAGE' | 'CORRECTION' | 'TRANSFER_IN' | 'TRANSFER_OUT';
  quantity: number;
  reason: string | null;
  adminName: string;
  createdAt: string;
  stock: {
    product: {
      name: string;
      sku: string;
    };
    warehouse: {
      name: string;
    };
  };
}

interface ProductAdmin {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  imageUrl: string | null;
  price: string;
  isActive: boolean;
  archivedAt: string | null;
  createdAt: string;
  inventoryStocks: Array<{
    id: string;
    productId: string;
    warehouseId: string;
    totalQuantity: number;
    reservedQuantity: number;
    warehouse: {
      name: string;
    };
  }>;
}

interface AdminStats {
  totalStock: number;
  reservedStock: number;
  availableStock: number;
  counts: {
    pending: number;
    confirmed: number;
    released: number;
    expired: number;
    total: number;
  };
  funnel: {
    conversionRate: number;
    expiryRate: number;
    releasedRate: number;
  };
  expiryTrends: {
    expiredLastHour: number;
  };
  analytics: {
    avgCheckoutTimeSec: number;
    avgExpiryTimeSec: number;
    failures: {
      failedReservations: number;
      failedConfirmations: number;
      conflict409Count: number;
    };
  };
  contentionMonitor: ContentionProduct[];
  warehouses: WarehouseStats[];
  recentReservations: ReservationLog[];
  recentAdjustments: InventoryAdjustmentLog[];
  products: ProductAdmin[];
  healthAlerts: HealthAlert[];
  performance: {
    dbQueryDurationMs: number;
    apiLatencyMs: number;
  };
  systemStatus: {
    databaseConnected: boolean;
    cronActive: boolean;
  };
}

export default function AdminDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [selectedRes, setSelectedRes] = useState<ReservationLog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Session details
  const [session, setSession] = useState<{ email: string; role: string; name: string } | null>(null);

  // Tab State
  const [activeTab, setActiveTab] = useState<'overview' | 'catalog' | 'warehouses' | 'ledger'>('overview');

  // Modals & Form State
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showAddWarehouse, setShowAddWarehouse] = useState(false);
  const [showAdjustStock, setShowAdjustStock] = useState<{ stockId: string; currentQty: number; productName: string; warehouseName: string } | null>(null);
  const [showTransferStock, setShowTransferStock] = useState(false);

  // Add Product Form State
  const [newProduct, setNewProduct] = useState({ name: '', sku: '', price: '', description: '', imageUrl: '' });
  const [isAddingProduct, setIsAddingProduct] = useState(false);
  
  // Add Warehouse Form State
  const [newWarehouse, setNewWarehouse] = useState({ name: '', location: '' });
  const [isAddingWarehouse, setIsAddingWarehouse] = useState(false);

  // Adjust Stock Form State
  const [stockAdjustment, setStockAdjustment] = useState({ quantityChange: '', action: 'RESTOCK' as 'RESTOCK' | 'DAMAGE' | 'CORRECTION', reason: '', adminName: 'Admin' });
  const [isAdjustingStock, setIsAdjustingStock] = useState(false);

  // Transfer Stock Form State
  const [stockTransfer, setStockTransfer] = useState({ productId: '', sourceWarehouseId: '', destinationWarehouseId: '', quantity: '', reason: '', adminName: 'Admin' });
  const [isTransferringStock, setIsTransferringStock] = useState(false);

  // Time elapsed since last sync
  const [secondsSinceSync, setSecondsSinceSync] = useState(0);
  const syncTimerRef = useRef<NodeJS.Timeout | null>(null);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

  const fetchStats = useCallback(async (silent = false) => {
    if (!silent) setIsRefreshing(true);
    try {
      setError(null);
      const res = await fetch('/api/admin/stats');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success) {
        setStats(data.stats);
        setSecondsSinceSync(0);

        // Keep selected reservation metadata fresh if open
        if (selectedRes) {
          const updated = data.stats.recentReservations.find((r: ReservationLog) => r.id === selectedRes.id);
          if (updated) setSelectedRes(updated);
        }
      } else {
        throw new Error(data.error || 'Failed to load statistics');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error fetching system metrics.');
      console.error('[AdminDashboard] fetchStats error:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [selectedRes]);

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/session');
      const data = await res.json();
      if (data.authenticated) {
        setSession(data.user);
      }
    } catch (err) {
      console.error('[AdminDashboard] fetchSession error:', err);
    }
  }, []);

  const handleSignOut = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/admin/login');
      router.refresh();
    } catch (err) {
      console.error('[AdminDashboard] Sign out error:', err);
    }
  };

  useEffect(() => {
    fetchSession();
    fetchStats();
    // Auto-update every 15 seconds to monitor locks & checkouts
    const interval = setInterval(() => fetchStats(true), 15_000);

    // Sync timer counter
    syncTimerRef.current = setInterval(() => {
      setSecondsSinceSync((prev) => prev + 1);
    }, 1000);

    return () => {
      clearInterval(interval);
      if (syncTimerRef.current) clearInterval(syncTimerRef.current);
    };
  }, [fetchStats, fetchSession]);

  const handleRunCleanup = async () => {
    setIsCleaningUp(true);
    try {
      const res = await fetch('/api/admin/cleanup', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showNotification('success', data.message || 'Cleanup completed successfully.');
        fetchStats(true);
      } else {
        throw new Error(data.error || 'Failed to execute cleanup');
      }
    } catch (err) {
      showNotification('error', err instanceof Error ? err.message : 'Error running cleanup job.');
    } finally {
      setIsCleaningUp(false);
    }
  };

  const handleForceRelease = async (resId: string) => {
    setActioningId(resId);
    try {
      const res = await fetch(`/api/reservations/${resId}/release`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'ADMIN_FORCE_RELEASE' }),
      });
      if (res.ok) {
        showNotification('success', `Reservation hold #${resId.slice(-8).toUpperCase()} force released.`);
        fetchStats(true);
      } else {
        const data = await res.json();
        throw new Error(data.message || 'Failed to release reservation');
      }
    } catch (err) {
      showNotification('error', err instanceof Error ? err.message : 'Error releasing reservation.');
    } finally {
      setActioningId(null);
    }
  };

  const handleExtendHold = async (resId: string) => {
    setActioningId(resId);
    try {
      const res = await fetch(`/api/admin/reservations/${resId}/extend`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        showNotification('success', data.message || `Reservation hold extended by 5 minutes.`);
        fetchStats(true);
      } else {
        throw new Error(data.error || 'Failed to extend reservation');
      }
    } catch (err) {
      showNotification('error', err instanceof Error ? err.message : 'Error extending reservation hold.');
    } finally {
      setActioningId(null);
    }
  };

  // Product CRUD / Actions
  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProduct.name || !newProduct.sku || !newProduct.price) {
      showNotification('error', 'Please fill in all required fields.');
      return;
    }

    setIsAddingProduct(true);
    try {
      const res = await fetch('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newProduct.name,
          sku: newProduct.sku,
          price: parseFloat(newProduct.price),
          description: newProduct.description || undefined,
          imageUrl: newProduct.imageUrl || undefined,
        }),
      });

      const data = await res.json();
      if (data.success) {
        showNotification('success', data.message || 'Product created successfully!');
        setShowAddProduct(false);
        setNewProduct({ name: '', sku: '', price: '', description: '', imageUrl: '' });
        fetchStats(true);
      } else {
        throw new Error(data.error || 'Failed to add product.');
      }
    } catch (err) {
      showNotification('error', err instanceof Error ? err.message : 'Failed to add product.');
    } finally {
      setIsAddingProduct(false);
    }
  };

  const handleToggleProductActive = async (productId: string, currentActive: boolean) => {
    try {
      const res = await fetch(`/api/admin/products/${productId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentActive }),
      });
      const data = await res.json();
      if (data.success) {
        showNotification('success', data.message || 'Product status updated.');
        fetchStats(true);
      } else {
        throw new Error(data.error || 'Failed to update product availability.');
      }
    } catch (err) {
      showNotification('error', err instanceof Error ? err.message : 'Error changing availability.');
    }
  };

  const handleToggleProductArchived = async (productId: string, isCurrentlyArchived: boolean) => {
    try {
      const res = await fetch(`/api/admin/products/${productId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isArchived: !isCurrentlyArchived }),
      });
      const data = await res.json();
      if (data.success) {
        const action = !isCurrentlyArchived ? 'archived' : 'restored';
        showNotification('success', `Product successfully ${action}.`);
        fetchStats(true);
      } else {
        throw new Error(data.error || 'Failed to archive/restore product.');
      }
    } catch (err) {
      showNotification('error', err instanceof Error ? err.message : 'Error archiving/restoring SKU.');
    }
  };

  // Warehouse actions
  const handleAddWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWarehouse.name || !newWarehouse.location) {
      showNotification('error', 'Warehouse name and location are required.');
      return;
    }

    setIsAddingWarehouse(true);
    try {
      const res = await fetch('/api/admin/warehouses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newWarehouse),
      });

      const data = await res.json();
      if (data.success) {
        showNotification('success', data.message || 'Warehouse added successfully.');
        setShowAddWarehouse(false);
        setNewWarehouse({ name: '', location: '' });
        fetchStats(true);
      } else {
        throw new Error(data.error || 'Failed to add warehouse.');
      }
    } catch (err) {
      showNotification('error', err instanceof Error ? err.message : 'Error adding warehouse.');
    } finally {
      setIsAddingWarehouse(false);
    }
  };

  // Stock Adjustment Action
  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showAdjustStock || !stockAdjustment.quantityChange) {
      showNotification('error', 'Specify a valid adjustment quantity.');
      return;
    }

    const change = parseInt(stockAdjustment.quantityChange);
    if (isNaN(change)) {
      showNotification('error', 'Adjustment must be a number.');
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
        showNotification('success', data.message || 'Stock adjusted successfully.');
        setShowAdjustStock(null);
        setStockAdjustment({ quantityChange: '', action: 'RESTOCK', reason: '', adminName: 'Admin' });
        fetchStats(true);
      } else {
        throw new Error(data.error || 'Failed to adjust stock.');
      }
    } catch (err) {
      showNotification('error', err instanceof Error ? err.message : 'Error updating stock.');
    } finally {
      setIsAdjustingStock(false);
    }
  };

  // Stock Transfer Action
  const handleTransferStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stockTransfer.productId || !stockTransfer.sourceWarehouseId || !stockTransfer.destinationWarehouseId || !stockTransfer.quantity) {
      showNotification('error', 'Please fill in all fields to transfer stock.');
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
        showNotification('success', data.message || 'Inventory transferred successfully.');
        setShowTransferStock(false);
        setStockTransfer({ productId: '', sourceWarehouseId: '', destinationWarehouseId: '', quantity: '', reason: '', adminName: 'Admin' });
        fetchStats(true);
      } else {
        throw new Error(data.error || 'Failed to transfer stock.');
      }
    } catch (err) {
      showNotification('error', err instanceof Error ? err.message : 'Error executing transfer.');
    } finally {
      setIsTransferringStock(false);
    }
  };

  const getStatusBadge = (status: ReservationLog['status']) => {
    switch (status) {
      case 'PENDING':
        return <Badge variant="warning" className="animate-pulse">Active Hold</Badge>;
      case 'CONFIRMED':
        return <Badge variant="success">Confirmed</Badge>;
      case 'RELEASED':
        return <Badge variant="secondary">Released</Badge>;
      case 'EXPIRED':
        return <Badge variant="danger">Expired</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const getContentionColorClass = (ratio: number) => {
    if (ratio > 0.8) return 'text-red-400 bg-red-500/10 border-red-500/20';
    if (ratio > 0.4) return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
    return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
  };

  const getContentionBarColorClass = (ratio: number) => {
    if (ratio > 0.8) return 'bg-red-500';
    if (ratio > 0.4) return 'bg-amber-500';
    return 'bg-emerald-500';
  };

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
      return '';
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 flex flex-col items-center justify-center gap-4">
        <RefreshCw className="w-10 h-10 animate-spin text-violet-400" />
        <p className="text-white/40 text-sm font-medium">Booting control metrics and resolving schemas...</p>
      </div>
    );
  }

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
            Storefront Catalog
          </a>
          <a href="/operations" className="px-3.5 py-2 rounded-xl text-xs font-semibold text-white/60 hover:text-white hover:bg-white/5 transition-all">
            Operations Portal
          </a>
          <a href="/admin" className="px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-violet-500/10 border border-violet-500/20">
            Admin Dashboard
          </a>
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

      {/* 1. Live System Status Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 mb-8 bg-[#111115] border border-white/8 rounded-2xl">
        <div className="flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-white/40" />
            <span className="text-xs text-white/40 font-semibold tracking-wider uppercase">System Node:</span>
            <Badge variant="outline" className="border-white/10 text-white/70 bg-white/3">
              Production Standard
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-emerald-400" />
            <span className="text-xs text-white/40 font-semibold tracking-wider uppercase">Database:</span>
            <span className="flex items-center gap-1 text-xs text-emerald-400 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Healthy (Supabase)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-violet-400" />
            <span className="text-xs text-white/40 font-semibold tracking-wider uppercase">Cleanup Service:</span>
            <span className="text-xs text-violet-400 font-semibold">
              Cron Running (5m)
            </span>
          </div>

          {stats && (
            <div className="flex items-center gap-2">
              <Gauge className="w-4 h-4 text-white/40" />
              <span className="text-xs text-white/40 font-semibold tracking-wider uppercase">Latency:</span>
              <span className="text-xs text-white/70 font-mono">
                API: {stats.performance.apiLatencyMs}ms · DB: {stats.performance.dbQueryDurationMs}ms
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-white/30 font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-ping" />
          Last synced: {secondsSinceSync === 0 ? 'Just now' : `${secondsSinceSync}s ago`}
        </div>
      </div>

      {/* Top Title Section */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
              <Shield className="w-4 h-4 text-violet-400" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
              Inventory Control Center
            </h1>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={handleRunCleanup}
            disabled={isCleaningUp}
            variant="outline"
            className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10 h-10 rounded-xl"
          >
            {isCleaningUp ? (
              <RefreshCw className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Trash2 className="w-4 h-4 mr-2" />
            )}
            Force Cron Cleanup
          </Button>

          <Button
            onClick={() => fetchStats()}
            disabled={isRefreshing}
            className="bg-violet-600 hover:bg-violet-700 text-white h-10 rounded-xl"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh Dashboard
          </Button>
        </div>
      </div>

      {/* Action Notification Banner */}
      {notification && (
        <div
          className={`flex items-center gap-3 p-4 rounded-xl border mb-6 animate-fade-in ${
            notification.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-red-500/10 border-red-500/30 text-red-400'
          }`}
        >
          {notification.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 shrink-0" />
          ) : (
            <AlertOctagon className="w-5 h-5 shrink-0" />
          )}
          <p className="text-sm font-semibold">{notification.message}</p>
        </div>
      )}

      {/* Database Error State */}
      {error && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 mb-8">
          <AlertOctagon className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-sm">Dashboard sync error</p>
            <p className="text-xs text-red-400/80 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* 2. Top-level Analytics Summary Grid */}
      {stats && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8">
            <Card className="bg-[#111115] border-white/8">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs text-white/40 font-semibold uppercase tracking-wider">
                    Total Capacity
                  </span>
                  <Package className="w-4 h-4 text-white/30" />
                </div>
                <p className="text-3xl font-extrabold text-white font-mono">{stats.totalStock}</p>
                <div className="flex items-center gap-1.5 mt-2">
                  <span className="text-xs text-white/30">Total warehouse stock</span>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-[#111115] border-white/8">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs text-white/40 font-semibold uppercase tracking-wider">
                    Temporary Holds
                  </span>
                  <Timer className="w-4 h-4 text-amber-400/60" />
                </div>
                <p className="text-3xl font-extrabold text-amber-400 font-mono">
                  {stats.reservedStock}
                </p>
                <div className="flex items-center justify-between gap-1.5 mt-2">
                  <span className="text-xs text-amber-400/60 font-semibold">
                    {stats.counts.pending} pending locks
                  </span>
                  {stats.expiryTrends.expiredLastHour > 0 && (
                    <Badge variant="outline" className="border-red-500/20 text-red-400 text-[10px] py-0 px-1 bg-red-500/5">
                      {stats.expiryTrends.expiredLastHour} expired (1h)
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-[#111115] border-white/8">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs text-white/40 font-semibold uppercase tracking-wider">
                    Available stock
                  </span>
                  <TrendingUp className="w-4 h-4 text-emerald-400/60" />
                </div>
                <p className="text-3xl font-extrabold text-emerald-400 font-mono">
                  {stats.availableStock}
                </p>
                <div className="flex items-center gap-1.5 mt-2">
                  <span className="text-xs text-white/30">Unreserved physical items</span>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-[#111115] border-white/8">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs text-white/40 font-semibold uppercase tracking-wider">
                    Checkout Sales
                  </span>
                  <ShoppingCart className="w-4 h-4 text-violet-400/60" />
                </div>
                <p className="text-3xl font-extrabold text-violet-400 font-mono">
                  {stats.counts.confirmed}
                </p>
                <div className="flex items-center gap-1.5 mt-2 font-mono text-[11px] text-white/30">
                  <span>{stats.counts.total} attempts logged</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Business Revenue Analytics Panel */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <Card className="bg-gradient-to-br from-[#111115] to-[#171720] border-white/8 md:col-span-1">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-white/40 font-bold uppercase tracking-wider flex items-center justify-between">
                  Platform Revenue Analytics
                  <Badge variant="outline" className="border-emerald-500/20 text-emerald-400 bg-emerald-500/5 text-[9px] font-mono">Live</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 pt-0 space-y-4">
                <div className="mt-4">
                  <span className="text-[10px] text-white/40 block uppercase tracking-wide font-bold">Total Sales Revenue</span>
                  <p className="text-3xl font-extrabold text-emerald-400 font-mono tracking-tight">
                    {formatPrice(stats.revenue?.totalRevenue ?? 0)}
                  </p>
                </div>
                <div className="pt-3 border-t border-white/5 flex items-center justify-between">
                  <div>
                    <span className="text-[9px] text-white/40 block uppercase font-bold tracking-wide">Revenue Today</span>
                    <p className="text-sm font-bold text-white font-mono">{formatPrice(stats.revenue?.dailyRevenue ?? 0)}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-[9px] text-white/40 block uppercase font-bold tracking-wide">Order Conversion</span>
                    <p className="text-sm font-bold text-violet-400 font-mono">{Math.round(stats.funnel.conversionRate)}%</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-[#111115] border-white/8 md:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-white/40 font-bold uppercase tracking-wider">
                  Fulfillment Node Sales Performance
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 pt-2">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {stats.warehouses.map((wh) => {
                    const revenue = stats.revenue?.revenuePerWarehouse?.[wh.id] ?? 0;
                    return (
                      <div key={wh.id} className="bg-white/2 border border-white/5 rounded-xl p-4 flex flex-col justify-between gap-1.5">
                        <div>
                          <span className="font-bold text-white text-xs block truncate">{wh.name}</span>
                          <span className="text-[9px] text-white/30 font-mono">{wh.location}</span>
                        </div>
                        <div className="pt-2 border-t border-white/5">
                          <span className="text-[9px] text-white/30 block uppercase tracking-wide">Node Revenue</span>
                          <span className="font-bold text-emerald-400 font-mono text-sm">{formatPrice(revenue)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-white/10 mb-8 overflow-x-auto gap-2 scrollbar-none">
            <button
              onClick={() => setActiveTab('overview')}
              className={`flex items-center gap-2 py-3 px-4 border-b-2 text-sm font-semibold transition-all whitespace-nowrap ${
                activeTab === 'overview'
                  ? 'border-violet-500 text-white bg-violet-500/5'
                  : 'border-transparent text-white/40 hover:text-white/70 hover:bg-white/2'
              }`}
            >
              <Gauge className="w-4 h-4" />
              Overview & Holds
            </button>
            <button
              onClick={() => setActiveTab('catalog')}
              className={`flex items-center gap-2 py-3 px-4 border-b-2 text-sm font-semibold transition-all whitespace-nowrap ${
                activeTab === 'catalog'
                  ? 'border-violet-500 text-white bg-violet-500/5'
                  : 'border-transparent text-white/40 hover:text-white/70 hover:bg-white/2'
              }`}
            >
              <Package className="w-4 h-4" />
              SKU Catalog Management
            </button>
            <button
              onClick={() => setActiveTab('warehouses')}
              className={`flex items-center gap-2 py-3 px-4 border-b-2 text-sm font-semibold transition-all whitespace-nowrap ${
                activeTab === 'warehouses'
                  ? 'border-violet-500 text-white bg-violet-500/5'
                  : 'border-transparent text-white/40 hover:text-white/70 hover:bg-white/2'
              }`}
            >
              <Warehouse className="w-4 h-4" />
              Warehouses & Stock Control
            </button>
            <button
              onClick={() => setActiveTab('ledger')}
              className={`flex items-center gap-2 py-3 px-4 border-b-2 text-sm font-semibold transition-all whitespace-nowrap ${
                activeTab === 'ledger'
                  ? 'border-violet-500 text-white bg-violet-500/5'
                  : 'border-transparent text-white/40 hover:text-white/70 hover:bg-white/2'
              }`}
            >
              <FileText className="w-4 h-4" />
              Stock Adjustment Ledger
            </button>
          </div>

          {/* TAB 1: OVERVIEW & RESERVATIONS */}
          {activeTab === 'overview' && (
            <>
              {/* Failure Monitoring & Duration Metrics Block */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                {/* Lifespan & Performance Analytics */}
                <Card className="bg-[#111115] border-white/8">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                      <Clock className="w-4 h-4 text-violet-400" />
                      Reservation Lifecycle Duration Metrics
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-4">
                    <div className="bg-white/3 border border-white/5 rounded-xl p-4">
                      <p className="text-[10px] text-white/40 uppercase font-semibold tracking-wider">Avg Checkout Time</p>
                      <p className="text-2xl font-extrabold text-white mt-1 font-mono">
                        {stats.analytics.avgCheckoutTimeSec}s
                      </p>
                      <p className="text-[10px] text-white/20 mt-1">From reservation to confirmation</p>
                    </div>
                    <div className="bg-white/3 border border-white/5 rounded-xl p-4">
                      <p className="text-[10px] text-white/40 uppercase font-semibold tracking-wider">Avg Expired Lifespan</p>
                      <p className="text-2xl font-extrabold text-white mt-1 font-mono">
                        {stats.analytics.avgExpiryTimeSec}s
                      </p>
                      <p className="text-[10px] text-white/20 mt-1">Held duration of expired items</p>
                    </div>
                  </CardContent>
                </Card>

                {/* API Failures & Conflicts Monitoring */}
                <Card className="bg-[#111115] border-white/8">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-400" />
                      API Failure & Transaction Conflict Monitor
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-3 gap-3">
                    <div className="bg-red-500/5 border border-red-500/10 rounded-xl p-3">
                      <p className="text-[10px] text-red-400/80 font-bold uppercase tracking-wider">409 DB Conflicts</p>
                      <p className="text-xl font-extrabold text-red-400 mt-1 font-mono">
                        {stats.analytics.failures.conflict409Count}
                      </p>
                      <p className="text-[9px] text-white/20 mt-1">High contention events</p>
                    </div>
                    <div className="bg-white/3 border border-white/5 rounded-xl p-3">
                      <p className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">410 Expiries</p>
                      <p className="text-xl font-extrabold text-white mt-1 font-mono">
                        {stats.analytics.failures.failedConfirmations}
                      </p>
                      <p className="text-[9px] text-white/20 mt-1">Post-expiry confirmations</p>
                    </div>
                    <div className="bg-white/3 border border-white/5 rounded-xl p-3">
                      <p className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">422 Zod Fails</p>
                      <p className="text-xl font-extrabold text-white mt-1 font-mono">
                        {stats.analytics.failures.failedReservations}
                      </p>
                      <p className="text-[9px] text-white/20 mt-1">Malformed body submissions</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Operational Alerts & Funnel Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                {/* Operational Health Alerts Panel */}
                <div className="bg-[#111115] border border-white/8 rounded-2xl p-6 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                      <h2 className="font-bold text-white text-base">Inventory Health Alerts</h2>
                    </div>
                    
                    <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                      {stats.healthAlerts.length === 0 ? (
                        <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10 text-emerald-400 text-xs font-semibold">
                          <CheckCircle2 className="w-4 h-4" />
                          All nodes report healthy thresholds.
                        </div>
                      ) : (
                        stats.healthAlerts.map((alert) => (
                          <div
                            key={alert.id}
                            className={`text-xs p-3 rounded-xl border leading-relaxed ${
                              alert.severity === 'high'
                                ? 'bg-red-500/5 border-red-500/20 text-red-400 font-medium'
                                : 'bg-amber-500/5 border-amber-500/20 text-amber-400'
                            }`}
                          >
                            {alert.message}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {/* Reservation Funnel Metrics */}
                <div className="bg-[#111115] border border-white/8 rounded-2xl p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Percent className="w-4 h-4 text-violet-400" />
                    <h2 className="font-bold text-white text-base">Conversion Funnel</h2>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs font-medium">
                        <span className="text-white/60">Sales Conversion Rate</span>
                        <span className="text-emerald-400 font-bold">{Math.round(stats.funnel.conversionRate)}%</span>
                      </div>
                      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-400" style={{ width: `${stats.funnel.conversionRate}%` }} />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-xs font-medium">
                        <span className="text-white/60">Cart Expiry Rate</span>
                        <span className="text-red-400 font-bold">{Math.round(stats.funnel.expiryRate)}%</span>
                      </div>
                      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-red-400" style={{ width: `${stats.funnel.expiryRate}%` }} />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-xs font-medium">
                        <span className="text-white/60">Manual Release Rate</span>
                        <span className="text-white/40 font-bold">{Math.round(stats.funnel.releasedRate)}%</span>
                      </div>
                      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-white/20" style={{ width: `${stats.funnel.releasedRate}%` }} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Concurrency Contention Monitor */}
                <div className="bg-[#111115] border border-white/8 rounded-2xl p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Flame className="w-4 h-4 text-red-400" />
                    <h2 className="font-bold text-white text-base">Concurrency Contention</h2>
                  </div>
                  
                  <div className="space-y-3 max-h-[220px] overflow-y-auto">
                    {stats.contentionMonitor.length === 0 ? (
                      <div className="text-xs text-white/30 text-center py-6">
                        No contention metrics logged.
                      </div>
                    ) : (
                      stats.contentionMonitor.map((item) => (
                        <div key={item.id} className="flex items-center justify-between gap-3 text-xs bg-white/3 border border-white/5 p-2.5 rounded-xl">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="font-bold text-white truncate">{item.name}</p>
                              {item.attempts > 2 && (
                                <span className="text-[9px] font-bold text-red-400 bg-red-500/10 px-1 rounded animate-pulse">🔥 Hot</span>
                              )}
                            </div>
                            <p className="text-[10px] text-white/30 font-mono mt-0.5">{item.sku}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <Badge variant="outline" className="border-red-500/20 text-red-400 bg-red-500/5 font-mono text-[10px]">
                              {item.attempts} holds
                            </Badge>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Holds activity split list */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2">
                  <div className="bg-[#111115] border border-white/8 rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-4">
                      <div className="flex items-center gap-2">
                        <Timer className="w-4 h-4 text-white/40" />
                        <h2 className="font-bold text-white text-lg">Active Checkout Locks</h2>
                      </div>
                      <Badge variant="outline" className="border-violet-500/20 text-violet-400 bg-violet-500/5">
                        {stats.recentReservations.filter(r => r.status === 'PENDING').length} active
                      </Badge>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-white/5 text-white/30 font-semibold">
                            <th className="py-3 px-2">Hold ID</th>
                            <th className="py-3 px-2">Product SKU</th>
                            <th className="py-3 px-2">Warehouse</th>
                            <th className="py-3 px-2">Quantity</th>
                            <th className="py-3 px-2">Expiry countdown</th>
                            <th className="py-3 px-2 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {stats.recentReservations.filter(r => r.status === 'PENDING').length === 0 ? (
                            <tr>
                              <td colSpan={6} className="text-center py-8 text-white/20 font-medium">
                                No active checkout holds right now. Try reserving from the catalog.
                              </td>
                            </tr>
                          ) : (
                            stats.recentReservations.filter(r => r.status === 'PENDING').map((res) => {
                              const expireMs = new Date(res.expiresAt).getTime() - Date.now();
                              const isClose = expireMs < 60_000;
                              return (
                                <tr key={res.id} className="hover:bg-white/2">
                                  <td className="py-4 px-2 font-mono font-bold text-white">
                                    #{res.id.slice(-8).toUpperCase()}
                                  </td>
                                  <td className="py-4 px-2">
                                    <div className="font-semibold text-white">{res.product.name}</div>
                                    <div className="text-[10px] text-white/30 font-mono mt-0.5">{res.product.sku}</div>
                                  </td>
                                  <td className="py-4 px-2 text-white/70">{res.warehouse.name}</td>
                                  <td className="py-4 px-2 text-white/70 font-mono">{res.quantity}</td>
                                  <td className={`py-4 px-2 font-mono ${isClose ? 'text-red-400 font-bold animate-pulse' : 'text-amber-400'}`}>
                                    {expireMs > 0 ? `${Math.ceil(expireMs / 1000)}s` : 'Expired'}
                                  </td>
                                  <td className="py-4 px-2 text-right">
                                    <div className="flex items-center justify-end gap-1.5">
                                      <Button
                                        size="sm"
                                        disabled={actioningId === res.id}
                                        onClick={() => handleExtendHold(res.id)}
                                        className="h-7 text-[10px] px-2.5 bg-white/5 border border-white/10 hover:bg-white/10 text-white rounded-lg"
                                      >
                                        +5m
                                      </Button>
                                      <Button
                                        size="sm"
                                        disabled={actioningId === res.id}
                                        onClick={() => handleForceRelease(res.id)}
                                        className="h-7 text-[10px] px-2.5 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-400 rounded-lg"
                                      >
                                        Release
                                      </Button>
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
                </div>

                {/* Audit log details / Timeline Panel */}
                <div className="space-y-6">
                  <div className="bg-[#111115] border border-white/8 rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-4">
                      <div className="flex items-center gap-2">
                        <History className="w-4 h-4 text-white/40" />
                        <h2 className="font-bold text-white text-base">Reservations History</h2>
                      </div>
                      <Badge variant="outline" className="border-white/10 text-white/40 font-mono text-[10px]">
                        Last 20
                      </Badge>
                    </div>

                    <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                      {stats.recentReservations.map((res) => {
                        const isSelected = selectedRes?.id === res.id;
                        return (
                          <div
                            key={res.id}
                            onClick={() => setSelectedRes(res)}
                            className={`p-3.5 rounded-xl border cursor-pointer hover:bg-white/2 transition-colors ${
                              isSelected
                                ? 'bg-white/[0.04] border-violet-500'
                                : 'bg-white/2 border-white/5'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 mb-1.5">
                              <span className="font-mono text-xs font-bold text-white">
                                #{res.id.slice(-8).toUpperCase()}
                              </span>
                              {getStatusBadge(res.status)}
                            </div>
                            <p className="text-[11px] font-semibold text-white/70 truncate">{res.product.name}</p>
                            <div className="flex justify-between items-center text-[10px] text-white/30 font-mono mt-2 pt-1.5 border-t border-white/5">
                              <span>Qty: {res.quantity}</span>
                              <span>{res.warehouse.name}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {selectedRes && (
                    <div className="bg-[#111115] border border-white/8 rounded-2xl p-6 animate-slide-up">
                      <div className="flex items-center justify-between border-b border-white/8 pb-4 mb-4">
                        <div className="flex items-center gap-2">
                          <TimelineIcon className="w-4 h-4 text-violet-400" />
                          <h3 className="font-bold text-white text-sm">
                            Audit Timeline for #{selectedRes.id.slice(-8).toUpperCase()}
                          </h3>
                        </div>
                        <button
                          onClick={() => setSelectedRes(null)}
                          className="text-white/30 hover:text-white/60 text-xs"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="space-y-4">
                        {selectedRes.metadata?.timeline && Array.isArray(selectedRes.metadata.timeline) ? (
                          <div className="relative border-l border-white/10 pl-4 ml-2 space-y-4">
                            {selectedRes.metadata.timeline.map((evt, idx) => (
                              <div key={idx} className="relative">
                                <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-violet-400" />
                                <div className="text-xs">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-bold text-white">{evt.event}</span>
                                    <span className="text-[9px] font-mono text-violet-400 bg-violet-500/5 px-1 py-0.5 rounded border border-violet-500/10">
                                      [{formatTimelineTime(evt.timestamp)}]
                                    </span>
                                  </div>
                                  <p className="text-white/40 text-[11px] mt-0.5 leading-relaxed">
                                    {evt.description}
                                  </p>
                                  <div className="text-[10px] text-white/20 mt-1">
                                    Actor: <span className="font-semibold">{evt.actor}</span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs text-white/30 text-center py-4 flex flex-col items-center justify-center gap-2">
                            <HelpCircle className="w-6 h-6 text-white/15" />
                            No timeline logs saved for this record.
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* TAB 2: SKU CATALOG MANAGEMENT */}
          {activeTab === 'catalog' && (
            <div className="bg-[#111115] border border-white/8 rounded-2xl p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b border-white/5 pb-4">
                <div>
                  <h2 className="font-bold text-white text-lg flex items-center gap-2">
                    <Package className="w-4 h-4 text-violet-400" />
                    Product Stock Keeping Units (SKUs)
                  </h2>
                  <p className="text-xs text-white/40 mt-1">Manage active catalog items, configure metadata, and archive/soft-delete products.</p>
                </div>
                <Button
                  onClick={() => setShowAddProduct(true)}
                  className="bg-violet-600 hover:bg-violet-700 text-white rounded-xl h-10 px-4 shrink-0 flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  Add New SKU
                </Button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-white/5 text-white/30 font-semibold">
                      <th className="py-3 px-2">SKU Details</th>
                      <th className="py-3 px-2">Base Price</th>
                      <th className="py-3 px-2">Warehouse Distributions</th>
                      <th className="py-3 px-2">Availability</th>
                      <th className="py-3 px-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {stats.products.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-8 text-white/20 font-medium">
                          No SKUs mapped in database yet.
                        </td>
                      </tr>
                    ) : (
                      stats.products.map((prod) => {
                        const totalStockInHand = prod.inventoryStocks.reduce((acc, s) => acc + s.totalQuantity, 0);
                        const isArchived = prod.archivedAt !== null;
                        return (
                          <tr key={prod.id} className={`hover:bg-white/2 ${isArchived ? 'opacity-50' : ''}`}>
                            <td className="py-4 px-2 max-w-sm">
                              <div className="flex items-start gap-3">
                                {prod.imageUrl ? (
                                  <img
                                    src={prod.imageUrl}
                                    alt={prod.name}
                                    className="w-10 h-10 object-cover rounded-lg border border-white/10 mt-0.5 shrink-0"
                                  />
                                ) : (
                                  <div className="w-10 h-10 bg-white/5 rounded-lg flex items-center justify-center border border-white/10 shrink-0 mt-0.5">
                                    <Package className="w-5 h-5 text-white/30" />
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-bold text-white truncate">{prod.name}</span>
                                    {isArchived && (
                                      <Badge variant="outline" className="border-red-500/30 text-red-400 text-[10px] py-0 px-1 bg-red-500/5">
                                        Archived (Soft Deleted)
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="font-mono text-[10px] text-violet-400 font-semibold mt-0.5">{prod.sku}</p>
                                  <p className="text-white/40 text-[10px] truncate mt-1 max-w-[240px]">{prod.description || 'No description provided'}</p>
                                </div>
                              </div>
                            </td>
                            <td className="py-4 px-2 font-mono font-bold text-white">
                              {formatPrice(prod.price)}
                            </td>
                            <td className="py-4 px-2">
                              <div className="flex flex-col gap-1">
                                <span className="font-semibold text-white/70">
                                  Total Stock: <span className="font-mono font-bold text-white">{totalStockInHand} units</span>
                                </span>
                                <div className="flex flex-wrap gap-1.5 mt-1">
                                  {prod.inventoryStocks.map((stock) => (
                                    <Badge key={stock.id} variant="outline" className="border-white/5 text-[9px] text-white/50 bg-white/2 py-0 px-1">
                                      {stock.warehouse.name}: {stock.totalQuantity}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            </td>
                            <td className="py-4 px-2">
                              {isArchived ? (
                                <Badge variant="outline" className="border-white/15 text-white/30">Inactive</Badge>
                              ) : prod.isActive ? (
                                <Badge variant="success">Active (Listed)</Badge>
                              ) : (
                                <Badge variant="warning">Recalled / Suspended</Badge>
                              )}
                            </td>
                            <td className="py-4 px-2 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {/* Toggle Availability Switch */}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={isArchived}
                                  onClick={() => handleToggleProductActive(prod.id, prod.isActive)}
                                  className={`h-8 w-8 p-0 rounded-lg ${
                                    prod.isActive
                                      ? 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10'
                                      : 'border-amber-500/30 text-amber-400 hover:bg-amber-500/10'
                                  }`}
                                  title={prod.isActive ? 'Suspend SKU Sale' : 'Resume SKU Sale'}
                                >
                                  {prod.isActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                                </Button>

                                {/* Soft Delete Toggle */}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleToggleProductArchived(prod.id, isArchived)}
                                  className={`h-8 w-8 p-0 rounded-lg ${
                                    isArchived
                                      ? 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10'
                                      : 'border-red-500/30 text-red-400 hover:bg-red-500/10'
                                  }`}
                                  title={isArchived ? 'Restore SKU to Catalog' : 'Archive SKU (Soft Delete)'}
                                >
                                  {isArchived ? <RefreshCw className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
                                </Button>
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

          {/* TAB 3: WAREHOUSES & STOCK CONTROL */}
          {activeTab === 'warehouses' && (
            <div className="space-y-6">
              <div className="bg-[#111115] border border-white/8 rounded-2xl p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b border-white/5 pb-4">
                  <div>
                    <h2 className="font-bold text-white text-lg flex items-center gap-2">
                      <Warehouse className="w-4 h-4 text-violet-400" />
                      Warehouse Capacity & Replenishment Control
                    </h2>
                    <p className="text-xs text-white/40 mt-1">Monitor occupancy levels, restock inventory stocks, log damages, and transfer stock.</p>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      onClick={() => setShowTransferStock(true)}
                      variant="outline"
                      className="border-violet-500/30 text-violet-400 hover:bg-violet-500/10 rounded-xl h-10 px-4 flex items-center gap-1.5"
                    >
                      <ArrowLeftRight className="w-4 h-4" />
                      Transfer Stock
                    </Button>

                    <Button
                      onClick={() => setShowAddWarehouse(true)}
                      className="bg-violet-600 hover:bg-violet-700 text-white rounded-xl h-10 px-4 flex items-center gap-1.5"
                    >
                      <Plus className="w-4 h-4" />
                      Add Warehouse
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6">
                  {stats.warehouses.map((wh) => (
                    <div key={wh.id} className="border border-white/8 rounded-xl bg-white/2 p-5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 border-b border-white/5 pb-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-white text-base">{wh.name}</h3>
                            <span className="text-xs text-white/30 font-mono">({wh.location})</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] text-white/30 uppercase tracking-widest font-semibold">Physical Occupancy:</span>
                            <span className="text-xs text-violet-400 font-bold">{wh.utilization}%</span>
                            <div className="w-20 h-1.5 bg-white/5 rounded-full overflow-hidden">
                              <div className="h-full bg-violet-400" style={{ width: `${wh.utilization}%` }} />
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 text-xs bg-white/3 border border-white/5 px-3 py-2 rounded-xl font-mono">
                          <div>
                            <span className="text-white/30 mr-1">Total Stock:</span>
                            <span className="text-white font-bold">{wh.totalQuantity}</span>
                          </div>
                          <div className="w-px h-3 bg-white/10" />
                          <div>
                            <span className="text-amber-400/40 mr-1">Reserved:</span>
                            <span className="text-amber-400 font-bold">{wh.reservedQuantity}</span>
                          </div>
                          <div className="w-px h-3 bg-white/10" />
                          <div>
                            <span className="text-emerald-400/40 mr-1">Available:</span>
                            <span className="text-emerald-400 font-bold">{wh.availableQuantity}</span>
                          </div>
                        </div>
                      </div>

                      {/* Stocks mapping */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {wh.stocks.map((stock) => {
                          const heldRatio = stock.totalQuantity > 0 ? stock.reservedQuantity / stock.totalQuantity : 0;
                          const ratioPercentage = Math.round(heldRatio * 100);
                          const isHot = (stats.contentionMonitor.find((c) => c.id === stock.productId)?.attempts ?? 0) > 2;
                          // Find matching stock record ID from the products list to pass to the adjustment modal
                          const matchedProduct = stats.products.find(p => p.id === stock.productId);
                          const matchedStockRecord = matchedProduct?.inventoryStocks.find(s => s.warehouseId === wh.id);
                          const stockRecordId = matchedStockRecord?.id || '';

                          return (
                            <div
                              key={stock.productId}
                              className="bg-white/2 border border-white/5 rounded-xl p-4 flex flex-col justify-between gap-3 hover:border-white/10 transition-all"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <p className="text-sm font-bold text-white truncate">
                                      {stock.productName}
                                    </p>
                                    {isHot && (
                                      <span className="text-[9px] font-bold text-red-400 bg-red-500/10 px-1 rounded animate-pulse shrink-0">🔥 Hot</span>
                                    )}
                                  </div>
                                  <p className="text-[10px] text-white/30 font-mono mt-0.5">
                                    {stock.productSku}
                                  </p>
                                </div>
                                <Badge className={`text-[10px] font-mono shrink-0 py-0.5 px-1.5 border ${getContentionColorClass(heldRatio)}`}>
                                  {ratioPercentage}% locked
                                </Badge>
                              </div>

                              <div className="space-y-1">
                                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden flex">
                                  <div
                                    className={`h-full transition-all duration-300 ${getContentionBarColorClass(heldRatio)}`}
                                    style={{ width: `${ratioPercentage}%` }}
                                  />
                                </div>
                                <div className="flex justify-between items-center text-[10px] text-white/30 font-mono">
                                  <span>Held: {stock.reservedQuantity}</span>
                                  <span>Avail: {stock.availableQuantity} / {stock.totalQuantity}</span>
                                </div>
                              </div>

                              <div className="pt-2 border-t border-white/5 flex items-center justify-end gap-1.5">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => stockRecordId && setShowAdjustStock({
                                    stockId: stockRecordId,
                                    currentQty: stock.totalQuantity,
                                    productName: stock.productName,
                                    warehouseName: wh.name
                                  })}
                                  className="h-7 text-[10px] border-violet-500/20 text-violet-400 hover:bg-violet-500/10 rounded-lg flex items-center gap-1"
                                >
                                  <Plus className="w-3 h-3" />
                                  Adjust Stock
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
            </div>
          )}

          {/* TAB 4: AUDIT LEDGER */}
          {activeTab === 'ledger' && (
            <div className="bg-[#111115] border border-white/8 rounded-2xl p-6">
              <div className="border-b border-white/5 pb-4 mb-6">
                <h2 className="font-bold text-white text-lg flex items-center gap-2">
                  <FileText className="w-4 h-4 text-violet-400" />
                  Inventory Adjustment Audit Ledger
                </h2>
                <p className="text-xs text-white/40 mt-1">Enterprise-grade compliance log tracking restocks, damage, corrections, and warehouse transfers.</p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-white/5 text-white/30 font-semibold">
                      <th className="py-3 px-2">Timestamp</th>
                      <th className="py-3 px-2">Product Details</th>
                      <th className="py-3 px-2">Warehouse</th>
                      <th className="py-3 px-2">Action Type</th>
                      <th className="py-3 px-2">Quantity delta</th>
                      <th className="py-3 px-2">Logged by</th>
                      <th className="py-3 px-2">Adjustment Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-medium text-white/80">
                    {stats.recentAdjustments.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-8 text-white/20 font-medium">
                          No stock adjustments logged in database yet.
                        </td>
                      </tr>
                    ) : (
                      stats.recentAdjustments.map((log) => {
                        const isPositive = log.quantity > 0;
                        const actionColors: Record<string, string> = {
                          RESTOCK: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
                          DAMAGE: 'text-red-400 bg-red-500/10 border-red-500/20',
                          CORRECTION: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
                          TRANSFER_IN: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
                          TRANSFER_OUT: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
                        };

                        return (
                          <tr key={log.id} className="hover:bg-white/2">
                            <td className="py-4 px-2 text-white/40 font-mono text-[10px]">
                              {formatDate(log.createdAt)}
                            </td>
                            <td className="py-4 px-2">
                              <div className="text-white font-bold">{log.stock.product.name}</div>
                              <div className="text-[10px] text-white/30 font-mono mt-0.5">{log.stock.product.sku}</div>
                            </td>
                            <td className="py-4 px-2 text-white/60">{log.stock.warehouse.name}</td>
                            <td className="py-4 px-2">
                              <Badge className={`text-[10px] font-semibold border ${actionColors[log.action] || 'border-white/10 text-white/50 bg-white/2'}`}>
                                {log.action}
                              </Badge>
                            </td>
                            <td className={`py-4 px-2 font-mono font-bold text-sm ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                              {isPositive ? `+${log.quantity}` : log.quantity}
                            </td>
                            <td className="py-4 px-2 text-white/50 font-mono flex items-center gap-1 mt-1.5">
                              <User className="w-3.5 h-3.5 text-white/25" />
                              {log.adminName}
                            </td>
                            <td className="py-4 px-2 text-white/40 italic">
                              {log.reason || 'None specified'}
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

          {/* MODALS */}
          
          {/* Modal 1: Add SKU Product */}
          {showAddProduct && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="bg-[#111115] border border-white/10 rounded-2xl max-w-md w-full p-6 space-y-4 animate-fade-in text-left">
                <div className="flex items-center justify-between border-b border-white/5 pb-3">
                  <h3 className="font-bold text-white text-base">Add New SKU to Catalog</h3>
                  <button onClick={() => setShowAddProduct(false)} className="text-white/40 hover:text-white/70">
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleAddProduct} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-wide">Product Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Ergonomic Orthopedic Bed Frame"
                      value={newProduct.name}
                      onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                      className="w-full bg-white/3 border border-white/8 rounded-xl px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-violet-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-white/40 uppercase tracking-wide">SKU identifier *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. ALLO-BF-009"
                        value={newProduct.sku}
                        onChange={(e) => setNewProduct({ ...newProduct, sku: e.target.value })}
                        className="w-full bg-white/3 border border-white/8 rounded-xl px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-violet-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-white/40 uppercase tracking-wide">Price (INR) *</label>
                      <input
                        type="number"
                        required
                        min="1"
                        placeholder="e.g. 14999"
                        value={newProduct.price}
                        onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
                        className="w-full bg-white/3 border border-white/8 rounded-xl px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-violet-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-wide">Image URL</label>
                    <input
                      type="url"
                      placeholder="https://images.unsplash.com/photo-..."
                      value={newProduct.imageUrl}
                      onChange={(e) => setNewProduct({ ...newProduct, imageUrl: e.target.value })}
                      className="w-full bg-white/3 border border-white/8 rounded-xl px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-violet-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-wide">Description</label>
                    <textarea
                      rows={2}
                      placeholder="Brief description of materials, sizes, and usage..."
                      value={newProduct.description}
                      onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })}
                      className="w-full bg-white/3 border border-white/8 rounded-xl px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-violet-500 resize-none"
                    />
                  </div>

                  <div className="flex gap-2.5 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowAddProduct(false)}
                      className="flex-1 rounded-xl h-10 border-white/10 text-white"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={isAddingProduct}
                      className="flex-1 rounded-xl h-10 bg-violet-600 hover:bg-violet-700 text-white"
                    >
                      {isAddingProduct ? 'Creating...' : 'Create SKU'}
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Modal 2: Add Warehouse */}
          {showAddWarehouse && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="bg-[#111115] border border-white/10 rounded-2xl max-w-md w-full p-6 space-y-4 animate-fade-in text-left">
                <div className="flex items-center justify-between border-b border-white/5 pb-3">
                  <h3 className="font-bold text-white text-base">Add New Warehouse Node</h3>
                  <button onClick={() => setShowAddWarehouse(false)} className="text-white/40 hover:text-white/70">
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleAddWarehouse} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-wide">Warehouse Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Hyderabad North"
                      value={newWarehouse.name}
                      onChange={(e) => setNewWarehouse({ ...newWarehouse, name: e.target.value })}
                      className="w-full bg-white/3 border border-white/8 rounded-xl px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-violet-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-wide">Location Address *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Secunderabad, Telangana"
                      value={newWarehouse.location}
                      onChange={(e) => setNewWarehouse({ ...newWarehouse, location: e.target.value })}
                      className="w-full bg-white/3 border border-white/8 rounded-xl px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-violet-500"
                    />
                  </div>

                  <div className="flex gap-2.5 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowAddWarehouse(false)}
                      className="flex-1 rounded-xl h-10 border-white/10 text-white"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={isAddingWarehouse}
                      className="flex-1 rounded-xl h-10 bg-violet-600 hover:bg-violet-700 text-white"
                    >
                      {isAddingWarehouse ? 'Adding...' : 'Add Node'}
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Modal 3: Adjust Inventory Stock */}
          {showAdjustStock && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="bg-[#111115] border border-white/10 rounded-2xl max-w-md w-full p-6 space-y-4 animate-fade-in text-left">
                <div className="flex items-center justify-between border-b border-white/5 pb-3">
                  <h3 className="font-bold text-white text-base">Adjust Stock Level</h3>
                  <button onClick={() => setShowAdjustStock(null)} className="text-white/40 hover:text-white/70">
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>

                <div className="bg-white/3 p-3.5 rounded-xl border border-white/5 space-y-1">
                  <div className="text-xs text-white/50">Product: <span className="font-bold text-white">{showAdjustStock.productName}</span></div>
                  <div className="text-xs text-white/50">Warehouse: <span className="font-bold text-white">{showAdjustStock.warehouseName}</span></div>
                  <div className="text-xs text-white/50">Current Total Quantity: <span className="font-mono font-bold text-violet-400">{showAdjustStock.currentQty} units</span></div>
                </div>

                <form onSubmit={handleAdjustStock} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-white/40 uppercase tracking-wide">Action Type *</label>
                      <select
                        value={stockAdjustment.action}
                        onChange={(e) => setStockAdjustment({ ...stockAdjustment, action: e.target.value as any })}
                        className="w-full bg-[#111115] border border-white/8 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                      >
                        <option value="RESTOCK">RESTOCK (+)</option>
                        <option value="DAMAGE">DAMAGE (-)</option>
                        <option value="CORRECTION">CORRECTION (+/-)</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-white/40 uppercase tracking-wide">Quantity Delta *</label>
                      <input
                        type="number"
                        required
                        min="1"
                        placeholder="e.g. 20"
                        value={stockAdjustment.quantityChange}
                        onChange={(e) => setStockAdjustment({ ...stockAdjustment, quantityChange: e.target.value })}
                        className="w-full bg-white/3 border border-white/8 rounded-xl px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-violet-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1 col-span-2">
                      <label className="text-[10px] font-bold text-white/40 uppercase tracking-wide">Admin Name *</label>
                      <input
                        type="text"
                        required
                        value={stockAdjustment.adminName}
                        onChange={(e) => setStockAdjustment({ ...stockAdjustment, adminName: e.target.value })}
                        className="w-full bg-white/3 border border-white/8 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-wide">Adjustment Reason / Notes</label>
                    <input
                      type="text"
                      placeholder="e.g. Regular monthly restock batch #5"
                      value={stockAdjustment.reason}
                      onChange={(e) => setStockAdjustment({ ...stockAdjustment, reason: e.target.value })}
                      className="w-full bg-white/3 border border-white/8 rounded-xl px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-violet-500"
                    />
                  </div>

                  <div className="flex items-start gap-2 text-[10px] text-white/30 bg-white/2 p-2.5 border border-white/5 rounded-lg leading-relaxed">
                    <Info className="w-4 h-4 shrink-0 text-violet-400 mt-0.5" />
                    <span>Decreases are subject to active holds validation to prevent over-allocation of locked client orders.</span>
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
                      className="flex-1 rounded-xl h-10 bg-violet-600 hover:bg-violet-700 text-white"
                    >
                      {isAdjustingStock ? 'Applying...' : 'Confirm Adjustment'}
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Modal 4: Transfer Stock */}
          {showTransferStock && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="bg-[#111115] border border-white/10 rounded-2xl max-w-md w-full p-6 space-y-4 animate-fade-in text-left">
                <div className="flex items-center justify-between border-b border-white/5 pb-3">
                  <h3 className="font-bold text-white text-base">Relocate Stock Between Warehouses</h3>
                  <button onClick={() => setShowTransferStock(false)} className="text-white/40 hover:text-white/70">
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleTransferStock} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-wide">Select Product SKU *</label>
                    <select
                      required
                      value={stockTransfer.productId}
                      onChange={(e) => setStockTransfer({ ...stockTransfer, productId: e.target.value })}
                      className="w-full bg-[#111115] border border-white/8 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                    >
                      <option value="">-- Choose Product --</option>
                      {stats.products.filter(p => p.archivedAt === null).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.sku})
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
                        className="w-full bg-[#111115] border border-white/8 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                      >
                        <option value="">-- Source WH --</option>
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
                        className="w-full bg-[#111115] border border-white/8 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                      >
                        <option value="">-- Destination WH --</option>
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
                      <label className="text-[10px] font-bold text-white/40 uppercase tracking-wide">Transfer Quantity *</label>
                      <input
                        type="number"
                        required
                        min="1"
                        placeholder="e.g. 50"
                        value={stockTransfer.quantity}
                        onChange={(e) => setStockTransfer({ ...stockTransfer, quantity: e.target.value })}
                        className="w-full bg-white/3 border border-white/8 rounded-xl px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-violet-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-white/40 uppercase tracking-wide">Admin Name *</label>
                      <input
                        type="text"
                        required
                        value={stockTransfer.adminName}
                        onChange={(e) => setStockTransfer({ ...stockTransfer, adminName: e.target.value })}
                        className="w-full bg-white/3 border border-white/8 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-wide">Transfer Reason</label>
                    <input
                      type="text"
                      placeholder="e.g. Balancing stock due to Mumbai demand spike"
                      value={stockTransfer.reason}
                      onChange={(e) => setStockTransfer({ ...stockTransfer, reason: e.target.value })}
                      className="w-full bg-white/3 border border-white/8 rounded-xl px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-violet-500"
                    />
                  </div>

                  <div className="flex items-start gap-2 text-[10px] text-white/30 bg-white/2 p-2.5 border border-white/5 rounded-lg leading-relaxed">
                    <Info className="w-4 h-4 shrink-0 text-violet-400 mt-0.5" />
                    <span>Row locking is applied sequentially by database CUID to prevent concurrent deadlocks. Available stock at source warehouse is checked transactionally.</span>
                  </div>

                  <div className="flex gap-2.5 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowTransferStock(false)}
                      className="flex-1 rounded-xl h-10 border-white/10 text-white"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={isTransferringStock}
                      className="flex-1 rounded-xl h-10 bg-violet-600 hover:bg-violet-700 text-white"
                    >
                      {isTransferringStock ? 'Relocating...' : 'Confirm Transfer'}
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
