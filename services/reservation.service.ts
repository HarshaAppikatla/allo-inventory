import { Prisma, ReservationStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  InsufficientStockError,
  InvalidStateTransitionError,
  NotFoundError,
  ReservationExpiredError,
} from '@/lib/errors';
import type {
  CreateReservationInput,
  ConfirmReservationInput,
  ReleaseReservationInput,
} from '@/schemas/reservation.schema';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RESERVATION_TTL_MINUTES = parseInt(
  process.env.RESERVATION_TTL_MINUTES ?? '10',
  10,
);

const RESERVATION_TTL_MS = RESERVATION_TTL_MINUTES * 60 * 1000;

// ---------------------------------------------------------------------------
// Types for raw SQL results
// ---------------------------------------------------------------------------

interface InventoryStockRow {
  id: string;
  total_quantity: bigint;
  reserved_quantity: bigint;
}

// ---------------------------------------------------------------------------
// Reservation Service
// ---------------------------------------------------------------------------

export const reservationService = {
  /**
   * Create a new reservation for a product at a specific warehouse.
   *
   * CONCURRENCY GUARANTEE
   * ---------------------
   * We use a PostgreSQL-level row lock (SELECT ... FOR UPDATE) inside a
   * serialised transaction. This means:
   *
   * 1. Two concurrent requests both enter the transaction.
   * 2. Only ONE acquires the exclusive lock on the InventoryStock row.
   * 3. The other waits until the first commits or rolls back.
   * 4. After the first commits (reservedQuantity now decremented),
   *    the second reads the updated value and finds available < requested.
   * 5. The second throws InsufficientStockError → caller returns HTTP 409.
   *
   * This prevents any overselling even under extreme concurrent load.
   */
  async createReservation(
    input: CreateReservationInput,
    idempotencyKey?: string,
  ) {
    return await prisma.$transaction(
      async (tx) => {
        // -------------------------------------------------------------------
        // Step 1: Acquire a row-level lock on the inventory record.
        //
        // $queryRaw is required here because Prisma does not expose
        // SELECT ... FOR UPDATE through its fluent API.
        // -------------------------------------------------------------------
        const rows = await tx.$queryRaw<InventoryStockRow[]>(
          Prisma.sql`
            SELECT id, total_quantity, reserved_quantity
            FROM inventory_stocks
            WHERE product_id = ${input.productId}
              AND warehouse_id = ${input.warehouseId}
            FOR UPDATE
          `,
        );

        if (rows.length === 0) {
          throw new NotFoundError(
            'Inventory record not found for this product/warehouse combination',
          );
        }

        const stock = rows[0];
        const totalQty = Number(stock.total_quantity);
        const reservedQty = Number(stock.reserved_quantity);
        const availableQty = totalQty - reservedQty;

        // -------------------------------------------------------------------
        // Step 2: Check availability.
        // -------------------------------------------------------------------
        if (availableQty < input.quantity) {
          throw new InsufficientStockError(
            `Only ${availableQty} unit(s) available at this warehouse (requested ${input.quantity})`,
          );
        }

        // -------------------------------------------------------------------
        // Step 3: Atomically increment reservedQuantity.
        //
        // Using $executeRaw for an atomic UPDATE avoids a read-modify-write
        // race between transactions. The row lock above ensures only one
        // transaction reaches this point at a time, but the atomic update
        // is a good defence-in-depth pattern.
        // -------------------------------------------------------------------
        await tx.$executeRaw(
          Prisma.sql`
            UPDATE inventory_stocks
            SET reserved_quantity = reserved_quantity + ${input.quantity}
            WHERE id = ${stock.id}
          `,
        );

        // -------------------------------------------------------------------
        // Step 4: Fetch product price for snapshotting.
        // -------------------------------------------------------------------
        const product = await tx.product.findUnique({
          where: { id: input.productId },
          select: { price: true },
        });

        if (!product) {
          throw new NotFoundError(`Product ${input.productId} not found`);
        }

        // -------------------------------------------------------------------
        // Step 5: Create the reservation record.
        // -------------------------------------------------------------------
        const expiresAt = new Date(Date.now() + RESERVATION_TTL_MS);

        const initialTimeline = [
          {
            event: 'Created',
            timestamp: new Date().toISOString(),
            actor: 'Customer',
            description: 'Selected stock unit(s) temporarily locked for purchase.',
          },
        ];

        const reservation = await tx.reservation.create({
          data: {
            productId: input.productId,
            warehouseId: input.warehouseId,
            quantity: input.quantity,
            unitPrice: product.price,
            status: ReservationStatus.PENDING,
            expiresAt,
            idempotencyKey: idempotencyKey ?? null,
            metadata: {
              timeline: initialTimeline,
              ...(input.metadata as Record<string, any> ?? {}),
            } as Prisma.JsonObject,
          },
          include: {
            product: true,
            warehouse: true,
          },
        });

        return reservation;
      },
      {
        // READ COMMITTED is sufficient here because we use SELECT FOR UPDATE
        // to serialize access to the inventory row.
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        timeout: 10_000, // 10 s max
      },
    );
  },

  /**
   * Fetch a single reservation by ID.
   */
  async getReservation(id: string) {
    const reservation = await prisma.reservation.findUnique({
      where: { id },
      include: { product: true, warehouse: true },
    });

    if (!reservation) {
      throw new NotFoundError(`Reservation ${id} not found`);
    }

    return reservation;
  },

  /**
   * Confirm a reservation after successful payment.
   *
   * Permanently decrements total_quantity and reserved_quantity so the
   * units are removed from the warehouse's available pool.
   *
   * Returns HTTP 410 if the reservation has expired.
   */
  async confirmReservation(
    id: string,
    _input?: ConfirmReservationInput,
    idempotencyKey?: string,
  ) {
    return await prisma.$transaction(
      async (tx) => {
        const reservation = await tx.reservation.findUnique({
          where: { id },
          include: { product: true, warehouse: true },
        });

        if (!reservation) {
          throw new NotFoundError(`Reservation ${id} not found`);
        }

        // Idempotent: already confirmed
        if (reservation.status === ReservationStatus.CONFIRMED) {
          return reservation;
        }

        // Cannot confirm a released or expired reservation
        if (
          reservation.status === ReservationStatus.RELEASED ||
          reservation.status === ReservationStatus.EXPIRED
        ) {
          throw new ReservationExpiredError(
            `Reservation is ${reservation.status.toLowerCase()} and cannot be confirmed`,
          );
        }

        // Check wall-clock expiry (PENDING but past expiresAt)
        if (new Date() > reservation.expiresAt) {
          // Mark as expired and return the stock
          await tx.$executeRaw(
            Prisma.sql`
              UPDATE inventory_stocks
              SET reserved_quantity = GREATEST(0, reserved_quantity - ${reservation.quantity})
              WHERE product_id = ${reservation.productId}
                AND warehouse_id = ${reservation.warehouseId}
            `,
          );

          const currentMetadata = (reservation.metadata as Record<string, any>) ?? {};
          const timeline = Array.isArray(currentMetadata.timeline) ? [...currentMetadata.timeline] : [];
          timeline.push({
            event: 'Expired',
            timestamp: new Date().toISOString(),
            actor: 'System',
            description: 'Hold expired during checkout confirmation.',
          });

          await tx.reservation.update({
            where: { id },
            data: {
              status: ReservationStatus.EXPIRED,
              releasedAt: new Date(),
              metadata: {
                ...currentMetadata,
                timeline,
              } as Prisma.JsonObject,
            },
          });

          throw new ReservationExpiredError(
            'Reservation expired before payment was confirmed',
          );
        }

        // Permanently remove from inventory (decrement both total + reserved)
        await tx.$executeRaw(
          Prisma.sql`
            UPDATE inventory_stocks
            SET
              total_quantity    = GREATEST(0, total_quantity    - ${reservation.quantity}),
              reserved_quantity = GREATEST(0, reserved_quantity - ${reservation.quantity})
            WHERE product_id = ${reservation.productId}
              AND warehouse_id = ${reservation.warehouseId}
          `,
        );

        const currentMetadata = (reservation.metadata as Record<string, any>) ?? {};
        const timeline = Array.isArray(currentMetadata.timeline) ? [...currentMetadata.timeline] : [];
        timeline.push({
          event: 'Confirmed',
          timestamp: new Date().toISOString(),
          actor: 'Customer',
          description: 'Payment confirmed. Physical stock permanently decremented.',
        });

        const confirmed = await tx.reservation.update({
          where: { id },
          data: {
            status: ReservationStatus.CONFIRMED,
            confirmedAt: new Date(),
            metadata: {
              ...currentMetadata,
              timeline,
            } as Prisma.JsonObject,
          },
          include: { product: true, warehouse: true },
        });

        return confirmed;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  },

  /**
   * Release a reservation early (user cancelled or payment failed).
   *
   * Returns the stock to the available pool.
   * Safe to call multiple times (idempotent).
   */
  async releaseReservation(id: string, _input?: ReleaseReservationInput) {
    return await prisma.$transaction(
      async (tx) => {
        const reservation = await tx.reservation.findUnique({
          where: { id },
          include: { product: true, warehouse: true },
        });

        if (!reservation) {
          throw new NotFoundError(`Reservation ${id} not found`);
        }

        // Idempotent: already released or expired
        if (
          reservation.status === ReservationStatus.RELEASED ||
          reservation.status === ReservationStatus.EXPIRED
        ) {
          return reservation;
        }

        if (reservation.status === ReservationStatus.CONFIRMED) {
          throw new InvalidStateTransitionError(
            'A confirmed reservation cannot be released. Raise a return/refund instead.',
          );
        }

        // Return the held units to the available pool
        await tx.$executeRaw(
          Prisma.sql`
            UPDATE inventory_stocks
            SET reserved_quantity = GREATEST(0, reserved_quantity - ${reservation.quantity})
            WHERE product_id = ${reservation.productId}
              AND warehouse_id = ${reservation.warehouseId}
          `,
        );

        const currentMetadata = (reservation.metadata as Record<string, any>) ?? {};
        const timeline = Array.isArray(currentMetadata.timeline) ? [...currentMetadata.timeline] : [];
        const isForceRelease = _input?.reason === 'ADMIN_FORCE_RELEASE';
        timeline.push({
          event: isForceRelease ? 'Force Released' : 'Cancelled',
          timestamp: new Date().toISOString(),
          actor: isForceRelease ? 'Admin' : 'Customer',
          description: isForceRelease 
            ? 'Reservation manually cancelled by admin.' 
            : 'Hold cancelled early by user.',
        });

        const released = await tx.reservation.update({
          where: { id },
          data: {
            status: ReservationStatus.RELEASED,
            releasedAt: new Date(),
            metadata: {
              ...currentMetadata,
              timeline,
            } as Prisma.JsonObject,
          },
          include: { product: true, warehouse: true },
        });

        return released;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  },

  /**
   * Background cleanup: expire all PENDING reservations past their expiresAt.
   *
   * Called by the Vercel Cron job at /api/cron/cleanup every 5 minutes.
   *
   * Returns the number of reservations that were expired.
   */
  async expireStaleReservations(): Promise<{ expired: number }> {
    const now = new Date();

    // Fetch all stale reservations
    const stale = await prisma.reservation.findMany({
      where: {
        status: ReservationStatus.PENDING,
        expiresAt: { lt: now },
      },
      select: {
        id: true,
        productId: true,
        warehouseId: true,
        quantity: true,
      },
    });

    if (stale.length === 0) return { expired: 0 };

    let expired = 0;

    // Process each in its own transaction so one failure doesn't block others
    for (const r of stale) {
      try {
        await prisma.$transaction(async (tx) => {
          // Use conditional update to handle TOCTOU: only update if still PENDING
          // Fetch existing metadata to append timeline
          const resObj = await tx.reservation.findUnique({
            where: { id: r.id },
            select: { metadata: true }
          });
          const currentMetadata = (resObj?.metadata as Record<string, any>) ?? {};
          const timeline = Array.isArray(currentMetadata.timeline) ? [...currentMetadata.timeline] : [];
          timeline.push({
            event: 'Expired',
            timestamp: now.toISOString(),
            actor: 'System',
            description: 'Hold expired. Stock returned by background cleanup.',
          });

          const updated = await tx.reservation.updateMany({
            where: { id: r.id, status: ReservationStatus.PENDING },
            data: {
              status: ReservationStatus.EXPIRED,
              releasedAt: now,
              metadata: {
                ...currentMetadata,
                timeline,
              } as Prisma.JsonObject,
            },
          });

          // If we successfully flipped the status, return the stock
          if (updated.count > 0) {
            await tx.$executeRaw(
              Prisma.sql`
                UPDATE inventory_stocks
                SET reserved_quantity = GREATEST(0, reserved_quantity - ${r.quantity})
                WHERE product_id = ${r.productId}
                  AND warehouse_id = ${r.warehouseId}
              `,
            );
            expired++;
          }
        });
      } catch (err) {
        console.error(`[cron] Failed to expire reservation ${r.id}:`, err);
      }
    }

    return { expired };
  },
};
