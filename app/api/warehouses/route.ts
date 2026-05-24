import { NextRequest } from 'next/server';
import { inventoryService } from '@/services/inventory.service';

/**
 * GET /api/warehouses
 * Returns all warehouses.
 */
export async function GET(_req: NextRequest) {
  try {
    const warehouses = await inventoryService.listWarehouses();
    return Response.json({ data: warehouses }, { status: 200 });
  } catch (err) {
    console.error('[GET /api/warehouses]', err);
    return Response.json(
      { error: 'INTERNAL_SERVER_ERROR', message: 'Failed to fetch warehouses' },
      { status: 500 },
    );
  }
}

export const dynamic = 'force-dynamic';
