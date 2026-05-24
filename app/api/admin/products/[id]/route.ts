import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { authorizeRequest } from '@/lib/auth';

const UpdateProductSchema = z.object({
  name: z.string().min(1).optional(),
  sku: z.string().min(1).optional(),
  price: z.number().positive().optional(),
  description: z.string().optional(),
  imageUrl: z.string().url().optional().or(z.literal('')),
  isActive: z.boolean().optional(),
  isArchived: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await authorizeRequest(req, ['ADMIN']);
  if (!auth.authorized) return auth.response!;

  try {
    const productId = params.id;
    const body = await req.json();
    const input = UpdateProductSchema.parse(body);

    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.product.findUnique({
        where: { id: productId },
      });

      if (!existing) {
        throw new Error('Product not found');
      }

      const updateData: Record<string, any> = {};
      if (input.name !== undefined) updateData.name = input.name;
      if (input.sku !== undefined) updateData.sku = input.sku.toUpperCase();
      if (input.price !== undefined) updateData.price = input.price;
      if (input.description !== undefined) updateData.description = input.description || null;
      if (input.imageUrl !== undefined) updateData.imageUrl = input.imageUrl || null;
      if (input.isActive !== undefined) updateData.isActive = input.isActive;
      
      if (input.isArchived !== undefined) {
        if (input.isArchived) {
          updateData.archivedAt = new Date();
          updateData.isActive = false; // automatically disable archived products
        } else {
          updateData.archivedAt = null;
          updateData.isActive = true;
        }
      }

      return await tx.product.update({
        where: { id: productId },
        data: updateData,
      });
    });

    return NextResponse.json({
      success: true,
      data: updated,
      message: `Product "${updated.name}" updated successfully.`,
    });
  } catch (error) {
    console.error('[PATCH /api/admin/products/[id]] Error:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', issues: error.issues },
        { status: 422 }
      );
    }
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to update product' },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';
