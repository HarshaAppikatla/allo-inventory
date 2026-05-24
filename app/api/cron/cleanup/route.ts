import { NextRequest } from 'next/server';
import { reservationService } from '@/services/reservation.service';

/**
 * GET /api/cron/cleanup
 *
 * Vercel Cron endpoint - called every 5 minutes (see vercel.json).
 * Expires all PENDING reservations whose expiresAt is in the past,
 * and returns their held stock to the available pool.
 *
 * Authentication: Bearer token via CRON_SECRET env var.
 * Vercel automatically sends this header when invoking cron jobs.
 */
export async function GET(req: NextRequest) {
  // — Authenticate the cron invocation —————————————————————————
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  // — Run the cleanup ————————————————————————————————
  try {
    const start = Date.now();
    const { expired } = await reservationService.expireStaleReservations();
    const durationMs = Date.now() - start;

    console.log(
      `[cron/cleanup] Expired ${expired} reservation(s) in ${durationMs}ms`,
    );

    return Response.json(
      {
        ok: true,
        expired,
        durationMs,
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    );
  } catch (err) {
    console.error('[cron/cleanup] Fatal error:', err);
    return Response.json(
      { error: 'INTERNAL_SERVER_ERROR', message: 'Cleanup job failed' },
      { status: 500 },
    );
  }
}

export const dynamic = 'force-dynamic';
