import { NextRequest, NextResponse } from 'next/server';
import { reservationService } from '@/services/reservation.service';
import { authorizeRequest } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const auth = await authorizeRequest(req, ['ADMIN']);
  if (!auth.authorized) return auth.response!;

  try {
    const start = Date.now();
    const { expired } = await reservationService.expireStaleReservations();
    const durationMs = Date.now() - start;

    console.log(`[admin/cleanup] Manual cleanup triggered. Expired ${expired} reservations in ${durationMs}ms`);

    return NextResponse.json({
      success: true,
      expired,
      durationMs,
      message: `Successfully expired ${expired} stale reservation(s).`,
    });
  } catch (error) {
    console.error('[POST /api/admin/cleanup] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to run manual cleanup' },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';
