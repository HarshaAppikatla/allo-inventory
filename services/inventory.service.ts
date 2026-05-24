import { prisma } from '@/lib/prisma';

// ---------------------------------------------------------------------------
// Inventory Service
// ---------------------------------------------------------------------------

export const inventoryService = {
  /**
   * Return all products with their per-warehouse stock levels.
   * Available quantity is computed as totalQuantity - reservedQuantity.
   */
  async listProducts() {
    const [products, reservationAttempts] = await Promise.all([
      prisma.product.findMany({
        where: {
          isActive: true,
          archivedAt: null,
        },
        orderBy: { createdAt: 'asc' },
        include: {
          inventoryStocks: {
            include: { warehouse: true },
            orderBy: { warehouse: { name: 'asc' } },
          },
        },
      }),
      prisma.reservation.groupBy({
        by: ['productId'],
        _count: {
          id: true,
        },
      }),
    ]);

    const attemptMap = new Map(
      reservationAttempts.map((item) => [item.productId, item._count.id])
    );

    return products.map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      description: p.description,
      imageUrl: p.imageUrl,
      price: p.price.toString(),
      isHot: (attemptMap.get(p.id) ?? 0) > 2,
      stocks: p.inventoryStocks.map((s) => ({
        warehouseId: s.warehouseId,
        warehouseName: s.warehouse.name,
        warehouseLocation: s.warehouse.location,
        totalQuantity: s.totalQuantity,
        reservedQuantity: s.reservedQuantity,
        availableQuantity: s.totalQuantity - s.reservedQuantity,
      })),
    }));
  },

  /**
   * Return all warehouses.
   */
  async listWarehouses() {
    return await prisma.warehouse.findMany({
      orderBy: { name: 'asc' },
      include: {
        inventoryStocks: {
          include: { product: true },
        },
      },
    });
  },
};
