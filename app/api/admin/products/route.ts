import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { authorizeRequest } from '@/lib/auth';

const CreateProductSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  sku: z.string().min(1, 'SKU is required'),
  price: z.number().positive('Price must be positive'),
  description: z.string().optional(),
  imageUrl: z.string().url('Invalid image URL').optional().or(z.literal('')),
});

export async function POST(req: NextRequest) {
  const auth = await authorizeRequest(req, ['ADMIN']);
  if (!auth.authorized) return auth.response!;

  try {
    const body = await req.json();
    const input = CreateProductSchema.parse(body);

    // Create the product and link it to all existing warehouses with 0 stock
    const newProduct = await prisma.$transaction(async (tx) => {
      // 1. Create the product record
      const product = await tx.product.create({
        data: {
          name: input.name,
          sku: input.sku.toUpperCase(),
          price: input.price,
          description: input.description || null,
          imageUrl: input.imageUrl || null,
          isActive: true,
        },
      });

      // 2. Fetch all existing warehouses
      const warehouses = await tx.warehouse.findMany({ select: { id: true } });

      // 3. Create default stock records (0 total, 0 reserved) for every warehouse
      if (warehouses.length > 0) {
        await tx.inventoryStock.createMany({
          data: warehouses.map((wh) => ({
            productId: product.id,
            warehouseId: wh.id,
            totalQuantity: 0,
            reservedQuantity: 0,
          })),
        });
      }

      return product;
    });

    return NextResponse.json({
      success: true,
      data: newProduct,
      message: `Product "${newProduct.name}" created successfully and initialized across all warehouses.`,
    });
  } catch (error) {
    console.error('[POST /api/admin/products] Error:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', issues: error.issues },
        { status: 422 }
      );
    }
    // Check for unique SKU constraint violation
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      return NextResponse.json(
        { success: false, error: 'A product with this SKU already exists.' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to create product' },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';
