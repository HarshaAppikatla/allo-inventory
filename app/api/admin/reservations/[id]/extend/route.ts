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

      // Add 5 minutes to the expiration date
      const currentExpires = new Date(reservation.expiresAt);
      const newExpires = new Date(currentExpires.getTime() + 5 * 60 * 1000);

      const currentMetadata = (reservation.metadata as Record<string, any>) ?? {};
      const timeline = Array.isArray(currentMetadata.timeline) ? [...currentMetadata.timeline] : [];
      timeline.push({
        event: 'Extended',
        timestamp: new Date().toISOString(),
        actor: 'Admin',
        description: 'Hold window extended by 5 minutes.',
      });

      const extended = await tx.reservation.update({
        where: { id: reservationId },
        data: {
          expiresAt: newExpires,
          metadata: {
            ...currentMetadata,
            timeline,
          },
        },
        include: {
          product: { select: { name: true } },
          warehouse: { select: { name: true } },
        },
      });

      return extended;
    });

    return NextResponse.json({
      success: true,
      data: updated,
      message: `Reservation hold extended by 5 minutes. New expiration: ${new Date(updated.expiresAt).toLocaleTimeString()}`,
    });
  } catch (error) {
    console.error('[POST /api/admin/reservations/[id]/extend] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to extend reservation hold',
      },
      { status: 400 }
    );
  }
}

export const dynamic = 'force-dynamic';
