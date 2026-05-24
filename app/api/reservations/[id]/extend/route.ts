import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const reservationId = params.id;

    const updated = await prisma.$transaction(async (tx) => {
      const reservation = await tx.reservation.findUnique({
        where: { id: reservationId },
      });

      if (!reservation) {
        throw new Error('Reservation not found');
      }

      if (reservation.status !== 'PENDING') {
        throw new Error(`Only pending reservations can be extended. Current status is ${reservation.status}.`);
      }

      const metadata = (reservation.metadata as Record<string, any>) ?? {};
      if (metadata.extensionCount && metadata.extensionCount >= 1) {
        throw new Error('This reservation has already been extended the maximum number of times (1).');
      }

      // Add 5 minutes to expiration
      const currentExpires = new Date(reservation.expiresAt);
      const newExpires = new Date(currentExpires.getTime() + 5 * 60 * 1000);

      const timeline = Array.isArray(metadata.timeline) ? [...metadata.timeline] : [];
      timeline.push({
        event: 'Hold Extended',
        timestamp: new Date().toISOString(),
        actor: 'Customer',
        description: 'Checkout window extended by 5 minutes.',
      });

      return await tx.reservation.update({
        where: { id: reservationId },
        data: {
          expiresAt: newExpires,
          metadata: {
            ...metadata,
            extensionCount: 1,
            timeline,
          },
        },
        include: {
          product: true,
          warehouse: true,
        },
      });
    });

    return NextResponse.json({
      success: true,
      data: updated,
      message: 'Reservation hold extended by 5 minutes.',
    });
  } catch (error) {
    console.error('[POST /api/reservations/[id]/extend] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to extend reservation' },
      { status: 400 }
    );
  }
}

export const dynamic = 'force-dynamic';
