import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { authorizeRequest } from '@/lib/auth';

const FulfillmentSchema = z.object({
  state: z.enum(['PACKED', 'DISPATCHED', 'DELIVERED']),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await authorizeRequest(req, ['ADMIN', 'SERVICE_PROVIDER']);
  if (!auth.authorized) return auth.response!;

  try {
    const reservationId = params.id;
    const body = await req.json();
    const { state } = FulfillmentSchema.parse(body);

    const updated = await prisma.$transaction(async (tx) => {
      const reservation = await tx.reservation.findUnique({
        where: { id: reservationId },
      });

      if (!reservation) {
        throw new Error('Reservation not found');
      }

      if (reservation.status !== 'CONFIRMED') {
        throw new Error('Can only update fulfillment state for confirmed orders.');
      }

      const metadata = (reservation.metadata as Record<string, any>) ?? {};
      const timeline = Array.isArray(metadata.timeline) ? [...metadata.timeline] : [];
      
      const readableState = state.charAt(0) + state.slice(1).toLowerCase();

      timeline.push({
        event: `Order ${readableState}`,
        timestamp: new Date().toISOString(),
        actor: 'System',
        description: `Fulfillment advanced to: ${state.toLowerCase()}.`,
      });

      return await tx.reservation.update({
        where: { id: reservationId },
        data: {
          metadata: {
            ...metadata,
            fulfillmentState: state,
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
      message: `Fulfillment status updated to ${state}.`,
    });
  } catch (error) {
    console.error('[PATCH /api/operations/reservations/[id]/fulfillment] Error:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', issues: error.issues },
        { status: 422 }
      );
    }
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to update fulfillment state' },
      { status: 400 }
    );
  }
}

export const dynamic = 'force-dynamic';
