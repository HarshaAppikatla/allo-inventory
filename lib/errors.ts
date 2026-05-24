/**
 * Domain-specific error classes.
 *
 * Using typed errors instead of string comparisons keeps error handling
 * explicit, type-safe, and easy to extend.
 */

export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'AppError';
    // Fix prototype chain for instanceof checks in compiled JS
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 404 – resource not found */
export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

/** 409 – stock not sufficient to fulfil the reservation */
export class InsufficientStockError extends AppError {
  constructor(message = 'Insufficient stock available') {
    super(message, 'INSUFFICIENT_STOCK', 409);
    this.name = 'InsufficientStockError';
  }
}

/** 410 – reservation no longer valid (expired or already released) */
export class ReservationExpiredError extends AppError {
  constructor(message = 'Reservation has expired') {
    super(message, 'RESERVATION_EXPIRED', 410);
    this.name = 'ReservationExpiredError';
  }
}

/** 409 – reservation is in an incompatible state for the requested transition */
export class InvalidStateTransitionError extends AppError {
  constructor(message: string) {
    super(message, 'INVALID_STATE_TRANSITION', 409);
    this.name = 'InvalidStateTransitionError';
  }
}

/** 422 – validation failed */
export class ValidationError extends AppError {
  constructor(message: string, public readonly issues?: unknown) {
    super(message, 'VALIDATION_ERROR', 422);
    this.name = 'ValidationError';
  }
}

/** 400 – bad request */
export class BadRequestError extends AppError {
  constructor(message: string) {
    super(message, 'BAD_REQUEST', 400);
    this.name = 'BadRequestError';
  }
}

/** 401 – unauthorized */
export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 'UNAUTHORIZED', 401);
    this.name = 'UnauthorizedError';
  }
}
