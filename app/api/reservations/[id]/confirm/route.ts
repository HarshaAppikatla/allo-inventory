import { NextRequest } from 'next/server';
import { ZodError } from 'zod';
import { ConfirmReservationSchema } from '@/schemas/reservation.schema';
import { reservationService } from '@/services/reservation.service';
import {
  getIdempotencyRecord,
  storeIdempotencyRecord,
  buildReplayResponse,
} from '@/lib/idempotency';
import { AppError, ReservationExpiredError } from '@/lib/errors';

/**
 * POST /api/reservations/:id/confirm
 *
 * Confirms a PENDING reservation (payment succeeded).
 * Permanently decrements inventory.
 *
 * Responses:
 *   200 OK  – reservation confirmed
 *   410 Gone – reservation expired
 *   404 Not Found – reservation not found
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const idempotencyKey = req.headers.get('idempotency-key') ?? undefined;

  if (idempotencyKey) {
    const cached = await getIdempotencyRecord(idempotencyKey);
    if (cached) return buildReplayResponse(cached);
  }

  let input = {};
  try {
    const raw = await req.json().catch(() => ({}));
    input = ConfirmReservationSchema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) {
      return Response.json(
        { error: 'VALIDATION_ERROR', message: 'Invalid request body', issues: err.issues },
        { status: 422 },
      );
    }
  }

  try {
    const reservation = await reservationService.confirmReservation(
      params.id,
      input,
      idempotencyKey,
    );

    const responseBody = { data: reservation };
    const statusCode = 200;

    if (idempotencyKey) {
      await storeIdempotencyRecord(idempotencyKey, statusCode, responseBody);
    }

    return Response.json(responseBody, { status: statusCode });
  } catch (err) {
    if (err instanceof ReservationExpiredError) {
      const responseBody = { error: err.code, message: err.message };
      const statusCode = 410;

      if (idempotencyKey) {
        await storeIdempotencyRecord(idempotencyKey, statusCode, responseBody);
      }

      return Response.json(responseBody, { status: statusCode });
    }

    if (err instanceof AppError) {
      return Response.json(
        { error: err.code, message: err.message },
        { status: err.statusCode },
      );
    }

    console.error('[POST /api/reservations/:id/confirm]', err);
    return Response.json(
      { error: 'INTERNAL_SERVER_ERROR', message: 'Confirm failed' },
      { status: 500 },
    );
  }
}

export const dynamic = 'force-dynamic';
