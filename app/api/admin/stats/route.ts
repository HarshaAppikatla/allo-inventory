import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authorizeRequest } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const auth = await authorizeRequest(req, ['ADMIN', 'SERVICE_PROVIDER']);
  if (!auth.authorized) return auth.response!;

  const startTime = Date.now();
  try {
    const dbQueryStart = Date.now();

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    interface AvgDurationRow {
      avg_seconds: number | null;
    }

    interface RevenueAggregatesRow {
      total_revenue: number | null;
      daily_revenue: number | null;
    }

    interface WarehouseRevenueRow {
      warehouse_id: string;
      revenue: number | null;
    }

    const [
      stockAggregates,
      statusCounts,
      idempotencyCounts,
      avgCheckoutResult,
      avgExpiryResult,
      revenueResult,
      warehouseRevenueResult,
      expiredLastHour,
      attemptsByProduct,
      products,
      warehouses,
      recentReservations,
      recentAdjustments,
      allProducts
    ] = await Promise.all([
      // 1. Basic Stock Aggregates
      prisma.inventoryStock.aggregate({
        _sum: {
          totalQuantity: true,
          reservedQuantity: true,
        },
      }),
      // 2. Status Counts
      prisma.reservation.groupBy({
        by: ['status'],
        _count: { id: true },
      }),
      // 3. Idempotency failure counts
      prisma.idempotencyRecord.groupBy({
        by: ['statusCode'],
        _count: { id: true },
        where: { statusCode: { in: [422, 410, 409] } },
      }),
      // 4. Avg Checkout Duration
      prisma.$queryRaw<AvgDurationRow[]>`
        SELECT AVG(EXTRACT(EPOCH FROM (confirmed_at - created_at))) as avg_seconds
        FROM reservations
        WHERE status = 'CONFIRMED' AND confirmed_at IS NOT NULL
      `,
      // 5. Avg Expiry Duration
      prisma.$queryRaw<AvgDurationRow[]>`
        SELECT AVG(EXTRACT(EPOCH FROM (released_at - created_at))) as avg_seconds
        FROM reservations
        WHERE status = 'EXPIRED' AND released_at IS NOT NULL
      `,
      // 6. Total and Daily Revenue
      prisma.$queryRaw<RevenueAggregatesRow[]>`
        SELECT 
          SUM(r.quantity * COALESCE(NULLIF(r.unit_price, 0), p.price)) as total_revenue,
          SUM(CASE WHEN r.confirmed_at >= ${startOfToday} THEN r.quantity * COALESCE(NULLIF(r.unit_price, 0), p.price) ELSE 0 END) as daily_revenue
        FROM reservations r
        JOIN products p ON r.product_id = p.id
        WHERE r.status = 'CONFIRMED'
      `,
      // 7. Warehouse Revenue Breakdown
      prisma.$queryRaw<WarehouseRevenueRow[]>`
        SELECT 
          r.warehouse_id,
          SUM(r.quantity * COALESCE(NULLIF(r.unit_price, 0), p.price)) as revenue
        FROM reservations r
        JOIN products p ON r.product_id = p.id
        WHERE r.status = 'CONFIRMED'
        GROUP BY r.warehouse_id
      `,
      // 8. Expired Last Hour
      prisma.reservation.count({
        where: {
          status: 'EXPIRED',
          releasedAt: { gte: oneHourAgo },
        },
      }),
      // 9. Attempts by Product (Contention monitor)
      prisma.reservation.groupBy({
        by: ['productId'],
        _count: { id: true },
        _sum: { quantity: true },
      }),
      // 10. Product Names and SKUs
      prisma.product.findMany({
        select: { id: true, name: true, sku: true },
      }),
      // 11. Warehouse Stocks and Nested Products
      prisma.warehouse.findMany({
        include: {
          inventoryStocks: {
            include: {
              product: {
                select: { id: true, name: true, sku: true, price: true },
              },
            },
          },
        },
        orderBy: { name: 'asc' },
      }),
      // 12. Recent Reservations Log (take 20)
      prisma.reservation.findMany({
        take: 20,
        orderBy: { createdAt: 'desc' },
        include: {
          product: { select: { name: true, sku: true } },
          warehouse: { select: { name: true } },
        },
      }),
      // 13. Recent Adjustments Log (take 20)
      prisma.inventoryAdjustment.findMany({
        take: 20,
        orderBy: { createdAt: 'desc' },
        include: {
          stock: {
            include: {
              product: { select: { name: true, sku: true } },
              warehouse: { select: { name: true } },
            },
          },
        },
      }),
      // 14. All Products Management (with stocks)
      prisma.product.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          inventoryStocks: {
            include: {
              warehouse: { select: { name: true } },
            },
          },
        },
      }),
    ]);

    const dbDuration = Date.now() - dbQueryStart;

    // Process Basic Stock Aggregates
    const totalStock = stockAggregates._sum.totalQuantity ?? 0;
    const reservedStock = stockAggregates._sum.reservedQuantity ?? 0;
    const availableStock = Math.max(0, totalStock - reservedStock);

    // Process Status Counts
    let pendingCount = 0;
    let confirmedCount = 0;
    let releasedCount = 0;
    let expiredCount = 0;

    statusCounts.forEach((item) => {
      if (item.status === 'PENDING') pendingCount = item._count.id;
      else if (item.status === 'CONFIRMED') confirmedCount = item._count.id;
      else if (item.status === 'RELEASED') releasedCount = item._count.id;
      else if (item.status === 'EXPIRED') expiredCount = item._count.id;
    });

    const totalReservations = pendingCount + confirmedCount + releasedCount + expiredCount;

    // Process Idempotency Failure Counts
    let failedReservationsCount = 0;
    let failedConfirmationsCount = 0;
    let conflict409Count = 0;

    idempotencyCounts.forEach((item) => {
      if (item.statusCode === 422) failedReservationsCount = item._count.id;
      else if (item.statusCode === 410) failedConfirmationsCount = item._count.id;
      else if (item.statusCode === 409) conflict409Count = item._count.id;
    });

    // Process Averages
    const avgCheckoutTimeSec = avgCheckoutResult[0]?.avg_seconds ? Math.round(Number(avgCheckoutResult[0].avg_seconds)) : 0;
    const avgExpiryTimeSec = avgExpiryResult[0]?.avg_seconds ? Math.round(Number(avgExpiryResult[0].avg_seconds)) : 0;

    // Process Revenue
    const totalRevenue = revenueResult[0]?.total_revenue ? Number(revenueResult[0].total_revenue) : 0;
    const dailyRevenue = revenueResult[0]?.daily_revenue ? Number(revenueResult[0].daily_revenue) : 0;

    const revenuePerWarehouse: Record<string, number> = {};
    warehouseRevenueResult.forEach((row) => {
      if (row.warehouse_id && row.revenue) {
        revenuePerWarehouse[row.warehouse_id] = Number(row.revenue);
      }
    });

    // Funnel metrics
    const conversionRate = totalReservations > 0 ? (confirmedCount / totalReservations) * 100 : 0;
    const expiryRate = totalReservations > 0 ? (expiredCount / totalReservations) * 100 : 0;
    const releasedRate = totalReservations > 0 ? (releasedCount / totalReservations) * 100 : 0;

    // Process Contention Monitor
    const contentionMonitor = attemptsByProduct
      .map((item) => {
        const prod = products.find((p) => p.id === item.productId);
        return {
          id: item.productId,
          name: prod?.name ?? 'Unknown Product',
          sku: prod?.sku ?? 'UNKNOWN',
          attempts: item._count.id,
          totalQuantityRequested: item._sum.quantity ?? 0,
        };
      })
      .sort((a, b) => b.attempts - a.attempts)
      .slice(0, 5);

    // Process Warehouses & Health Alerts
    const healthAlerts: Array<{
      id: string;
      type: 'critical_stock' | 'low_stock' | 'high_contention' | 'expired_spike';
      severity: 'high' | 'medium' | 'info';
      message: string;
      timestamp: string;
    }> = [];

    const warehouseData = warehouses.map((wh) => {
      let whTotal = 0;
      let whReserved = 0;

      const stocks = wh.inventoryStocks.map((stock) => {
        whTotal += stock.totalQuantity;
        whReserved += stock.reservedQuantity;

        const available = Math.max(0, stock.totalQuantity - stock.reservedQuantity);
        const reservationRatio = stock.totalQuantity > 0 ? stock.reservedQuantity / stock.totalQuantity : 0;

        // Health evaluations
        if (stock.totalQuantity > 0) {
          if (available === 0) {
            healthAlerts.push({
              id: `crit-${wh.id}-${stock.productId}`,
              type: 'critical_stock',
              severity: 'high',
              message: `OUT OF STOCK: "${stock.product.name}" at ${wh.name} has 0 units available.`,
              timestamp: new Date().toISOString(),
            });
          } else if (available < 5) {
            healthAlerts.push({
              id: `low-${wh.id}-${stock.productId}`,
              type: 'low_stock',
              severity: 'medium',
              message: `LOW STOCK: Only ${available} units left of "${stock.product.name}" at ${wh.name}.`,
              timestamp: new Date().toISOString(),
            });
          }

          if (reservationRatio > 0.8 && available > 0) {
            healthAlerts.push({
              id: `cont-${wh.id}-${stock.productId}`,
              type: 'high_contention',
              severity: 'high',
              message: `HIGH CONTENTION: ${Math.round(reservationRatio * 100)}% of "${stock.product.name}" at ${wh.name} is currently locked by pending transactions.`,
              timestamp: new Date().toISOString(),
            });
          }
        }

        return {
          productId: stock.product.id,
          productName: stock.product.name,
          productSku: stock.product.sku,
          productPrice: stock.product.price.toString(),
          totalQuantity: stock.totalQuantity,
          reservedQuantity: stock.reservedQuantity,
          availableQuantity: available,
        };
      });

      const maxCapacity = 500;
      const utilization = Math.min(100, Math.round((whTotal / maxCapacity) * 100));

      return {
        id: wh.id,
        name: wh.name,
        location: wh.location,
        totalQuantity: whTotal,
        reservedQuantity: whReserved,
        availableQuantity: Math.max(0, whTotal - whReserved),
        utilization,
        stocks,
      };
    });

    if (expiredLastHour > 10) {
      healthAlerts.push({
        id: `spike-expiry`,
        type: 'expired_spike',
        severity: 'medium',
        message: `EXPIRY SPIKE: ${expiredLastHour} holds expired in the last hour. Possible checkout friction or payment gateway delays.`,
        timestamp: new Date().toISOString(),
      });
    }

    const serializedProducts = allProducts.map((p) => ({
      ...p,
      price: p.price.toString(),
    }));

    const totalDuration = Date.now() - startTime;

    return NextResponse.json(
      {
        success: true,
        stats: {
          totalStock,
          reservedStock,
          availableStock,
          counts: {
            pending: pendingCount,
            confirmed: confirmedCount,
            released: releasedCount,
            expired: expiredCount,
            total: totalReservations,
          },
          funnel: {
            conversionRate,
            expiryRate,
            releasedRate,
          },
          expiryTrends: {
            expiredLastHour,
          },
          analytics: {
            avgCheckoutTimeSec,
            avgExpiryTimeSec,
            failures: {
              failedReservations: failedReservationsCount,
              failedConfirmations: failedConfirmationsCount,
              conflict409Count: conflict409Count,
            },
          },
          contentionMonitor,
          warehouses: warehouseData,
          recentReservations,
          recentAdjustments,
          products: serializedProducts,
          healthAlerts,
          revenue: {
            totalRevenue,
            dailyRevenue,
            revenuePerWarehouse,
          },
          performance: {
            dbQueryDurationMs: dbDuration,
            apiLatencyMs: totalDuration,
          },
          systemStatus: {
            databaseConnected: true,
            cronActive: true,
          },
        },
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=30, stale-while-revalidate=59',
        },
      }
    );
  } catch (error) {
    console.error('[GET /api/admin/stats] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch admin stats',
        systemStatus: { databaseConnected: false, cronActive: false },
        performance: { apiLatencyMs: Date.now() - startTime },
      },
      { status: 500 }
    );
  }
}

export const revalidate = 30;
