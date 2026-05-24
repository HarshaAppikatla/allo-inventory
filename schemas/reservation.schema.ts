import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared Zod schemas – used by both API routes (server-side validation)
// and React forms (client-side validation).
// ---------------------------------------------------------------------------

export const CreateReservationSchema = z.object({
  productId: z.string().min(1, 'Product ID is required'),
  warehouseId: z.string().min(1, 'Warehouse ID is required'),
  quantity: z
    .number()
    .int('Quantity must be a whole number')
    .min(1, 'Quantity must be at least 1')
    .max(10, 'Cannot reserve more than 10 units at a time'),
  metadata: z
    .record(z.unknown())
    .optional()
    .describe('Optional client metadata, e.g. user_id, session_id'),
});

export type CreateReservationInput = z.infer<typeof CreateReservationSchema>;

export const ConfirmReservationSchema = z.object({
  // Optional payment reference for audit trail
  paymentReference: z.string().optional(),
});

export type ConfirmReservationInput = z.infer<typeof ConfirmReservationSchema>;

export const ReleaseReservationSchema = z.object({
  reason: z
    .enum(['PAYMENT_FAILED', 'USER_CANCELLED', 'TIMEOUT', 'OTHER', 'ADMIN_FORCE_RELEASE'])
    .optional(),
});

export type ReleaseReservationInput = z.infer<typeof ReleaseReservationSchema>;
