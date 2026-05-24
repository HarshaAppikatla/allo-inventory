import { prisma } from './prisma';

// ---------------------------------------------------------------------------
// Idempotency layer
//
// When a client supplies an `Idempotency-Key` header, we:
// 1. Look up the key in idempotency_records.
// 2. If found, replay the stored status code + body (no side-effects).
// 3. If not found, execute the operation and store the result.
//
// This prevents duplicate charges / double-reservations on network retries.
// ---------------------------------------------------------------------------

export interface StoredResponse {
  statusCode: number;
  responseBody: unknown;
}

/**
 * Look up a previously stored idempotency record.
 * Returns null if the key has never been seen.
 */
export async function getIdempotencyRecord(
  key: string,
): Promise<StoredResponse | null> {
  const record = await prisma.idempotencyRecord.findUnique({
    where: { key },
    select: { statusCode: true, responseBody: true },
  });

  if (!record) return null;

  return {
    statusCode: record.statusCode,
    responseBody: record.responseBody,
  };
}

/**
 * Persist an idempotency record so future requests with the same key
 * receive the cached response.
 *
 * Uses upsert so concurrent inserts are safe (only the first write wins).
 */
export async function storeIdempotencyRecord(
  key: string,
  statusCode: number,
  responseBody: unknown,
): Promise<void> {
  await prisma.idempotencyRecord
    .upsert({
      where: { key },
      update: {}, // never overwrite an existing record
      create: {
        key,
        statusCode,
        responseBody: responseBody as any,
      },
    })
    .catch((err) => {
      // If this fails, it's non-fatal – the operation already completed.
      // Log and continue; the client will just re-execute on retry.
      console.error('[idempotency] Failed to store record:', err);
    });
}

/**
 * Build a JSON Response from a stored idempotency record,
 * including the Idempotency-Replayed header so clients can detect replays.
 */
export function buildReplayResponse(stored: StoredResponse): Response {
  return Response.json(stored.responseBody, {
    status: stored.statusCode,
    headers: {
      'Idempotency-Replayed': 'true',
    },
  });
}
