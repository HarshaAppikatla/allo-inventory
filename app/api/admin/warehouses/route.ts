import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const CreateWarehouseSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  location: z.string().min(1, 'Location is required'),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = CreateWarehouseSchema.parse(body);

    const newWarehouse = await prisma.$transaction(async (tx) => {
      // 1. Create the warehouse record
      const warehouse = await tx.warehouse.create({
        data: {
          name: input.name,
          location: input.location,
        },
      });

      // 2. Fetch all existing products
      const products = await tx.product.findMany({ select: { id: true } });

      // 3. Create default stock records (0 total, 0 reserved) for every product
      if (products.length > 0) {
        await tx.inventoryStock.createMany({
          data: products.map((prod) => ({
            productId: prod.id,
            warehouseId: warehouse.id,
            totalQuantity: 0,
            reservedQuantity: 0,
          })),
        });
      }

      return warehouse;
    });

    return NextResponse.json({
      success: true,
      data: newWarehouse,
      message: `Warehouse "${newWarehouse.name}" created successfully and mapped to all SKUs.`,
    });
  } catch (error) {
    console.error('[POST /api/admin/warehouses] Error:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', issues: error.issues },
        { status: 422 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to create warehouse' },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';
