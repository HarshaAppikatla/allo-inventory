import { NextRequest } from 'next/server';
import { inventoryService } from '@/services/inventory.service';

/**
 * GET /api/products
 * Returns all products with per-warehouse available stock.
 */
export async function GET(_req: NextRequest) {
  try {
    const products = await inventoryService.listProducts();
    return Response.json({ data: products }, { status: 200 });
  } catch (err) {
    console.error('[GET /api/products]', err);
    return Response.json(
      { error: 'INTERNAL_SERVER_ERROR', message: 'Failed to fetch products' },
      { status: 500 },
    );
  }
}

export const dynamic = 'force-dynamic';
