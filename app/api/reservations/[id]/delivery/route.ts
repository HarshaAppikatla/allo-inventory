import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const DeliverySchema = z.object({
  deliveryDate: z.string().min(1, 'Date is required'),
  deliverySlot: z.string().min(1, 'Time slot is required'),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const reservationId = params.id;
    const body = await req.json();
    const input = DeliverySchema.parse(body);

    const updated = await prisma.$transaction(async (tx) => {
      const reservation = await tx.reservation.findUnique({
        where: { id: reservationId },
      });

      if (!reservation) {
        throw new Error('Reservation not found');
      }

      const metadata = (reservation.metadata as Record<string, any>) ?? {};
      const timeline = Array.isArray(metadata.timeline) ? [...metadata.timeline] : [];
      
      const oldSlot = metadata.deliveryDate ? `${metadata.deliveryDate} (${metadata.deliverySlot})` : 'None';
      
      timeline.push({
        event: 'Slot Scheduled',
        timestamp: new Date().toISOString(),
        actor: 'Customer',
        description: `Scheduled delivery slot from ${oldSlot} to ${input.deliveryDate} (${input.deliverySlot}).`,
      });

      return await tx.reservation.update({
        where: { id: reservationId },
        data: {
          metadata: {
            ...metadata,
            deliveryDate: input.deliveryDate,
            deliverySlot: input.deliverySlot,
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
      message: 'Delivery slot scheduled successfully.',
    });
  } catch (error) {
    console.error('[PATCH /api/reservations/[id]/delivery] Error:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', issues: error.issues },
        { status: 422 }
      );
    }
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to schedule delivery' },
      { status: 400 }
    );
  }
}

export const dynamic = 'force-dynamic';
