import { NextRequest } from 'next/server';
import { ZodError } from 'zod';
import { CreateReservationSchema } from '@/schemas/reservation.schema';
import { reservationService } from '@/services/reservation.service';
import {
  getIdempotencyRecord,
  storeIdempotencyRecord,
  buildReplayResponse,
} from '@/lib/idempotency';
import {
  AppError,
  InsufficientStockError,
  NotFoundError,
} from '@/lib/errors';

/**
 * POST /api/reservations
 *
 * Creates a new inventory reservation.
 *
 * Request headers:
 *   Idempotency-Key: <client-generated unique key>  (optional, enables safe retries)
 *
 * Request body:
 *   { productId, warehouseId, quantity, metadata? }
 *
 * Responses:
 *   201 Created    – reservation created
 *   409 Conflict   – insufficient stock
 *   404 Not Found  – product/warehouse not found
 *   422 Unprocessable Entity – validation failed
 */
export async function POST(req: NextRequest) {
  const idempotencyKey = req.headers.get('idempotency-key') ?? undefined;

  // ——— Idempotency: check for a previously stored response —————————————
  if (idempotencyKey) {
    const cached = await getIdempotencyRecord(idempotencyKey);
    if (cached) return buildReplayResponse(cached);
  }

  // ——— Parse + validate body ————————————————————————————————
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { error: 'BAD_REQUEST', message: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  let input;
  try {
    input = CreateReservationSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return Response.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          issues: err.issues,
        },
        { status: 422 },
      );
    }
    throw err;
  }

  // ——— Execute reservation ————————————————————————————————
  try {
    const reservation = await reservationService.createReservation(
      input,
      idempotencyKey,
    );

    const responseBody = { data: reservation };
    const statusCode = 201;

    if (idempotencyKey) {
      await storeIdempotencyRecord(idempotencyKey, statusCode, responseBody);
    }

    return Response.json(responseBody, { status: statusCode });
  } catch (err) {
    if (err instanceof InsufficientStockError) {
      const responseBody = { error: err.code, message: err.message };
      const statusCode = 409;

      // Cache 409s too – the stock state was consistent at time of request
      if (idempotencyKey) {
        await storeIdempotencyRecord(idempotencyKey, statusCode, responseBody);
      }

      return Response.json(responseBody, { status: statusCode });
    }

    if (err instanceof NotFoundError) {
      return Response.json(
        { error: err.code, message: err.message },
        { status: 404 },
      );
    }

    if (err instanceof AppError) {
      return Response.json(
        { error: err.code, message: err.message },
        { status: err.statusCode },
      );
    }

    console.error('[POST /api/reservations]', err);
    return Response.json(
      { error: 'INTERNAL_SERVER_ERROR', message: 'Reservation failed' },
      { status: 500 },
    );
  }
}

/**
 * GET /api/reservations
 * Returns all reservations with their products and warehouses.
 */
export async function GET(_req: NextRequest) {
  try {
    const prismaModule = await import('@/lib/prisma');
    const db = prismaModule.prisma;
    
    const reservations = await db.reservation.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        product: {
          select: { id: true, name: true, sku: true, imageUrl: true, price: true },
        },
        warehouse: {
          select: { id: true, name: true, location: true },
        },
      },
    });

    const serialized = reservations.map((res) => ({
      ...res,
      product: {
        ...res.product,
        price: res.product.price.toString(),
      },
    }));

    return Response.json({ success: true, data: serialized }, { status: 200 });
  } catch (err) {
    console.error('[GET /api/reservations]', err);
    return Response.json(
      { error: 'INTERNAL_SERVER_ERROR', message: 'Failed to fetch reservations' },
      { status: 500 },
    );
  }
}

export const dynamic = 'force-dynamic';
