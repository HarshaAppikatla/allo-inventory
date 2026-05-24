import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { authorizeRequest } from '@/lib/auth';

const TransferStockSchema = z.object({
  productId: z.string().min(1, 'Product ID is required'),
  sourceWarehouseId: z.string().min(1, 'Source warehouse ID is required'),
  destinationWarehouseId: z.string().min(1, 'Destination warehouse ID is required'),
  quantity: z.number().int().positive('Transfer quantity must be a positive integer'),
  reason: z.string().optional(),
  adminName: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const auth = await authorizeRequest(req, ['ADMIN', 'SERVICE_PROVIDER']);
  if (!auth.authorized) return auth.response!;

  try {
    const body = await req.json();
    const input = TransferStockSchema.parse(body);

    if (input.sourceWarehouseId === input.destinationWarehouseId) {
      return NextResponse.json(
        { success: false, error: 'Source and destination warehouses must be different.' },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Fetch stock records
      const sourceStock = await tx.inventoryStock.findUnique({
        where: {
          productId_warehouseId: {
            productId: input.productId,
            warehouseId: input.sourceWarehouseId,
          },
        },
        include: {
          product: { select: { name: true } },
          warehouse: { select: { name: true } },
        },
      });

      const destStock = await tx.inventoryStock.findUnique({
        where: {
          productId_warehouseId: {
            productId: input.productId,
            warehouseId: input.destinationWarehouseId,
          },
        },
        include: {
          warehouse: { select: { name: true } },
        },
      });

      if (!sourceStock || !destStock) {
        throw new Error('Inventory stock record not mapped in source or destination warehouse.');
      }

      // 2. Deadlock Prevention: Lock rows in sorted order by CUID
      const sortedIds = [sourceStock.id, destStock.id].sort((a, b) => a.localeCompare(b));
      for (const id of sortedIds) {
        await tx.$queryRaw`
          SELECT id FROM inventory_stocks WHERE id = ${id} FOR UPDATE
        `;
      }

      // 3. Verify source availability
      const sourceAvailable = sourceStock.totalQuantity - sourceStock.reservedQuantity;
      if (sourceAvailable < input.quantity) {
        throw new Error(
          `Insufficient stock at "${sourceStock.warehouse.name}". Available: ${sourceAvailable} units (Attempted transfer: ${input.quantity}).`
        );
      }

      // 4. Update source warehouse (subtract stock)
      const updatedSource = await tx.inventoryStock.update({
        where: { id: sourceStock.id },
        data: {
          totalQuantity: sourceStock.totalQuantity - input.quantity,
        },
      });

      // 5. Update destination warehouse (add stock)
      const updatedDest = await tx.inventoryStock.update({
        where: { id: destStock.id },
        data: {
          totalQuantity: destStock.totalQuantity + input.quantity,
        },
      });

      // 6. Log two adjustment ledger entries
      const admin = input.adminName || 'Admin';
      const reason = input.reason || 'Warehouse stock relocation';

      await tx.inventoryAdjustment.createMany({
        data: [
          {
            stockId: sourceStock.id,
            action: 'TRANSFER_OUT',
            quantity: -input.quantity,
            reason: `${reason} (Dest: ${destStock.warehouse.name})`,
            adminName: admin,
          },
          {
            stockId: destStock.id,
            action: 'TRANSFER_IN',
            quantity: input.quantity,
            reason: `${reason} (Source: ${sourceStock.warehouse.name})`,
            adminName: admin,
          },
        ],
      });

      return { sourceStock, destStock, updatedSource, updatedDest };
    });

    return NextResponse.json({
      success: true,
      message: `Successfully transferred ${input.quantity} unit(s) of "${result.sourceStock.product.name}" from ${result.sourceStock.warehouse.name} to ${result.destStock.warehouse.name}.`,
    });
  } catch (error) {
    console.error('[POST /api/admin/inventory/transfer] Error:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', issues: error.issues },
        { status: 422 }
      );
    }
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to transfer inventory' },
      { status: 400 }
    );
  }
}

export const dynamic = 'force-dynamic';
