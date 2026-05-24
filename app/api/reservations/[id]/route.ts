import { NextRequest } from 'next/server';
import { reservationService } from '@/services/reservation.service';
import { AppError } from '@/lib/errors';

/**
 * GET /api/reservations/:id
 * Fetch a single reservation (used by the checkout page).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const reservation = await reservationService.getReservation(params.id);
    return Response.json({ data: reservation }, { status: 200 });
  } catch (err) {
    if (err instanceof AppError) {
      return Response.json(
        { error: err.code, message: err.message },
        { status: err.statusCode },
      );
    }
    console.error('[GET /api/reservations/:id]', err);
    return Response.json(
      { error: 'INTERNAL_SERVER_ERROR', message: 'Failed to fetch reservation' },
      { status: 500 },
    );
  }
}

export const dynamic = 'force-dynamic';
