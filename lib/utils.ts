import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Utility for conditionally joining class names with Tailwind deduplication */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format price in INR */
export function formatPrice(price: number | string): string {
  const num = typeof price === 'string' ? parseFloat(price) : price;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

/** Format a date for display */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
}

/** Calculate seconds remaining until a given date */
export function secondsUntil(date: Date | string): number {
  const target = typeof date === 'string' ? new Date(date) : date;
  return Math.max(0, Math.floor((target.getTime() - Date.now()) / 1000));
}

/** Format seconds as MM:SS */
export function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

/** Generate a random idempotency key for client-side use */
export function generateIdempotencyKey(): string {
  return `idk_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
