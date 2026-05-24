import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { authorizeRequest } from '@/lib/auth';

const UpdateStockSchema = z.object({
  quantityChange: z.number().int('Quantity change must be an integer'),
  action: z.enum(['RESTOCK', 'DAMAGE', 'CORRECTION']),
  reason: z.string().optional(),
  adminName: z.string().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await authorizeRequest(req, ['ADMIN', 'SERVICE_PROVIDER']);
  if (!auth.authorized) return auth.response!;

  try {
    const stockId = params.id;
    const body = await req.json();
    const input = UpdateStockSchema.parse(body);

    const result = await prisma.$transaction(async (tx) => {
      // 1. Acquire row lock on the inventory stock
      await tx.$queryRaw`
        SELECT id FROM inventory_stocks WHERE id = ${stockId} FOR UPDATE
      `;

      const stock = await tx.inventoryStock.findUnique({
        where: { id: stockId },
        include: {
          product: { select: { name: true } },
          warehouse: { select: { name: true } },
        },
      });

      if (!stock) {
        throw new Error('Inventory stock record not found');
      }

      // 2. Compute new total quantity
      const newTotal = stock.totalQuantity + input.quantityChange;

      // 3. Enforce stock invariants: totalQuantity must not go below reserved quantity (available must not be negative)
      if (newTotal < stock.reservedQuantity) {
        throw new Error(
          `Cannot reduce stock by ${Math.abs(input.quantityChange)} units. ${
            stock.reservedQuantity
          } units are currently reserved by pending checkouts (Available stock: ${
            stock.totalQuantity - stock.reservedQuantity
          }).`
        );
      }

      if (newTotal < 0) {
        throw new Error(`Total stock quantity cannot be negative (Attempted total: ${newTotal}).`);
      }

      // 4. Update the stock quantity
      const updatedStock = await tx.inventoryStock.update({
        where: { id: stockId },
        data: {
          totalQuantity: newTotal,
        },
      });

      // 5. Log the adjustment ledger entry
      const log = await tx.inventoryAdjustment.create({
        data: {
          stockId: stock.id,
          action: input.action,
          quantity: input.quantityChange,
          reason: input.reason || null,
          adminName: input.adminName || 'Admin',
        },
      });

      return { updatedStock, log, stock };
    });

    const isAdd = input.quantityChange > 0;
    const direction = isAdd ? 'added to' : 'removed from';
    const absQty = Math.abs(input.quantityChange);

    return NextResponse.json({
      success: true,
      data: result.updatedStock,
      message: `Successfully adjusted stock. ${absQty} unit(s) ${direction} "${result.stock.product.name}" at ${result.stock.warehouse.name}.`,
    });
  } catch (error) {
    console.error('[PATCH /api/admin/inventory/[id]] Error:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', issues: error.issues },
        { status: 422 }
      );
    }
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to adjust stock' },
      { status: 400 }
    );
  }
}

export const dynamic = 'force-dynamic';
