import { NextRequest } from 'next/server';
import { ZodError } from 'zod';
import { ReleaseReservationSchema } from '@/schemas/reservation.schema';
import { reservationService } from '@/services/reservation.service';
import { AppError } from '@/lib/errors';

/**
 * POST /api/reservations/:id/release
 *
 * Releases a PENDING reservation early (user cancelled / payment failed).
 * Returns held stock to the available pool.
 *
 * Responses:
 *   200 OK  – reservation released
 *   409 Conflict – cannot release a confirmed reservation
 *   404 Not Found – reservation not found
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  let input = {};
  try {
    const raw = await req.json().catch(() => ({}));
    input = ReleaseReservationSchema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) {
      return Response.json(
        { error: 'VALIDATION_ERROR', message: 'Invalid request body', issues: err.issues },
        { status: 422 },
      );
    }
  }

  try {
    const reservation = await reservationService.releaseReservation(
      params.id,
      input,
    );

    return Response.json({ data: reservation }, { status: 200 });
  } catch (err) {
    if (err instanceof AppError) {
      return Response.json(
        { error: err.code, message: err.message },
        { status: err.statusCode },
      );
    }

    console.error('[POST /api/reservations/:id/release]', err);
    return Response.json(
      { error: 'INTERNAL_SERVER_ERROR', message: 'Release failed' },
      { status: 500 },
    );
  }
}

export const dynamic = 'force-dynamic';
